/**
 * SyncEngine — Shared three-way merge algorithm with conflict resolution
 *
 * Extracted from SyncService to be reused by both personal and team sync.
 * The engine owns the merge algorithm and conflict resolution logic.
 * Mode-specific I/O is delegated to a SyncTransport implementation.
 *
 * CRITICAL FEATURES:
 * - Content-hash conflict detection (prevents same-second edit bugs)
 * - Optimistic locking (prevents race conditions)
 * - Conflict resolution creates two copies — never silently discards work
 */

import type { Prompt, TemplateVariable, FileContext } from '../../models/prompt';
import { DEFAULT_CATEGORY } from '../../models/prompt';
import type {
  SyncPlan,
  SyncResult,
  RemotePrompt,
  PromptSyncInfo,
} from '../../models/syncState';
import { SyncConflictType } from '../../models/syncState';
import type { SyncStateStorage } from '../../storage/syncStateStorage';
import { computeContentHash, matchesHash } from '../../utils/contentHash';
import type { SyncTransport, SyncEngineConfig, LocalPromptStore } from './syncTransport';

/**
 * Internal error codes used for sync retry logic
 */
const SYNC_ERROR_CODES = {
  /** Thrown when a sync conflict requires retrying the entire sync operation */
  CONFLICT_RETRY: 'sync_conflict_retry',
} as const;

export { SYNC_ERROR_CODES };

export class SyncEngine {
  constructor(
    private readonly transport: SyncTransport,
    private readonly syncStateStorage: SyncStateStorage,
    private readonly config: SyncEngineConfig
  ) {}

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
   * @param promptSyncMap - Map of promptId -> sync info
   * @returns Sync plan with uploads, downloads, and conflicts
   */
  computeSyncPlan(
    local: readonly Prompt[],
    remote: readonly RemotePrompt[],
    lastSync: Date | undefined,
    promptSyncMap: Readonly<Record<string, PromptSyncInfo>>
  ): SyncPlan {
    const plan: SyncPlan = {
      toUpload: [] as Prompt[],
      toDownload: [] as RemotePrompt[],
      toDelete: [] as Array<{ cloudId: string }>,
      conflicts: [],
      toAssignLocalId: [] as Array<{ remote: RemotePrompt; generatedLocalId: string }>,
      toDeleteLocally: [] as Array<{ localPromptId: string; cloudId: string; deletedAt: string }>,
    };

    // Build lookup maps
    const localMap = new Map(local.map((p) => [p.id, p]));
    const remoteMap = new Map<string, RemotePrompt>();

    // Build reverse lookup map: cloudId -> localPromptId (O(n) once, enables O(1) lookups)
    const cloudIdToLocalId = new Map<string, string>();
    for (const [promptId, info] of Object.entries(promptSyncMap)) {
      if (info.cloudId) {
        cloudIdToLocalId.set(info.cloudId, promptId);
      }
    }

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
          // DELETE-MODIFY CONFLICT: Remote was deleted, but local copy still exists.
          if (syncInfo?.isDeleted) {
            // Corrupted state: syncInfo says deleted but prompt still exists locally
            plan.toUpload.push(prompt);
          } else {
            const remoteDeletedAt = new Date(remoteDeleted.deleted_at!);
            const localModifiedAt = prompt.metadata.modified;

            if (localModifiedAt > remoteDeletedAt) {
              // Local was modified AFTER remote deletion - keep local version
              plan.toUpload.push(prompt);
            }
            // else: Local was NOT modified after remote deletion - honor the deletion
          }
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

      // Determine if this is first sync for this prompt
      const isFirstSyncForPrompt = !syncInfo || !lastSyncHash;

      if (isFirstSyncForPrompt && !lastSync) {
        // TRUE FIRST SYNC - Check content hash for conflicts
        if (localHash !== remoteHash) {
          plan.conflicts.push({ local: prompt, remote: remotePrompt });
        } else if (localModified > remoteModified) {
          plan.toUpload.push(prompt);
        }
      } else {
        // SUBSEQUENT SYNCS - Three-way merge
        const localChangedSinceSync = lastSyncHash ? !matchesHash(prompt, lastSyncHash) : true;
        const remoteChangedSinceSync = lastSyncHash ? remoteHash !== lastSyncHash : true;

        if (localChangedSinceSync && remoteChangedSinceSync) {
          // CONFLICT - both modified since last sync
          if (localHash !== remoteHash) {
            plan.conflicts.push({ local: prompt, remote: remotePrompt });
          }
        } else if (localChangedSinceSync) {
          plan.toUpload.push(prompt);
        } else if (remoteChangedSinceSync) {
          plan.toDownload.push(remotePrompt);
        }
      }
    }

