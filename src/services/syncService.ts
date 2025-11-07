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
  SyncConflictError,
} from '../models/syncState';
import { SyncConflictType } from '../models/syncState';
import { SyncStateStorage } from '../storage/syncStateStorage';
import { AuthService } from './authService';
import { SupabaseClientManager } from './supabaseClient';
import { computeContentHash, matchesHash } from '../utils/contentHash';
import { getDeviceInfo } from '../utils/deviceId';
import type { PromptService } from './promptService';

/**
 * Sync service using dependency injection
 *
 * Coordinates between local storage, Supabase backend, and VS Code UI
 * to provide seamless multi-device synchronization.
 */
export class SyncService {
  private syncStateStorage: SyncStateStorage;
  private authService: AuthService;

  /**
   * Create a new SyncService instance using dependency injection.
   *
   * @param context - VS Code extension context
   * @param workspaceRoot - Absolute path to workspace root directory
   * @param authService - Injected auth service for authentication
   * @param syncStateStorage - Injected sync state storage for managing sync metadata
   */
  constructor(
    private context: vscode.ExtensionContext,
    _workspaceRoot: string,
    authService: AuthService,
    syncStateStorage: SyncStateStorage
  ) {
    this.authService = authService;
    this.syncStateStorage = syncStateStorage;
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
      let remotePrompt = cloudId ? remoteMap.get(cloudId) : undefined;

      // On first sync, try matching by local_id if cloudId not available
      if (!remotePrompt && !cloudId) {
        // First sync - try matching by local_id
        const matchedByLocalId = remote.find((r) => r.local_id === prompt.id && !r.deleted_at);
        if (matchedByLocalId) {
          remotePrompt = matchedByLocalId;
          // Update remoteMap for subsequent lookups
          remoteMap.set(matchedByLocalId.cloud_id, matchedByLocalId);
        }
      }

      if (!remotePrompt) {
        // Check if deleted remotely (must have cloudId to check)
        const remoteDeleted = cloudId
          ? remote.find((r) => r.cloud_id === cloudId && r.deleted_at)
          : undefined;

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

      // Determine if this is first sync for this prompt (no sync info or no lastSyncedContentHash)
      const isFirstSyncForPrompt = !syncInfo || !lastSyncHash;

      if (isFirstSyncForPrompt && !lastSync) {
        // TRUE FIRST SYNC - Check content hash for conflicts (prevent data loss)
        if (localHash !== remoteHash) {
          // Same prompt ID, different content → conflict
          plan.conflicts.push({ local: prompt, remote: remotePrompt });
        } else if (localModified > remoteModified) {
          plan.toUpload.push(prompt); // Local is newer
        }
        // else: remote is newer or same, will download below
      } else {
        // SUBSEQUENT SYNCS - Three-way merge (use lastSyncHash if available, otherwise assume changed)
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

    // Format date with time to ensure uniqueness
    const formatDateTime = (date: Date): string => {
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
      const hours = date.getHours().toString().padStart(2, '0');
      const minutes = date.getMinutes().toString().padStart(2, '0');
      return `${months[date.getMonth()]} ${date.getDate()} ${hours}:${minutes}`;
    };

    // Create two separate prompts with NEW IDs for both
    const localCopy: Prompt = {
      ...local,
      id: this.generateNewId(), // NEW ID (don't reuse original)
      title: `${baseTitle} (from ${localDeviceName} - ${formatDateTime(local.metadata.modified)})`,
    };

    const remoteCopy: Prompt = this.convertRemoteToLocal(remote);
    remoteCopy.id = this.generateNewId(); // NEW ID (don't reuse remote's ID)
    remoteCopy.title = `${baseTitle} (from ${remoteDeviceName} - ${formatDateTime(new Date(remote.updated_at))})`;

    return [localCopy, remoteCopy] as const;
  }

  /**
   * Convert remote prompt to local Prompt format
   */
  /**
   * Merge version histories from local and remote prompts
   * Versions are combined, sorted by timestamp, and deduplicated
   *
   * @param localVersions - Version history from local prompt
   * @param remoteVersions - Version history from remote prompt
   * @returns Merged and deduplicated version array
   */
  private mergeVersionHistories(
    localVersions: import('../models/prompt').PromptVersion[],
    remoteVersions: import('../models/prompt').PromptVersion[]
  ): import('../models/prompt').PromptVersion[] {
    // Combine all versions
    const allVersions = [...localVersions, ...remoteVersions];

    // Sort by timestamp (oldest first for authoritative ordering)
    allVersions.sort((a, b) => {
      const aTime = new Date(a.timestamp).getTime();
      const bTime = new Date(b.timestamp).getTime();
      return aTime - bTime;
    });

    // Deduplicate by versionId (same version synced from both sides)
    const uniqueById = new Map<string, import('../models/prompt').PromptVersion>();
    for (const version of allVersions) {
      if (!uniqueById.has(version.versionId)) {
        uniqueById.set(version.versionId, version);
      }
    }

    const deduplicatedVersions = Array.from(uniqueById.values());

    console.log(
      `[SyncService] Merged version histories: ` +
        `${localVersions.length} local + ${remoteVersions.length} remote = ` +
        `${deduplicatedVersions.length} unique versions`
    );

    return deduplicatedVersions;
  }

  private convertRemoteToLocal(remote: RemotePrompt): Prompt {
    // Type assertion for metadata from JSON
    interface MetadataJSON {
      created: string | number | Date;
      modified: string | number | Date;
      usageCount: number;
      lastUsed?: string | number | Date;
      context?: FileContext;
      versions?: Array<{
        versionId: string;
        timestamp: string | number | Date;
        deviceId: string;
        deviceName: string;
        content: string;
        title: string;
        description?: string;
        category: string;
        changeReason?: string;
      }>;
    }
    const metadata = remote.metadata as MetadataJSON;
    const variables = (remote.variables as TemplateVariable[]) || [];

    // Convert version history (timestamps from JSON strings to Date objects)
    const versions: import('../models/prompt').PromptVersion[] = (metadata.versions || []).map(
      (v) => {
        const version: import('../models/prompt').PromptVersion = {
          versionId: v.versionId,
          timestamp: new Date(v.timestamp),
          deviceId: v.deviceId,
          deviceName: v.deviceName,
          content: v.content,
          title: v.title,
          category: v.category,
        };

        // Add optional properties
        if (v.description !== undefined) {
          version.description = v.description;
        }
        if (v.changeReason !== undefined) {
          version.changeReason = v.changeReason;
        }

        return version;
      }
    );

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
      versions: versions, // Include version history
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
    return `prompt_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Sync Status (for tree view icons)
  // ────────────────────────────────────────────────────────────────────────────

  /**
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
      const errorContext = (error as { context?: { status?: number } }).context;
      // 404 is acceptable - prompt already deleted
      if (errorContext?.status === 404) {
        console.info(`[SyncService] Prompt ${cloudId} already deleted in cloud`);
        return;
      }
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
   * Parse sync conflict error from Edge Function response
   *
   * Handles BOTH new format (with specific error codes) and legacy format (generic 409).
   * This provides backward compatibility during server migration.
   *
   * @param error - Error from uploadPrompt
   * @returns Parsed conflict error, or null if not a sync conflict
   */
  private parseSyncConflictError(error: unknown): SyncConflictError | null {
    if (!(error instanceof Error)) {
      return null;
    }

    const errorContext = (
      error as { context?: { status?: number; error?: string; details?: unknown } }
    ).context;

    // Check if it's a 409 conflict
    if (errorContext?.status !== 409) {
      return null;
    }

    // NEW FORMAT: Server returns specific error code
    if (
      errorContext.error &&
      Object.values(SyncConflictType).includes(errorContext.error as SyncConflictType)
    ) {
      const result: SyncConflictError = {
        code: errorContext.error as SyncConflictType,
        message: error.message || 'Sync conflict',
        ...(errorContext.details
          ? { details: errorContext.details as NonNullable<SyncConflictError['details']> }
          : {}),
      };

      return result;
    }

    // LEGACY FORMAT: Server returns generic 'conflict' message
    // Assume it's a soft-delete conflict (the most common case)
    // This maintains backward compatibility with old server implementations
    if (error.message?.includes('conflict') || errorContext.error === 'conflict') {
      console.warn(
        '[SyncService] Received legacy 409 conflict format. Assuming PROMPT_DELETED. ' +
          'Consider updating Edge Functions for better conflict resolution.'
      );
      return {
        code: SyncConflictType.PROMPT_DELETED,
        message: 'Conflict detected (legacy format)',
      };
    }

    return null;
  }

  /**
   * Upload prompt with intelligent conflict resolution
   *
   * Handles three types of conflicts:
   * 1. PROMPT_DELETED - Cloud prompt was soft-deleted → Upload as NEW prompt
   * 2. VERSION_CONFLICT - Version mismatch → Throw error to retry entire sync
   * 3. OPTIMISTIC_LOCK_CONFLICT - Concurrent modification → Throw error to retry entire sync
   *
   * @param prompt - Prompt to upload
   * @param syncInfo - Existing sync info (if updating)
   * @returns Cloud ID and version
   * @throws Error if conflict requires retry or upload fails
   */
  private async uploadWithConflictHandling(
    prompt: Prompt,
    syncInfo?: PromptSyncInfo
  ): Promise<{ cloudId: string; version: number }> {
    try {
      return await this.uploadPrompt(prompt, syncInfo);
    } catch (uploadError) {
      const conflictError = this.parseSyncConflictError(uploadError);

      if (!conflictError) {
        throw uploadError; // Not a sync conflict, re-throw
      }

      switch (conflictError.code) {
        case SyncConflictType.PROMPT_DELETED:
          // Soft-deleted prompt - upload as NEW with new cloudId
          console.info(
            `[SyncService] Prompt ${prompt.id} was deleted in cloud (cloudId: ${syncInfo?.cloudId}). ` +
              `Creating new cloud prompt.`
          );
          return await this.uploadPrompt(prompt); // No syncInfo = new prompt

        case SyncConflictType.VERSION_CONFLICT:
        case SyncConflictType.OPTIMISTIC_LOCK_CONFLICT:
          // Version conflict - need to retry entire sync to get fresh state
          console.warn(
            `[SyncService] ${conflictError.code} for prompt ${prompt.id}. ` +
              `Expected v${conflictError.details?.expectedVersion}, ` +
              `actual v${conflictError.details?.actualVersion}. ` +
              `This usually means another device modified the prompt. Retrying sync...`
          );
          throw new Error('sync_conflict_retry');

        default:
          // Unknown conflict type - fail safe by retrying entire sync
          console.error(`[SyncService] Unknown conflict type: ${conflictError.code}`);
          throw new Error('sync_conflict_retry');
      }
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
        // ✅ Include version history for cross-device sync
        versions: prompt.versions.map((v) => ({
          versionId: v.versionId,
          timestamp: v.timestamp.toISOString(),
          deviceId: v.deviceId,
          deviceName: v.deviceName,
          content: v.content,
          title: v.title,
          description: v.description,
          category: v.category,
          changeReason: v.changeReason,
        })),
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

        // Check for 409 conflict - Need to parse Response object to get error details
        if (errorContext?.status === 409) {
          // error.context is a Response object - clone it before reading (can only read once)
          const response = errorContext as unknown as Response;
          let responseBody: any;

          try {
            // Clone the response so we can read it (Response body can only be consumed once)
            const clonedResponse = response.clone();
            responseBody = await clonedResponse.json();
          } catch (parseError) {
            // If we can't parse the response, throw a generic conflict error WITHOUT context
            // This will be caught by outer catch and wrapped
            console.warn('[SyncService] Failed to parse 409 response body:', parseError);
            throw new Error('Sync conflict detected but response body could not be parsed');
          }

          // Successfully parsed - create error with context and throw
          // This will be caught by outer catch, which will preserve the context
          const conflictError = new Error(responseBody?.message || 'Sync conflict');
          (conflictError as any).context = {
            status: 409,
            error: responseBody?.error,
            details: responseBody?.details,
          };
          throw conflictError;
        }

        // Other errors
        throw error;
      }

      return data as { cloudId: string; version: number };
    } catch (error) {
      if (error instanceof Error) {
        // If it's already our user-friendly error, don't wrap it
        if (error.message.includes('session has expired')) {
          throw error;
        }
        // If it has context (our conflict error), re-throw for uploadWithConflictHandling
        if ((error as any).context) {
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

        // Save both conflict copies locally with device-specific names
        await promptService.savePromptDirectly(localCopy);
        await promptService.savePromptDirectly(remoteCopy);

        // Delete the original LOCAL prompt from prompts.json
        // (it's being replaced by two new copies with device-specific names)
        await promptService.deletePromptById(localPrompt.id);

        // Mark the original local prompt as deleted in sync state
        await this.syncStateStorage!.markPromptAsDeleted(localPrompt.id);

        // Compute content hashes for both copies
        const localHash = computeContentHash(localCopy);
        const remoteHash = computeContentHash(remoteCopy);

        try {
          // Upload localCopy as a NEW cloud prompt (representing the local version)
          const localCloudId = await this.uploadPrompt(localCopy);

          // Create sync info for localCopy pointing to its NEW cloud ID
          await this.syncStateStorage!.setPromptSyncInfo(localCopy.id, {
            cloudId: localCloudId.cloudId,
            lastSyncedContentHash: localHash,
            lastSyncedAt: new Date(),
            version: localCloudId.version,
          });
        } catch (error) {
          // If localCopy upload fails, we should still continue with remoteCopy
          // The localCopy exists locally, and we can retry upload on next sync
        }

        try {
          // Link remoteCopy to the EXISTING cloud prompt (representing the remote version)
          // DON'T upload remoteCopy - it already exists in the cloud as conflict.remote
          // This avoids 409 conflicts and preserves the remote prompt in the cloud

          // Create sync info for remoteCopy pointing to the EXISTING cloud ID
          await this.syncStateStorage!.setPromptSyncInfo(remoteCopy.id, {
            cloudId: conflict.remote.cloud_id,
            lastSyncedContentHash: remoteHash,
            lastSyncedAt: new Date(),
            version: conflict.remote.version,
          });
        } catch (error) {
          // Edge case: If the remote cloud prompt was deleted by another device
          // between fetch and conflict resolution, we should upload remoteCopy as NEW
          try {
            const remoteCloudId = await this.uploadPrompt(remoteCopy);

            await this.syncStateStorage!.setPromptSyncInfo(remoteCopy.id, {
              cloudId: remoteCloudId.cloudId,
              lastSyncedContentHash: remoteHash,
              lastSyncedAt: new Date(),
              version: remoteCloudId.version,
            });
          } catch (uploadError) {
            // If both linking and uploading fail, remoteCopy exists locally
            // We can retry on next sync
          }
        }

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

        // VALIDATION: Check for corrupted sync state
        // If syncInfo exists but points to a soft-deleted cloud prompt, clear it
        if (syncInfo?.cloudId && syncInfo.isDeleted) {
          // Clear the corrupted sync info to force a fresh upload
          await this.syncStateStorage!.setPromptSyncInfo(prompt.id, {
            cloudId: '',
            lastSyncedContentHash: '',
            lastSyncedAt: new Date(),
            version: 0,
            isDeleted: false,
          });
          // Now upload as NEW (no sync info)
          const uploaded = await this.uploadPrompt(prompt);
          const contentHash = computeContentHash(prompt);

          await this.syncStateStorage!.setPromptSyncInfo(prompt.id, {
            cloudId: uploaded.cloudId,
            lastSyncedContentHash: contentHash,
            lastSyncedAt: new Date(),
            version: uploaded.version,
          });

          result.stats.uploaded++;
          continue; // Skip to next prompt
        }

        // Normal upload flow with intelligent conflict handling
        const uploaded = await this.uploadWithConflictHandling(prompt, syncInfo ?? undefined);
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

      // 4. Download prompts (with version history merging)
      for (const remotePrompt of plan.toDownload) {
        const remoteLocalPrompt = this.convertRemoteToLocal(remotePrompt);

        // Check if prompt exists locally (for version merging)
        const existingLocal = await promptService.listPrompts({
          category: remoteLocalPrompt.category,
        });
        const existingPrompt = existingLocal.find((p) => p.id === remoteLocalPrompt.id);

        if (existingPrompt && existingPrompt.versions.length > 0) {
          // Merge version histories from both local and remote
          remoteLocalPrompt.versions = this.mergeVersionHistories(
            existingPrompt.versions,
            remoteLocalPrompt.versions
          );
          console.log(
            `[SyncService] Merged versions for prompt "${remoteLocalPrompt.title}": ` +
              `${remoteLocalPrompt.versions.length} total versions`
          );
        }

        await promptService.savePromptDirectly(remoteLocalPrompt);

        const contentHash = computeContentHash(remoteLocalPrompt);
        await this.syncStateStorage!.setPromptSyncInfo(remoteLocalPrompt.id, {
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
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Lifecycle Management
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Dispose of this service and clean up resources
   *
   * Should be called when the workspace is closed or the extension is deactivated.
   */
  public async dispose(): Promise<void> {
    // - No timers or intervals to clean up
  }
}
