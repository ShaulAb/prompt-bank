/**
 * Team Sync Service - Extension-level (global) sync for team prompts
 *
 * Delegates to SyncEngine (shared three-way merge + conflict resolution) +
 * TeamTransport (team-mode I/O) for the actual sync work.
 *
 * Key difference from personal sync:
 * - Role-based write checks via TeamTransport.getWritePermission()
 * - No workspace ID binding (team prompts are global)
 * - No quota check, no workspace registration
 * - Uses the SAME three-way merge algorithm (no more last-writer-wins)
 */

import * as vscode from 'vscode';
import type { Prompt } from '../models/prompt';
import type { Team } from '../models/team';
import { AuthService } from './authService';
import { TeamService } from './teamService';
import { SupabaseClientManager } from './supabaseClient';
import { getDeviceInfo } from '../utils/deviceId';
import { SyncEngine, TeamTransport } from './sync';
import type { SyncEngineConfig, LocalPromptStore } from './sync';

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
   * Validate authentication and set session on Supabase client
   */
  private async validateAuthAndSetSession(): Promise<void> {
    const token = await this.authService.getValidAccessToken();
    const refreshToken = await this.authService.getRefreshToken();

    if (!token || !refreshToken) {
      throw new Error('Not authenticated. Please sign in first.');
    }

    await SupabaseClientManager.setSession(token, refreshToken);
  }

  /**
   * Sync prompts for all teams the user belongs to
   */
  async syncAllTeams(): Promise<TeamSyncResult[]> {
    const teams = this.teamService.getTeams();
    if (teams.length === 0) {
      return [];
    }

    // Set auth session once for all teams
    await this.validateAuthAndSetSession();

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
   * Sync prompts for a single team using SyncEngine + TeamTransport
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

    // Ensure auth session is set
    await this.validateAuthAndSetSession();

    const { storage, syncState: syncStateStorage } = await this.teamService.getTeamStorage(team.id);

    // 1. Get local prompts and ensure sync state is initialized
    const localPrompts = await storage.list();
    let savedState = await syncStateStorage.getSyncState();

    if (!savedState) {
      // Initialize sync state for first team sync
      const email = (await this.authService.getUserEmail()) || 'unknown';
      const deviceInfo = await getDeviceInfo(this.context);
      savedState = await syncStateStorage.initializeSyncState(email, deviceInfo, team.id);
    }

    const promptSyncMap = { ...savedState.promptSyncMap };
    const lastSyncedAt = savedState.lastSyncedAt;

    // 2. Create transport and engine
    const transport = new TeamTransport(
      this.context,
      this.authService,
      team.id,
      team.role
    );

    const engineConfig: SyncEngineConfig = {
      handleWebCreatedPrompts: false,
      handleCloudDeletion: false,
      checkQuota: false,
    };

    const engine = new SyncEngine(transport, syncStateStorage, engineConfig);

    // 3. Fetch remote team prompts (including deleted for deletion detection)
    const remotePrompts = await transport.fetchRemotePrompts(true);

    // 4. Compute sync plan (three-way merge — same as personal)
    const plan = engine.computeSyncPlan(localPrompts, remotePrompts, lastSyncedAt, promptSyncMap);

    // 5. Create local prompt store adapter for FileStorageProvider
    const localStore: LocalPromptStore = {
      async savePromptDirectly(prompt: Prompt): Promise<Prompt> {
        // Add teamId to prompt before saving
        prompt.teamId = team.id;
        await storage.save(prompt);
        return prompt;
      },
      async deletePromptById(id: string): Promise<boolean> {
        return storage.delete(id);
      },
    };

    // 6. Execute sync plan
    try {
      const syncResult = await engine.executeSyncPlan(plan, localStore);
      result.downloaded = syncResult.stats.downloaded;
      result.uploaded = syncResult.stats.uploaded;
      result.deleted = syncResult.stats.deleted;
      result.conflicts = syncResult.stats.conflicts;
    } catch (error) {
      result.errors.push(error instanceof Error ? error.message : String(error));
    }

    // 7. Update last synced timestamp
    const currentState = await syncStateStorage.getSyncState();
    if (currentState) {
      await syncStateStorage.saveSyncState({
        ...currentState,
        lastSyncedAt: new Date(),
      });
    }

    return result;
  }

  /**
   * Dispose resources
   */
  async dispose(): Promise<void> {
    // No persistent resources to clean up
  }
}