    // Detect remote deletions
    const cloudIdsQueuedForUpload = new Set(
      (plan.toUpload as Prompt[])
        .map((p) => {
          const syncInfo = promptSyncMap[p.id];
          return syncInfo?.cloudId;
        })
        .filter((id): id is string => id !== undefined)
    );

    for (const remotePrompt of remote) {
      if (!remotePrompt.deleted_at) continue;

      if (cloudIdsQueuedForUpload.has(remotePrompt.cloud_id)) {
        continue;
      }

      const localPromptId = cloudIdToLocalId.get(remotePrompt.cloud_id);

      if (localPromptId && localMap.has(localPromptId)) {
        const syncInfo = promptSyncMap[localPromptId];

        if (!syncInfo?.isDeleted) {
          plan.toDeleteLocally.push({
            localPromptId,
            cloudId: remotePrompt.cloud_id,
            deletedAt: remotePrompt.deleted_at!,
          });
        }
      }
    }

    // Process deletions (locally-deleted prompts that need cloud soft-delete)
    if (this.config.handleCloudDeletion) {
      for (const cloudId of deletedLocally) {
        plan.toDelete.push({ cloudId });
      }
    }

    // Find new remote prompts not in local (but not deleted locally)
    for (const remotePrompt of remote) {
      if (remotePrompt.deleted_at) continue;

      const localPromptId = cloudIdToLocalId.get(remotePrompt.cloud_id);
      if (!localPromptId || !localMap.has(localPromptId)) {
        if (!deletedLocally.has(remotePrompt.cloud_id)) {
          // Phase 5: Check if web-created (no local_id)
          if (this.config.handleWebCreatedPrompts && !remotePrompt.local_id) {
            const generatedLocalId = this.generateNewId();
            plan.toAssignLocalId.push({ remote: remotePrompt, generatedLocalId });
          } else {
            plan.toDownload.push(remotePrompt);
          }
        }
      }
    }

