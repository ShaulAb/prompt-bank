/**
 * Team Sync Service - Extension-level (global) sync for team prompts
 *
 * Implements last-writer-wins sync for team prompts across multiple members.
 * Unlike personal SyncService (three-way merge), team sync uses a simpler
 * strategy since multiple users collaborate on the same prompt library.
 *
 * Key differences from personal sync:
 * - Last-writer-wins conflict resolution (remote always wins on conflict)
 * - Role-based write checks (editor+ to upload, admin+ to delete)
 * - No workspace ID binding (team prompts are global)
 * - Single sync cycle for all teams
 */

import * as vscode from 'vscode';
import type { Prompt, TemplateVariable } from '../models/prompt';
import type { Team } from '../models/team';
import { canEdit } from '../models/team';
import type { RemotePrompt, PromptSyncInfo } from '../models/syncState';
import { SupabaseClientManager } from './supabaseClient';
import { AuthService } from './authService';
import { TeamService } from './teamService';
import { computeContentHash, matchesHash } from '../utils/contentHash';
import { getDeviceInfo } from '../utils/deviceId';

/**
 * Mutable sync state for team prompts (simpler than personal SyncState)
 */
interface TeamSyncState {
  promptSyncMap: Record<string, PromptSyncInfo>;
  lastSyncedAt?: Date;
}

/**
 * Result of a team sync operation
 */
export interface TeamSyncResult {
  teamId: string;
  teamName: string;
  downloaded: number;
  uploaded: number;
  deleted: number;
  conflicts: number;
  errors: string[];
}

