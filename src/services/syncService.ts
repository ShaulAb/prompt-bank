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
import type { Prompt, TemplateVariable, FileContext } from '../models/prompt';
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
import { SupabaseClientManager } from './supabaseClient';
import { computeContentHash, matchesHash } from '../utils/contentHash';
import { getDeviceInfo } from '../utils/deviceId';
import type { PromptService } from './promptService';

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

  // In-memory sync status cache (for tree view icons)
  private syncStatusCache = new Map<string, 'synced' | 'out-of-sync' | 'conflict'>();

  private constructor(
    private context: vscode.ExtensionContext,
    workspaceRoot: string
  ) {
    this.authService = AuthService.get();
    this.syncStateStorage = new SyncStateStorage(workspaceRoot);
  }

  /**
   * Initialize the singleton
   */
  public static initialize(context: vscode.ExtensionContext, workspaceRoot: string): SyncService {
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
    const plan: SyncPlan = {
      toUpload: [] as Prompt[],
      toDownload: [] as RemotePrompt[],
      toDelete: [] as Array<{ cloudId: string }>,
      conflicts: [] as SyncConflict[],
    };

    // Build lookup maps
    const localMap = new Map(local.map((p) => [p.id, p]));
    const remoteMap = new Map<string, RemotePrompt>();

    // Map ACTIVE remote prompts only (exclude soft-deleted)
    for (const remotePrompt of remote) {
      if (!remotePrompt.deleted_at) {
        remoteMap.set(remotePrompt.cloud_id, remotePrompt);
      }
    }

    // Detect locally deleted prompts (exist in sync state but not in local)
    const localIds = new Set(local.map((p) => p.id));
    const deletedLocally = new Set<string>();

    for (const [promptId, info] of Object.entries(promptSyncMap)) {
      if (!localIds.has(promptId) && !info.isDeleted) {
        deletedLocally.add(info.cloudId);
      }
    }

    // Process local prompts
    for (const prompt of local) {
      const syncInfo = promptSyncMap[prompt.id];
      const cloudId = syncInfo?.cloudId;
      const remotePrompt = cloudId ? remoteMap.get(cloudId) : undefined;

      if (!remotePrompt) {
        // Check if deleted remotely
        const remoteDeleted = remote.find((r) => r.cloud_id === cloudId && r.deleted_at);

        if (remoteDeleted) {
          // DELETE-MODIFY CONFLICT: Remote deleted, local modified
          // RESOLUTION: Keep modified version (user preference)
          plan.toUpload.push(prompt);
        } else {
          // New local prompt - upload
          plan.toUpload.push(prompt);
        }
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

    // Process deletions
    for (const cloudId of deletedLocally) {
      plan.toDelete.push({ cloudId });
    }

    // Find new remote prompts not in local (but not deleted locally)
    for (const remotePrompt of remote) {
      if (remotePrompt.deleted_at) continue; // Skip deleted remote prompts

      const localPromptId = this.findLocalPromptId(remotePrompt.cloud_id, promptSyncMap);
      if (!localPromptId || !localMap.has(localPromptId)) {
        // Check if this was deleted locally
        if (!deletedLocally.has(remotePrompt.cloud_id)) {
          plan.toDownload.push(remotePrompt);
        }
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
      const months = [
        'Jan',
        'Feb',
        'Mar',
        'Apr',
        'May',
        'Jun',
        'Jul',
        'Aug',
        'Sep',
        'Oct',
        'Nov',
        'Dec',
      ];
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
    // Type assertion for metadata from JSON
    interface MetadataJSON {
      created: string | number | Date;
      modified: string | number | Date;
      usageCount: number;
      lastUsed?: string | number | Date;
      context?: FileContext;
    }
    const metadata = remote.metadata as MetadataJSON;
    const variables = (remote.variables as TemplateVariable[]) || [];

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
   *
   * Note: Currently unused but kept for future tree view icon support
   */
  // private updateSyncStatusCache(
  //   promptId: string,
  //   status: 'synced' | 'out-of-sync' | 'conflict'
  // ): void {
  //   this.syncStatusCache.set(promptId, status);
  // }

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
   *
   * Note: Currently unused but kept for potential future use
   */
  // private async validateAuthentication(): Promise<{ email: string; token: string }> {
  //   const token = await this.authService.getValidAccessToken();
  //   const email = await this.authService.getUserEmail();

  //   if (!email) {
  //     throw new Error('No user email found. Please sign in again.');
  //   }

  //   return { email, token };
  // }

  /**
   * Validate authentication and set session on Supabase client
   *
   * This method gets the auth tokens from AuthService and sets them on the
   * Supabase client so all subsequent API calls are authenticated.
   */
  private async validateAuthenticationAndSetSession(): Promise<{
    email: string;
    token: string;
    refreshToken: string;
  }> {
    const token = await this.authService.getValidAccessToken();
    const refreshToken = await this.authService.getRefreshToken();
    const email = await this.authService.getUserEmail();

    if (!email) {
      throw new Error('No user email found. Please sign in again.');
    }

    if (!refreshToken) {
      throw new Error('No refresh token found. Please sign in again.');
    }

    // Set the session on Supabase client for authenticated API calls
    await SupabaseClientManager.setSession(token, refreshToken);

    return { email, token, refreshToken };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Supabase API Integration
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Soft-delete a prompt in the cloud
   *
   * @param cloudId - Cloud ID of prompt to delete
   */
  private async deletePrompt(cloudId: string): Promise<void> {
    const supabase = SupabaseClientManager.get();
    const deviceInfo = await getDeviceInfo(this.context);

    const { error } = await supabase.functions.invoke('delete-prompt', {
      body: { cloudId, deviceId: deviceInfo.id },
    });

    if (error) {
      throw new Error(`Failed to delete prompt: ${error.message}`);
    }
  }

  /**
   * Restore a soft-deleted prompt in the cloud
   *
   * @param cloudId - Cloud ID of prompt to restore
   */
  private async restorePrompt(cloudId: string): Promise<void> {
    const supabase = SupabaseClientManager.get();

    const { error } = await supabase.functions.invoke('restore-prompt', {
      body: { cloudId },
    });

    if (error) {
      throw new Error(`Failed to restore prompt: ${error.message}`);
    }
  }

  /**
   * Fetch all remote prompts for the authenticated user
   *
   * @param since - Optional timestamp to fetch only prompts modified after this date
   * @param includeDeleted - Whether to include soft-deleted prompts
   * @returns Array of remote prompts
   */
  private async fetchRemotePrompts(
    since?: Date,
    includeDeleted = false
  ): Promise<readonly RemotePrompt[]> {
    const supabase = SupabaseClientManager.get();

    try {
      const { data, error } = await supabase.functions.invoke('get-user-prompts', {
        body: {
          since: since?.toISOString(),
          includeDeleted,
        },
      });

      if (error) {
        // Check for 401/invalid JWT errors
        const errorMessage = error.message || String(error);
        const errorContext = (error as { context?: { status?: number } }).context;

        if (
          errorContext?.status === 401 ||
          errorMessage.toLowerCase().includes('invalid jwt') ||
          errorMessage.toLowerCase().includes('unauthorized')
        ) {
          console.warn('[SyncService] Detected invalid JWT error. Clearing tokens...');
          await this.authService.clearInvalidTokens();
          throw new Error(
            'Your session has expired. Please try syncing again to sign in with a new session.'
          );
        }

        throw error;
      }

      return (data as { prompts: RemotePrompt[] }).prompts;
    } catch (error) {
      if (error instanceof Error) {
        // If it's already our user-friendly error, don't wrap it
        if (error.message.includes('session has expired')) {
          throw error;
        }
        throw new Error(`Failed to fetch remote prompts: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Upload or update a single prompt to Supabase
   *
   * @param prompt - Prompt to upload
   * @param syncInfo - Existing sync info (if updating)
   * @returns Cloud ID and version
   */
  private async uploadPrompt(
    prompt: Prompt,
    syncInfo?: PromptSyncInfo
  ): Promise<{ cloudId: string; version: number }> {
    const supabase = SupabaseClientManager.get();
    const contentHash = computeContentHash(prompt);
    const deviceInfo = await getDeviceInfo(this.context);

    const body = {
      cloudId: syncInfo?.cloudId,
      expectedVersion: syncInfo?.version,
      contentHash: contentHash,
      local_id: prompt.id,
      title: prompt.title,
      content: prompt.content,
      description: prompt.description || null,
      category: prompt.category,
      prompt_order: prompt.order || null,
      category_order: prompt.categoryOrder || null,
      variables: prompt.variables,
      metadata: {
        created: prompt.metadata.created.toISOString(),
        modified: prompt.metadata.modified.toISOString(),
        usageCount: prompt.metadata.usageCount,
        lastUsed: prompt.metadata.lastUsed?.toISOString(),
        context: prompt.metadata.context,
      },
      sync_metadata: {
        lastModifiedDeviceId: deviceInfo.id,
        lastModifiedDeviceName: deviceInfo.name,
      },
    };

    try {
      const { data, error } = await supabase.functions.invoke('sync-prompt', {
        body: body,
      });

      if (error) {
        // Check for 401/invalid JWT errors first
        const errorMessage = error.message || String(error);
        const errorContext = (error as { context?: { status?: number } }).context;

        if (
          errorContext?.status === 401 ||
          errorMessage.toLowerCase().includes('invalid jwt') ||
          errorMessage.toLowerCase().includes('unauthorized')
        ) {
          console.warn(
            '[SyncService] Detected invalid JWT error during upload. Clearing tokens...'
          );
          await this.authService.clearInvalidTokens();
          throw new Error(
            'Your session has expired. Please try syncing again to sign in with a new session.'
          );
        }

        // Check for optimistic lock conflict
        if (error.message?.includes('conflict') || (error as { status?: number }).status === 409) {
          throw new Error('conflict');
        }
        throw error;
      }

      return data as { cloudId: string; version: number };
    } catch (error) {
      if (error instanceof Error && error.message === 'conflict') {
        throw error; // Re-throw conflict for higher-level handling
      }
      if (error instanceof Error) {
        // If it's already our user-friendly error, don't wrap it
        if (error.message.includes('session has expired')) {
          throw error;
        }
        throw new Error(`Failed to upload prompt: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Fetch user quota from Supabase
   *
   * @returns User quota information
   */
  private async fetchUserQuota(): Promise<UserQuota> {
    const supabase = SupabaseClientManager.get();

    try {
      const { data, error } = await supabase.functions.invoke('get-user-quota', {
        body: {},
      });

      if (error) {
        throw error;
      }

      return data as UserQuota;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to fetch user quota: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Pre-flight quota check to prevent partial sync failures
   *
   * CRITICAL: Checks if sync would exceed quota BEFORE uploading anything
   * This ensures atomic all-or-nothing sync behavior
   *
   * @param plan - Sync plan
   * @throws Error if sync would exceed quota
   */
  private async checkQuotaBeforeSync(plan: SyncPlan): Promise<void> {
    const quota = await this.fetchUserQuota();

    const promptsToUpload = plan.toUpload.length;
    if (quota.promptCount + promptsToUpload > quota.promptLimit) {
      const overage = promptsToUpload - (quota.promptLimit - quota.promptCount);
      throw new Error(
        `Cannot sync: would exceed limit by ${overage} prompts. ` +
          `Delete ${overage} prompts and try again.`
      );
    }

    const uploadSize = this.calculateUploadSize(plan.toUpload);
    if (quota.storageBytes + uploadSize > quota.storageLimit) {
      const overageMB = ((quota.storageBytes + uploadSize - quota.storageLimit) / 1048576).toFixed(
        1
      );
      throw new Error(
        `Cannot sync: would exceed 10 MB storage limit by ${overageMB} MB. ` +
          `Delete some prompts and try again.`
      );
    }

    // Optional warning if approaching limit
    if (quota.percentageUsed > 90) {
      void vscode.window.showWarningMessage(
        `You're using ${quota.percentageUsed}% of your storage quota. ` +
          `Consider deleting old prompts.`
      );
    }
  }

  /**
   * Calculate total upload size for quota check
   */
  private calculateUploadSize(prompts: unknown[]): number {
    return prompts.reduce((total: number, prompt) => {
      // Approximate JSON size (title + content + metadata)
      const size = Buffer.byteLength(JSON.stringify(prompt), 'utf8');
      return total + size;
    }, 0);
  }

  /**
   * Execute sync plan with comprehensive error handling
   *
   * @param plan - Sync plan computed by three-way merge
   * @param promptService - Prompt service for saving prompts
   * @returns Sync result with statistics
   */
  private async executeSyncPlan(plan: SyncPlan, promptService: PromptService): Promise<SyncResult> {
    const result: SyncResult = {
      stats: { uploaded: 0, downloaded: 0, deleted: 0, conflicts: 0, duration: 0 },
    };

    const startTime = Date.now();

    try {
      // 1. Handle conflicts first (create local duplicates)
      for (const conflict of plan.conflicts) {
        const localPrompt = conflict.local as Prompt;
        const [localCopy, remoteCopy] = await this.resolveConflict(localPrompt, conflict.remote);

        await promptService.savePromptDirectly(localCopy);
        await promptService.savePromptDirectly(remoteCopy);

        // Update sync state for both copies
        const localHash = computeContentHash(localCopy);
        const remoteHash = computeContentHash(remoteCopy);

        const localCloudId = await this.uploadPrompt(localCopy);
        const remoteSyncInfo = createPromptSyncInfo(
          conflict.remote.cloud_id,
          remoteHash,
          conflict.remote.version
        );

        await this.syncStateStorage!.setPromptSyncInfo(localCopy.id, {
          cloudId: localCloudId.cloudId,
          lastSyncedContentHash: localHash,
          lastSyncedAt: new Date(),
          version: localCloudId.version,
        });

        await this.syncStateStorage!.setPromptSyncInfo(remoteCopy.id, remoteSyncInfo);

        result.stats.conflicts++;
      }

      // 2. Process deletions
      for (const { cloudId } of plan.toDelete) {
        await this.deletePrompt(cloudId);

        // Mark as deleted in sync state
        const promptId = await this.syncStateStorage!.findLocalPromptId(cloudId);
        if (promptId) {
          await this.syncStateStorage!.markPromptAsDeleted(promptId);
        }

        result.stats.deleted++;
      }

      // 3. Upload prompts
      for (const promptUnknown of plan.toUpload) {
        const prompt = promptUnknown as Prompt;
        const syncInfo = await this.syncStateStorage!.getPromptSyncInfo(prompt.id);
        const uploaded = await this.uploadPrompt(prompt, syncInfo ?? undefined);
        const contentHash = computeContentHash(prompt);

        // Update sync state (clear deletion flag if re-uploading)
        await this.syncStateStorage!.setPromptSyncInfo(prompt.id, {
          cloudId: uploaded.cloudId,
          lastSyncedContentHash: contentHash,
          lastSyncedAt: new Date(),
          version: uploaded.version,
          isDeleted: false,
        });

        result.stats.uploaded++;
      }

      // 4. Download prompts
      for (const remotePrompt of plan.toDownload) {
        const localPrompt = this.convertRemoteToLocal(remotePrompt);
        await promptService.savePromptDirectly(localPrompt);

        const contentHash = computeContentHash(localPrompt);
        await this.syncStateStorage!.setPromptSyncInfo(localPrompt.id, {
          cloudId: remotePrompt.cloud_id,
          lastSyncedContentHash: contentHash,
          lastSyncedAt: new Date(),
          version: remotePrompt.version,
        });

        result.stats.downloaded++;
      }

      result.stats.duration = Date.now() - startTime;
      return result;
    } catch (error: unknown) {
      // Categorize errors and provide user-friendly messages
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (errorMessage.includes('network') || errorMessage.includes('fetch')) {
        throw new Error('Unable to sync - check your internet connection');
      } else if (errorMessage.includes('auth') || errorMessage.includes('unauthorized')) {
        throw new Error('Authentication expired - please sign in again');
      } else if (errorMessage.includes('quota') || errorMessage.includes('limit')) {
        throw error; // Already user-friendly from checkQuotaBeforeSync
      } else if (errorMessage.includes('conflict')) {
        // Retry sync once if conflict detected (optimistic lock)
        void vscode.window.showInformationMessage('Sync conflict detected - retrying...');
        throw new Error('sync_conflict_retry');
      }

      // Unknown error - show generic message
      throw new Error(`Sync failed: ${errorMessage}`);
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Public API (will be called from commands)
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Perform full sync operation
   *
   * This is the main entry point for syncing all prompts
   *
   * @param localPrompts - All local prompts
   * @param promptService - Prompt service for saving prompts
   * @returns Sync result
   */
  public async performSync(
    localPrompts: readonly Prompt[],
    promptService: PromptService
  ): Promise<SyncResult> {
    // 1. Validate authentication and set session
    const { email } = await this.validateAuthenticationAndSetSession();

    // 2. Get or create sync state
    const syncState = await this.getOrCreateSyncState(email);

    // 3. Fetch remote prompts
    const remotePrompts = await this.fetchRemotePrompts();

    // 4. Compute sync plan (three-way merge)
    const plan = this.computeSyncPlan(
      localPrompts,
      remotePrompts,
      syncState.lastSyncedAt,
      syncState.promptSyncMap
    );

    // 5. Pre-flight quota check (CRITICAL)
    await this.checkQuotaBeforeSync(plan);

    // 6. Execute sync plan
    const result = await this.executeSyncPlan(plan, promptService);

    // 7. Update last synced timestamp
    await this.syncStateStorage!.updateLastSyncedAt();

    // 8. Clear sync status cache
    this.clearSyncStatusCache();

    return result;
  }

  /**
   * Get current sync state for UI display
   *
   * @returns Sync state information
   */
  public async getSyncStateInfo(): Promise<{
    userId: string;
    deviceName: string;
    lastSyncedAt: Date | undefined;
    syncedPromptCount: number;
  }> {
    const syncState = await this.syncStateStorage!.getSyncState();

    if (!syncState) {
      throw new Error('Not configured for sync - please sign in first');
    }

    return {
      userId: syncState.userId,
      deviceName: syncState.deviceName,
      lastSyncedAt: syncState.lastSyncedAt,
      syncedPromptCount: Object.keys(syncState.promptSyncMap).length,
    };
  }

  /**
   * Get list of deleted prompts for restore feature
   *
   * @returns Array of deleted prompts with metadata
   */
  public async getDeletedPrompts(): Promise<
    ReadonlyArray<{ promptId: string; info: PromptSyncInfo; title: string }>
  > {
    const deleted = await this.syncStateStorage!.getDeletedPrompts();

    // Fetch remote prompt data to get titles
    const remotePrompts = await this.fetchRemotePrompts(undefined, true);
    const remoteMap = new Map(remotePrompts.map((p) => [p.cloud_id, p]));

    return deleted.map(({ promptId, info }) => {
      const remote = remoteMap.get(info.cloudId);
      return {
        promptId,
        info,
        title: remote?.title || 'Unknown',
      };
    });
  }

  /**
   * Restore deleted prompts from cloud
   *
   * @param cloudIds - Array of cloud IDs to restore
   * @returns Number of prompts restored
   */
  public async restoreDeletedPrompts(cloudIds: string[]): Promise<number> {
    let restored = 0;

    for (const cloudId of cloudIds) {
      try {
        await this.restorePrompt(cloudId);

        // Clear deletion flag in sync state
        const promptId = await this.syncStateStorage!.findLocalPromptId(cloudId);
        if (promptId) {
          const existingInfo = await this.syncStateStorage!.getPromptSyncInfo(promptId);
          if (existingInfo) {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { deletedAt, ...updates } = existingInfo;
            await this.syncStateStorage!.setPromptSyncInfo(promptId, {
              ...updates,
              isDeleted: false,
            });
          }
        }

        restored++;
      } catch (error) {
        console.error(`Failed to restore prompt ${cloudId}:`, error);
        // Continue with other prompts
      }
    }

    return restored;
  }

  /**
   * Clear all sync state (for reset)
   */
  public async clearAllSyncState(): Promise<void> {
    await this.syncStateStorage!.clearAllSyncState();
    this.clearSyncStatusCache();
  }
}