    return plan;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Conflict Resolution
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Generate a new unique ID for prompts
   *
   * Format: prompt_{timestamp}_{9-char-random}
   */
  generateNewId(): string {
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).slice(2, 11);
    return `prompt_${timestamp}_${randomSuffix}`;
  }

  /**
   * Resolve conflict by creating two separate prompts with device names
   *
   * CRITICAL BEHAVIOR:
   * 1. The original local prompt will be DELETED from prompts.json (by caller)
   * 2. Two NEW prompts are created with NEW IDs (neither reuses the original ID)
   * 3. localCopy is uploaded as NEW cloud prompt
   * 4. remoteCopy is linked to EXISTING cloud prompt (avoids 409 conflicts)
   * 5. Strips existing conflict suffixes to prevent nesting
   */
  async resolveConflict(
    local: Prompt,
    remote: RemotePrompt
  ): Promise<readonly [Prompt, Prompt]> {
    // Strip existing conflict suffixes to prevent nesting
    const suffixPattern = / \(from .+ - \w{3} \d{1,2}\)$/;
    const baseTitle = local.title.replace(suffixPattern, '');

    const localDeviceName = await this.transport.getIdentity();

    // Parse remote device name from sync_metadata
    const remoteSyncMeta = remote.sync_metadata as { lastModifiedDeviceName?: string } | null;
    const remoteDeviceName = remoteSyncMeta?.lastModifiedDeviceName || 'Unknown Device';

    const formatDateTime = (date: Date): string => {
      const months = [
        'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
      ];
      const hours = date.getHours().toString().padStart(2, '0');
      const minutes = date.getMinutes().toString().padStart(2, '0');
      return `${months[date.getMonth()]} ${date.getDate()} ${hours}:${minutes}`;
    };

    // Create two separate prompts with NEW IDs for both
    const localCopy: Prompt = {
      ...local,
      id: this.generateNewId(),
      title: `${baseTitle} (from ${localDeviceName} - ${formatDateTime(local.metadata.modified)})`,
    };

    const remoteCopy: Prompt = this.convertRemoteToLocal(remote);
    remoteCopy.id = this.generateNewId();
    remoteCopy.title = `${baseTitle} (from ${remoteDeviceName} - ${formatDateTime(new Date(remote.updated_at))})`;

    return [localCopy, remoteCopy] as const;
  }

  /**
   * Convert remote prompt to local Prompt format
   */
  convertRemoteToLocal(remote: RemotePrompt, generatedLocalId?: string): Prompt {
    interface MetadataJSON {
      created: string | number | Date;
      modified: string | number | Date;
      usageCount: number;
      lastUsed?: string | number | Date;
      context?: FileContext;
    }
    const metadata = remote.metadata as MetadataJSON;
    const variables = (remote.variables as TemplateVariable[]) || [];

    const localId = generatedLocalId ?? remote.local_id ?? this.generateNewId();

    const prompt: Prompt = {
      id: localId,
      title: remote.title,
      content: remote.content,
      category: remote.category || DEFAULT_CATEGORY,
      variables: variables,
      metadata: {
        created: new Date(metadata.created),
        modified: new Date(metadata.modified),
        usageCount: metadata.usageCount || 0,
      },
    };

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
   * Upload prompt with intelligent conflict resolution
   *
   * Handles three types of conflicts:
   * 1. PROMPT_DELETED - Cloud prompt was soft-deleted -> Upload as NEW prompt
   * 2. VERSION_CONFLICT - Version mismatch -> Throw error to retry entire sync
   * 3. OPTIMISTIC_LOCK_CONFLICT - Concurrent modification -> Throw error to retry
   */
  async uploadWithConflictHandling(
    prompt: Prompt,
    syncInfo?: PromptSyncInfo
  ): Promise<{ cloudId: string; version: number }> {
    try {
      return await this.transport.uploadPrompt(prompt, syncInfo);
    } catch (uploadError) {
      const conflictError = this.transport.parseSyncConflictError(uploadError);

      if (!conflictError) {
        throw uploadError;
      }

      switch (conflictError.code) {
        case SyncConflictType.PROMPT_DELETED:
          console.info(
            `[SyncEngine] Prompt ${prompt.id} was deleted in cloud (cloudId: ${syncInfo?.cloudId}). ` +
              `Creating new cloud prompt.`
          );
          return await this.transport.uploadPrompt(prompt); // No syncInfo = new prompt

        case SyncConflictType.VERSION_CONFLICT:
        case SyncConflictType.OPTIMISTIC_LOCK_CONFLICT:
          console.warn(
            `[SyncEngine] ${conflictError.code} for prompt ${prompt.id}. ` +
              `Expected v${conflictError.details?.expectedVersion}, ` +
              `actual v${conflictError.details?.actualVersion}. ` +
              `Retrying sync...`
          );
          throw new Error(SYNC_ERROR_CODES.CONFLICT_RETRY);

        default:
          console.error(`[SyncEngine] Unknown conflict type: ${conflictError.code}`);
          throw new Error(SYNC_ERROR_CODES.CONFLICT_RETRY);
      }
    }
  }

  /**
   * Calculate total upload size for quota check
   */
  calculateUploadSize(prompts: unknown[]): number {
    return prompts.reduce((total: number, prompt) => {
      const size = Buffer.byteLength(JSON.stringify(prompt), 'utf8');
      return total + size;
    }, 0);
  }

  /**
   * Execute sync plan with comprehensive error handling
   *
   * @param plan - Sync plan computed by three-way merge
   * @param localStore - Local prompt store for saving/deleting prompts
   * @returns Sync result with statistics
   */
  async executeSyncPlan(plan: SyncPlan, localStore: LocalPromptStore): Promise<SyncResult> {
    const result: SyncResult = {
      stats: { uploaded: 0, downloaded: 0, deleted: 0, conflicts: 0, duration: 0 },
    };

    const startTime = Date.now();
    const writePerms = this.transport.getWritePermission();

    try {
      // 1. Handle conflicts first (create local duplicates)
      for (const conflict of plan.conflicts) {
        const localPrompt = conflict.local as Prompt;
        const [localCopy, remoteCopy] = await this.resolveConflict(localPrompt, conflict.remote);

        // Save both conflict copies locally with device-specific names
        await localStore.savePromptDirectly(localCopy);
        await localStore.savePromptDirectly(remoteCopy);

        // Delete the original LOCAL prompt from prompts.json
        await localStore.deletePromptById(localPrompt.id);

        // Mark the original local prompt as deleted in sync state
        await this.syncStateStorage.markPromptAsDeleted(localPrompt.id);

        // Compute content hashes for both copies
        const localHash = computeContentHash(localCopy);
        const remoteHash = computeContentHash(remoteCopy);

        // Upload localCopy as a NEW cloud prompt (if we have write permission)
        if (writePerms.canUpload) {
          try {
            const localCloudId = await this.transport.uploadPrompt(localCopy);
            await this.syncStateStorage.setPromptSyncInfo(localCopy.id, {
              cloudId: localCloudId.cloudId,
              lastSyncedContentHash: localHash,
              lastSyncedAt: new Date(),
              version: localCloudId.version,
            });
          } catch (uploadError) {
            console.warn(
              `[SyncEngine] Failed to upload local conflict copy "${localCopy.title}" (${localCopy.id}). ` +
                `Will retry on next sync.`,
              uploadError
            );
          }
        }

        // Link remoteCopy to the EXISTING cloud prompt
        try {
          await this.syncStateStorage.setPromptSyncInfo(remoteCopy.id, {
            cloudId: conflict.remote.cloud_id,
            lastSyncedContentHash: remoteHash,
            lastSyncedAt: new Date(),
            version: conflict.remote.version,
          });
        } catch (linkError) {
          console.warn(
            `[SyncEngine] Failed to link remote conflict copy to cloud_id ${conflict.remote.cloud_id}. ` +
              `Attempting to upload as new prompt.`,
            linkError
          );
          if (writePerms.canUpload) {
            try {
              const remoteCloudId = await this.transport.uploadPrompt(remoteCopy);
              await this.syncStateStorage.setPromptSyncInfo(remoteCopy.id, {
                cloudId: remoteCloudId.cloudId,
                lastSyncedContentHash: remoteHash,
                lastSyncedAt: new Date(),
                version: remoteCloudId.version,
              });
            } catch (fallbackError) {
              console.warn(
                `[SyncEngine] Failed to upload remote conflict copy "${remoteCopy.title}" (${remoteCopy.id}). ` +
                  `Will retry on next sync.`,
                fallbackError
              );
            }
          }
        }

        result.stats.conflicts++;
      }

      // 2. Handle remote deletions (prompts deleted on web UI)
      for (const { localPromptId, cloudId, deletedAt } of plan.toDeleteLocally) {
        try {
          const deleted = await localStore.deletePromptById(localPromptId);

          if (deleted) {
            await this.syncStateStorage.setPromptSyncInfo(localPromptId, {
              cloudId,
              lastSyncedContentHash: '',
              lastSyncedAt: new Date(),
              version: 0,
              isDeleted: true,
              deletedAt: new Date(deletedAt),
            });
            result.stats.deleted++;
          }
        } catch (error) {
          console.error(`[SyncEngine] Failed to delete local prompt "${localPromptId}":`, error);
        }
      }

      // 3. Process cloud deletions (soft-delete cloud prompts that were deleted locally)
      if (this.config.handleCloudDeletion && writePerms.canDelete) {
        for (const { cloudId } of plan.toDelete) {
          await this.transport.deletePrompt(cloudId);

          const promptId = await this.syncStateStorage.findLocalPromptId(cloudId);
          if (promptId) {
            await this.syncStateStorage.markPromptAsDeleted(promptId);
          }

          result.stats.deleted++;
        }
      }

      // 4. Upload prompts (local changes -> cloud)
      if (writePerms.canUpload) {
        for (const promptUnknown of plan.toUpload) {
          const prompt = promptUnknown as Prompt;
          const syncInfo = await this.syncStateStorage.getPromptSyncInfo(prompt.id);

          // Handle corrupted sync state: syncInfo points to soft-deleted cloud prompt
          if (syncInfo?.cloudId && syncInfo.isDeleted) {
            await this.syncStateStorage.setPromptSyncInfo(prompt.id, {
              cloudId: '',
              lastSyncedContentHash: '',
              lastSyncedAt: new Date(),
              version: 0,
              isDeleted: false,
            });

            const uploaded = await this.transport.uploadPrompt(prompt);
            const contentHash = computeContentHash(prompt);
            await this.syncStateStorage.setPromptSyncInfo(prompt.id, {
              cloudId: uploaded.cloudId,
              lastSyncedContentHash: contentHash,
              lastSyncedAt: new Date(),
              version: uploaded.version,
            });

            result.stats.uploaded++;
            continue;
          }

          // Normal upload with conflict handling (optimistic locking)
          const uploaded = await this.uploadWithConflictHandling(prompt, syncInfo ?? undefined);
          const contentHash = computeContentHash(prompt);
          await this.syncStateStorage.setPromptSyncInfo(prompt.id, {
            cloudId: uploaded.cloudId,
            lastSyncedContentHash: contentHash,
            lastSyncedAt: new Date(),
            version: uploaded.version,
            isDeleted: false,
          });

          result.stats.uploaded++;
        }
      }

      // 5. Download prompts (cloud changes -> local)
      for (const remotePrompt of plan.toDownload) {
        const localPrompt = this.convertRemoteToLocal(remotePrompt);
        await localStore.savePromptDirectly(localPrompt);

        const contentHash = computeContentHash(localPrompt);
        await this.syncStateStorage.setPromptSyncInfo(localPrompt.id, {
          cloudId: remotePrompt.cloud_id,
          lastSyncedContentHash: contentHash,
          lastSyncedAt: new Date(),
          version: remotePrompt.version,
        });

        result.stats.downloaded++;
      }

      // 6. Handle web-created prompts (download + upload local_id)
      if (this.config.handleWebCreatedPrompts) {
        for (const { remote, generatedLocalId } of plan.toAssignLocalId) {
          const localPrompt = this.convertRemoteToLocal(remote, generatedLocalId);
          await localStore.savePromptDirectly(localPrompt);

          const syncInfo: PromptSyncInfo = {
            cloudId: remote.cloud_id,
            lastSyncedContentHash: remote.content_hash,
            lastSyncedAt: new Date(),
            version: remote.version,
          };

          if (writePerms.canUpload) {
            try {
              const uploaded = await this.transport.uploadPrompt(localPrompt, syncInfo);
              await this.syncStateStorage.setPromptSyncInfo(localPrompt.id, {
                cloudId: uploaded.cloudId,
                lastSyncedContentHash: computeContentHash(localPrompt),
                lastSyncedAt: new Date(),
                version: uploaded.version,
              });
              result.stats.downloaded++;
            } catch (error) {
              const conflictError = this.transport.parseSyncConflictError(error);
              if (conflictError) {
                console.warn(
                  `[SyncEngine] ${conflictError.code} while assigning local_id to "${localPrompt.title}". ` +
                    `Local copy preserved, will retry on next sync.`
                );
              } else {
                console.warn(
                  `[SyncEngine] Failed to update local_id for "${localPrompt.title}": ` +
                    `${error instanceof Error ? error.message : String(error)}`
                );
              }

              await this.syncStateStorage.setPromptSyncInfo(localPrompt.id, {
                cloudId: remote.cloud_id,
                lastSyncedContentHash: '',
                lastSyncedAt: new Date(),
                version: remote.version,
              });
              result.stats.downloaded++;
            }
          } else {
            // No write permission — just save locally with sync info
            await this.syncStateStorage.setPromptSyncInfo(localPrompt.id, {
              cloudId: remote.cloud_id,
              lastSyncedContentHash: computeContentHash(localPrompt),
              lastSyncedAt: new Date(),
              version: remote.version,
            });
            result.stats.downloaded++;
          }
        }
      }

      result.stats.duration = Date.now() - startTime;
      return result;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (errorMessage.includes('network') || errorMessage.includes('fetch')) {
        throw new Error('Unable to sync - check your internet connection');
      } else if (errorMessage.includes('auth') || errorMessage.includes('unauthorized')) {
        throw new Error('Authentication expired - please sign in again');
      } else if (errorMessage.includes('quota') || errorMessage.includes('limit')) {
        throw error;
      } else if (
        errorMessage.includes('conflict') ||
        errorMessage === SYNC_ERROR_CODES.CONFLICT_RETRY
      ) {
        throw new Error(SYNC_ERROR_CODES.CONFLICT_RETRY);
      }

      throw new Error(`Sync failed: ${errorMessage}`);
    }
  }
}
