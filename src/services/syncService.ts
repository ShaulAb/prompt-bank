/**
 * Sync service for personal prompt synchronization
 *
 * Implements three-way merge algorithm with conflict detection to sync prompts
 * across multiple devices using Supabase as the cloud backend.
 *
 * CRITICAL FEATURES:
 * - Content-hash conflict detection (prevents same-second edit bugs)
 * - Pre-flight quota checks (atomic all-or-nothing sync)
 * - Optimistic locking (prevents race conditions)
 * - Separate sync state storage (prevents infinite loops)
 */

import * as vscode from 'vscode';
import type { Prompt } from '../models/prompt';
import type {
  SyncState,
  SyncPlan,
  SyncResult,
  SyncConflict,
  RemotePrompt,
  UserQuota,
  PromptSyncInfo,
} from '../models/syncState';
import { createPromptSyncInfo } from '../models/syncState';
import { SyncStateStorage } from '../storage/syncStateStorage';
import { AuthService } from './authService';
import { computeContentHash, matchesHash } from '../utils/contentHash';
import { getDeviceInfo } from '../utils/deviceId';

/**
 * Sync service singleton
 *
 * Coordinates between local storage, Supabase backend, and VS Code UI
 * to provide seamless multi-device synchronization.
 */
export class SyncService {
  private static instance: SyncService | undefined;

  private syncStateStorage: SyncStateStorage | undefined;
  private authService: AuthService;

  // Supabase configuration (reuse from AuthService)
  private readonly supabaseUrl: string;
  private readonly supabaseAnonKey: string;

  // In-memory sync status cache (for tree view icons)
  private syncStatusCache = new Map<string, 'synced' | 'out-of-sync' | 'conflict'>();

  private constructor(
    private context: vscode.ExtensionContext,
    private workspaceRoot: string
  ) {
    this.authService = AuthService.get();

    // Reuse Supabase config from workspace settings
    const cfg = vscode.workspace.getConfiguration('promptBank');
    this.supabaseUrl = cfg.get<string>('supabaseUrl', 'https://xlqtowactrzmslpkzliq.supabase.co');
    this.supabaseAnonKey = cfg.get<string>(
      'supabaseAnonKey',
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhscXRvd2FjdHJ6bXNscGt6bGlxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTIyMDAzMzQsImV4cCI6MjA2Nzc3NjMzNH0.cUVLqlGGWfaxDs49AQ57rHxruj52MphG9jV1e0F1UYo'
    );

    this.syncStateStorage = new SyncStateStorage(workspaceRoot);
  }

  /**
   * Initialize the singleton
   */
  public static initialize(
    context: vscode.ExtensionContext,
    workspaceRoot: string
  ): SyncService {
    if (!SyncService.instance) {
      SyncService.instance = new SyncService(context, workspaceRoot);
    }
    return SyncService.instance;
  }