export class TeamSyncService {
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly authService: AuthService,
    private readonly teamService: TeamService
  ) {}

  /**
   * Sync prompts for all teams the user belongs to
   */
  async syncAllTeams(): Promise<TeamSyncResult[]> {
    const teams = this.teamService.getTeams();
    if (teams.length === 0) {
      return [];
    }

    const results: TeamSyncResult[] = [];

    for (const team of teams) {
      try {
        const result = await this.syncTeam(team);
        results.push(result);
      } catch (error) {
        results.push({
          teamId: team.id,
          teamName: team.name,
          downloaded: 0,
          uploaded: 0,
          deleted: 0,
          conflicts: 0,
          errors: [error instanceof Error ? error.message : String(error)],
        });
      }
    }

    return results;
  }

  /**
   * Sync prompts for a single team
   */
  async syncTeam(team: Team): Promise<TeamSyncResult> {
    const result: TeamSyncResult = {
      teamId: team.id,
      teamName: team.name,
      downloaded: 0,
      uploaded: 0,
      deleted: 0,
      conflicts: 0,
      errors: [],
    };

    const { storage, syncState: syncStateStorage } = await this.teamService.getTeamStorage(team.id);

    // 1. Fetch local prompts and sync state
    const localPrompts = await storage.list();
    const savedState = await syncStateStorage.getSyncState();

    // Build mutable team sync state from persisted state
    const syncState: TeamSyncState = {
      promptSyncMap: savedState ? { ...savedState.promptSyncMap } : {},
    };
    if (savedState?.lastSyncedAt) {
      syncState.lastSyncedAt = savedState.lastSyncedAt;
    }

    // 2. Fetch remote team prompts
    const remotePrompts = await this.fetchTeamPrompts(team.id, true);

    // 3. Compute sync plan (last-writer-wins)
    const plan = this.computeTeamSyncPlan(localPrompts, remotePrompts, syncState, team);

    // 4. Download remote changes to local
    for (const remote of plan.toDownload) {
      try {
        const localPrompt = this.remoteToLocal(remote, team.id);
        await storage.save(localPrompt);
        syncState.promptSyncMap[localPrompt.id] = {
          cloudId: remote.cloud_id,
          version: remote.version,
          lastSyncedContentHash: remote.content_hash,
          lastSyncedAt: new Date(),
          isDeleted: false,
        };
        result.downloaded++;
      } catch (err) {
        result.errors.push(`Download failed for ${remote.cloud_id}: ${err}`);
      }
    }

    // 5. Upload local changes (editor+ only)
    if (canEdit(team.role)) {
      for (const local of plan.toUpload) {
        try {
          const syncInfo = syncState.promptSyncMap[local.id];
          const uploadResult = await this.uploadTeamPrompt(local, team.id, syncInfo);
          syncState.promptSyncMap[local.id] = {
            cloudId: uploadResult.cloudId,
            version: uploadResult.version,
            lastSyncedContentHash: computeContentHash(local),
            lastSyncedAt: new Date(),
            isDeleted: false,
          };
          result.uploaded++;
        } catch (err) {
          result.errors.push(`Upload failed for ${local.id}: ${err}`);
        }
      }
    }

    // 6. Delete locally prompts that were deleted remotely
    for (const deletion of plan.toDeleteLocally) {
      try {
        await storage.delete(deletion.localPromptId);
        if (syncState.promptSyncMap[deletion.localPromptId]) {
          syncState.promptSyncMap[deletion.localPromptId].isDeleted = true;
        }
        result.deleted++;
      } catch (err) {
        result.errors.push(`Local delete failed for ${deletion.localPromptId}: ${err}`);
      }
    }

    // 7. Save updated sync state - persist via syncStateStorage
    // We save the promptSyncMap back through the storage layer
    // For team sync, we only need the promptSyncMap persisted
    syncState.lastSyncedAt = new Date();
    if (savedState) {
      // Update the existing state with our mutable changes
      const updatedState = {
        ...savedState,
        promptSyncMap: Object.freeze(syncState.promptSyncMap),
        lastSyncedAt: syncState.lastSyncedAt,
      };
      await syncStateStorage.saveSyncState(updatedState);
    }

    return result;
  }

  /**
   * Compute team sync plan using last-writer-wins strategy
   *
   * Remote always wins on conflict since team prompts are collaborative.
   */
  private computeTeamSyncPlan(
    localPrompts: readonly Prompt[],
    remotePrompts: readonly RemotePrompt[],
    syncState: TeamSyncState,
    team: Team
  ) {
    const plan = {
      toDownload: [] as RemotePrompt[],
      toUpload: [] as Prompt[],
      toDeleteLocally: [] as Array<{ localPromptId: string; cloudId: string }>,
    };

    const localMap = new Map(localPrompts.map((p) => [p.id, p]));

    // Build cloudId -> localId lookup from sync state
    const cloudIdToLocalId = new Map<string, string>();
    for (const [promptId, info] of Object.entries(syncState.promptSyncMap)) {
      if (info.cloudId) {
        cloudIdToLocalId.set(info.cloudId, promptId);
      }
    }

    // Active remote prompts (not deleted)
    const activeRemote = remotePrompts.filter((r) => !r.deleted_at);
    const deletedRemote = remotePrompts.filter((r) => r.deleted_at);

    // Process active remote prompts
    for (const remote of activeRemote) {
      const localId = cloudIdToLocalId.get(remote.cloud_id);
      const local = localId ? localMap.get(localId) : undefined;

      if (!local) {
        // New remote prompt or previously unknown - download
        plan.toDownload.push(remote);
        continue;
      }

      // Both exist - check if remote is newer (last-writer-wins)
      const syncInfo = syncState.promptSyncMap[local.id];
      const lastSyncHash = syncInfo?.lastSyncedContentHash;
      const remoteHash = remote.content_hash;

      const localChanged = lastSyncHash ? !matchesHash(local, lastSyncHash) : false;
      const remoteChanged = lastSyncHash ? remoteHash !== lastSyncHash : false;

      if (remoteChanged && localChanged) {
        // Conflict - remote wins (last-writer-wins for team prompts)
        plan.toDownload.push(remote);
      } else if (remoteChanged) {
        // Only remote changed - download
        plan.toDownload.push(remote);
      } else if (localChanged && canEdit(team.role)) {
        // Only local changed and user can edit - upload
        plan.toUpload.push(local);
      }
      // else: no changes - skip
    }

    // Process remote deletions - delete locally if known
    for (const remote of deletedRemote) {
      const localId = cloudIdToLocalId.get(remote.cloud_id);
      if (localId && localMap.has(localId)) {
        plan.toDeleteLocally.push({ localPromptId: localId, cloudId: remote.cloud_id });
      }
    }

    // Process local-only prompts (no cloudId in sync state) - upload as new
    if (canEdit(team.role)) {
      for (const local of localPrompts) {
        const syncInfo = syncState.promptSyncMap[local.id];
        if (!syncInfo?.cloudId) {
          plan.toUpload.push(local);
        }
      }
    }

    return plan;
  }

  /**
   * Fetch team prompts from the backend
   */
  private async fetchTeamPrompts(teamId: string, includeDeleted = false): Promise<RemotePrompt[]> {
    const supabase = SupabaseClientManager.get();

    const { data, error } = await supabase.functions.invoke('get-team-prompts', {
      body: { teamId, includeDeleted },
    });

    if (error) {
      const errorContext = (error as { context?: { status?: number } }).context;
      if (errorContext?.status === 401) {
        await this.authService.clearInvalidTokens();
        throw new Error('Your session has expired. Please sign in again.');
      }
      if (errorContext?.status === 403) {
        throw new Error('You are not a member of this team.');
      }
      throw new Error(`Failed to fetch team prompts: ${error.message}`);
    }

    return (data as { prompts: RemotePrompt[] }).prompts || [];
  }

  /**
   * Upload a prompt to a team
   */
  private async uploadTeamPrompt(
    prompt: Prompt,
    teamId: string,
    syncInfo?: PromptSyncInfo
  ): Promise<{ cloudId: string; version: number }> {
    const supabase = SupabaseClientManager.get();
    const contentHash = computeContentHash(prompt);
    const deviceInfo = await getDeviceInfo(this.context);

    const body = {
      teamId,
      cloudId: syncInfo?.cloudId,
      expectedVersion: syncInfo?.version,
      contentHash,
      local_id: prompt.id,
      title: prompt.title,
      content: prompt.content,
      description: prompt.description || null,
      category: prompt.category,
      prompt_order: prompt.order || null,
      category_order: prompt.categoryOrder || null,
      variables: prompt.variables,
      sync_metadata: {
        lastModifiedDeviceId: deviceInfo.id,
        lastModifiedDeviceName: deviceInfo.name,
      },
    };

    const { data, error } = await supabase.functions.invoke('sync-team-prompt', {
      body,
    });

    if (error) {
      const errorContext = (error as { context?: { status?: number } }).context;
      if (errorContext?.status === 401) {
        await this.authService.clearInvalidTokens();
        throw new Error('Session expired during team sync.');
      }
      if (errorContext?.status === 403) {
        throw new Error('Insufficient permissions to edit team prompts.');
      }
      throw new Error(`Team prompt upload failed: ${error.message}`);
    }

    const uploadData = data as { cloudId: string; version: number };
    return { cloudId: uploadData.cloudId, version: uploadData.version };
  }

  /**
   * Convert a remote prompt to local Prompt format
   */
  private remoteToLocal(remote: RemotePrompt, teamId: string): Prompt {
    const meta = remote.metadata as { usageCount?: number; lastUsed?: string } | undefined;

    const metadata: Prompt['metadata'] = {
      created: new Date(remote.created_at),
      modified: new Date(remote.updated_at),
      usageCount: meta?.usageCount || 0,
    };
    if (meta?.lastUsed) {
      metadata.lastUsed = new Date(meta.lastUsed);
    }

    const prompt: Prompt = {
      id: remote.local_id || remote.cloud_id,
      title: remote.title,
      content: remote.content,
      category: remote.category || 'General',
      variables: (remote.variables as TemplateVariable[]) || [],
      teamId,
      metadata,
    };

    if (remote.description) {
      prompt.description = remote.description;
    }
    if (remote.prompt_order != null) {
      prompt.order = remote.prompt_order;
    }
    if (remote.category_order != null) {
      prompt.categoryOrder = remote.category_order;
    }

    return prompt;
  }

  /**
   * Dispose resources
   */
  async dispose(): Promise<void> {
    // No persistent resources to clean up
  }
}