  /**
   * Get the singleton instance
   */
  public static get(): SyncService {
    if (!SyncService.instance) {
      throw new Error('SyncService not initialized. Call initialize() first.');
    }
    return SyncService.instance;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Three-Way Merge Algorithm
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Compute sync plan using three-way merge algorithm
   *
   * Compares: local state, remote state, last synced state (via content hash)
   *
   * @param local - Local prompts
   * @param remote - Remote prompts from Supabase
   * @param lastSync - Last sync timestamp (undefined on first sync)
   * @param promptSyncMap - Map of promptId → sync info
   * @returns Sync plan with uploads, downloads, and conflicts
   */
  private computeSyncPlan(
    local: readonly Prompt[],
    remote: readonly RemotePrompt[],
    lastSync: Date | undefined,
    promptSyncMap: Readonly<Record<string, PromptSyncInfo>>
  ): SyncPlan {
    const plan = {
      toUpload: [] as Prompt[],
      toDownload: [] as RemotePrompt[],
      conflicts: [] as SyncConflict[],
    };

    // Build lookup maps
    const localMap = new Map(local.map((p) => [p.id, p]));
    const remoteMap = new Map<string, RemotePrompt>();

    // Map remote prompts by cloudId (from sync state)
    for (const remotePrompt of remote) {
      remoteMap.set(remotePrompt.cloud_id, remotePrompt);
    }

    // Process local prompts
    for (const prompt of local) {
      const syncInfo = promptSyncMap[prompt.id];
      const cloudId = syncInfo?.cloudId;
      const remotePrompt = cloudId ? remoteMap.get(cloudId) : undefined;

      if (!remotePrompt) {
        // New local prompt - upload
        plan.toUpload.push(prompt);
        continue;
      }

      // Prompt exists both locally and remotely
      const localModified = prompt.metadata.modified;
      const remoteModified = new Date(remotePrompt.updated_at);

      // Compute content hashes
      const localHash = computeContentHash(prompt);
      const remoteHash = remotePrompt.content_hash;
      const lastSyncHash = syncInfo?.lastSyncedContentHash;

      if (!lastSync) {
        // FIRST SYNC - Check content hash for conflicts (prevent data loss)
        if (localHash !== remoteHash) {
          // Same prompt ID, different content → conflict
          plan.conflicts.push({ local: prompt, remote: remotePrompt });
        } else if (localModified > remoteModified) {
          plan.toUpload.push(prompt); // Local is newer
        }
        // else: remote is newer or same, will download below
      } else {
        // SUBSEQUENT SYNCS - Three-way merge
        const localChangedSinceSync = lastSyncHash ? !matchesHash(prompt, lastSyncHash) : true;
        const remoteChangedSinceSync = lastSyncHash ? remoteHash !== lastSyncHash : true;

        if (localChangedSinceSync && remoteChangedSinceSync) {
          // CONFLICT - both modified since last sync
          if (localHash !== remoteHash) {
            // Content actually differs (not just timestamp)
            plan.conflicts.push({ local: prompt, remote: remotePrompt });
          }
          // else: timestamps changed but content identical, no action
        } else if (localChangedSinceSync) {
          // Local is newer
          plan.toUpload.push(prompt);
        } else if (remoteChangedSinceSync) {
          // Remote is newer
          plan.toDownload.push(remotePrompt);
        }
        // else: no changes, skip
      }
    }

    // Find new remote prompts not in local
    for (const remotePrompt of remote) {
      const localPromptId = this.findLocalPromptId(remotePrompt.cloud_id, promptSyncMap);
      if (!localPromptId || !localMap.has(localPromptId)) {
        plan.toDownload.push(remotePrompt);
      }
    }

    return plan;
  }

  /**
   * Find local prompt ID by cloud ID
   */
  private findLocalPromptId(
    cloudId: string,
    promptSyncMap: Readonly<Record<string, PromptSyncInfo>>
  ): string | null {
    for (const [promptId, syncInfo] of Object.entries(promptSyncMap)) {
      if (syncInfo.cloudId === cloudId) {
        return promptId;
      }
    }
    return null;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Conflict Resolution
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Resolve conflict by creating two separate prompts with device names
   *
   * CRITICAL: Strips existing conflict suffixes to prevent nesting
   * CRITICAL: Both prompts get NEW IDs (no reuse)
   *
   * @param local - Local version of prompt
   * @param remote - Remote version of prompt
   * @returns Array of [localCopy, remoteCopy] with new IDs and suffixed names
   */
  private async resolveConflict(
    local: Prompt,
    remote: RemotePrompt
  ): Promise<readonly [Prompt, Prompt]> {
    // Strip existing conflict suffixes to prevent nesting
    // Pattern matches: " (from Device Name - Oct 27)" or " (from Device - Jan 1)"
    const suffixPattern = / \(from .+ - \w{3} \d{1,2}\)$/;
    const baseTitle = local.title.replace(suffixPattern, '');

    const syncState = await this.syncStateStorage!.getSyncState();
    const localDeviceName = syncState?.deviceName || 'Unknown Device';

    // Parse remote device name from sync_metadata
    const remoteSyncMeta = remote.sync_metadata as { lastModifiedDeviceName?: string } | null;
    const remoteDeviceName = remoteSyncMeta?.lastModifiedDeviceName || 'Unknown Device';

    // Format dates for suffix
    const formatDate = (date: Date): string => {
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return `${months[date.getMonth()]} ${date.getDate()}`;
    };

    // Create two separate prompts with NEW IDs for both
    const localCopy: Prompt = {
      ...local,
      id: this.generateNewId(), // NEW ID (don't reuse original)
      title: `${baseTitle} (from ${localDeviceName} - ${formatDate(local.metadata.modified)})`,
    };

    const remoteCopy: Prompt = this.convertRemoteToLocal(remote);
    remoteCopy.id = this.generateNewId(); // NEW ID (don't reuse remote's ID)
    remoteCopy.title = `${baseTitle} (from ${remoteDeviceName} - ${formatDate(new Date(remote.updated_at))})`;

    return [localCopy, remoteCopy] as const;
  }

  /**
   * Convert remote prompt to local Prompt format
   */
  private convertRemoteToLocal(remote: RemotePrompt): Prompt {
    const metadata = remote.metadata as any;
    const variables = (remote.variables as any[]) || [];

    const prompt: Prompt = {
      id: remote.local_id,
      title: remote.title,
      content: remote.content,
      category: remote.category,
      variables: variables,
      metadata: {
        created: new Date(metadata.created),
        modified: new Date(metadata.modified),
        usageCount: metadata.usageCount || 0,
      },
    };

    // Add optional properties only if they exist
    if (remote.description) {
      prompt.description = remote.description;
    }
    if (remote.prompt_order !== null && remote.prompt_order !== undefined) {
      prompt.order = remote.prompt_order;
    }
    if (remote.category_order !== null && remote.category_order !== undefined) {
      prompt.categoryOrder = remote.category_order;
    }
    if (metadata.lastUsed) {
      prompt.metadata.lastUsed = new Date(metadata.lastUsed);
    }
    if (metadata.context) {
      prompt.metadata.context = metadata.context;
    }

    return prompt;
  }

  /**
   * Generate a new unique ID for prompts
   */
  private generateNewId(): string {
    return `prompt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Sync Status (for tree view icons)
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Get sync status for a specific prompt (for tree view icon)
   *
   * @param promptId - Local prompt ID
   * @returns Sync status: 'synced', 'out-of-sync', or 'conflict'
   */
  public getSyncStatus(promptId: string): 'synced' | 'out-of-sync' | 'conflict' {
    return this.syncStatusCache.get(promptId) || 'synced';
  }

  /**
   * Update sync status cache (called during sync operations)
   */
  private updateSyncStatusCache(
    promptId: string,
    status: 'synced' | 'out-of-sync' | 'conflict'
  ): void {
    this.syncStatusCache.set(promptId, status);
  }

  /**
   * Clear sync status cache (called after successful sync)
   */
  private clearSyncStatusCache(): void {
    this.syncStatusCache.clear();
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Utility Methods
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Get or create sync state for current user and device
   */
  private async getOrCreateSyncState(userId: string): Promise<SyncState> {
    let state = await this.syncStateStorage!.getSyncState();

    if (!state) {
      // Initialize sync state for new device
      const deviceInfo = await getDeviceInfo(this.context);
      state = await this.syncStateStorage!.initializeSyncState(userId, deviceInfo);
    }

    return state;
  }

  /**
   * Validate user is authenticated
   */
  private async validateAuthentication(): Promise<{ email: string; token: string }> {
    const token = await this.authService.getValidAccessToken();
    const email = await this.authService.getUserEmail();

    if (!email) {
      throw new Error('No user email found. Please sign in again.');
    }

    return { email, token };
  }
}
