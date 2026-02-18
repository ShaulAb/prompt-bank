/**
 * Sync state storage provider
 *
 * Manages persistence of sync state to .vscode/prompt-bank/sync-state.json
 * Uses atomic writes (temp file + rename) to prevent corruption.
 *
 * CRITICAL: Sync state is stored separately from prompts.json to prevent
 * infinite loops from modifying prompt metadata during sync operations.
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import type { SyncState, PromptSyncInfo, DeviceInfo } from '../models/syncState';
import {
  createEmptySyncState,
  updatePromptSync,
  removePromptSync,
  updateLastSynced,
} from '../models/syncState';

/**
 * Storage provider for sync state
 *
 * Handles reading and writing sync state with atomic operations
 * to prevent file corruption during concurrent access.
 */
/** Current schema version - increment when making breaking changes */
const CURRENT_SCHEMA_VERSION = 3;

export class SyncStateStorage {
  private readonly syncStateFile: string;
  private readonly syncStateDir: string;
  private readonly workspaceMetaFile: string;

  /**
   * Create a new sync state storage instance
   *
   * @param workspaceRoot - Absolute path to workspace root
   * @param options - Optional config to override the default storage directory
   */
  constructor(workspaceRoot: string, options?: { storagePath?: string }) {
    this.syncStateDir = options?.storagePath ?? path.join(workspaceRoot, '.vscode', 'prompt-bank');
    this.syncStateFile = path.join(this.syncStateDir, 'sync-state.json');
    this.workspaceMetaFile = path.join(this.syncStateDir, 'workspace-meta.json');
  }

  /**
   * Get current sync state (or null if never synced)
   *
   * Automatically migrates older sync states to current schema version.
   *
   * @returns Sync state or null if file doesn't exist
   */
  async getSyncState(): Promise<SyncState | null> {
    try {
      const content = await fs.readFile(this.syncStateFile, 'utf8');
      const parsed = JSON.parse(content) as SyncState;

      // Convert ISO date strings back to Date objects
      let state = this.deserializeDates(parsed);

      // Migrate older sync states if needed
      state = await this.migrateIfNeeded(state);

      return state;
    } catch (error: unknown) {
      if (this.isFileNotFoundError(error)) {
        return null; // File doesn't exist yet - first sync
      }
      throw error;
    }
  }

  /**
   * Initialize sync state for a new device/workspace
   *
   * @param userId - User email from OAuth
   * @param deviceInfo - Device information
   * @param workspaceId - Workspace identifier (UUID from workspace-meta.json)
   */
  async initializeSyncState(
    userId: string,
    deviceInfo: DeviceInfo,
    workspaceId: string
  ): Promise<SyncState> {
    const emptyState = createEmptySyncState(userId, deviceInfo.id, deviceInfo.name, workspaceId);

    await this.saveSyncState(emptyState);
    return emptyState;
  }

  /**
   * Update sync state (full replacement)
   *
   * Uses atomic write (temp file + rename) to prevent corruption
   *
   * @param state - New sync state
   */
  async saveSyncState(state: SyncState): Promise<void> {
    // Ensure directory exists
    await fs.mkdir(this.syncStateDir, { recursive: true });

    // Serialize dates to ISO strings
    const serialized = this.serializeDates(state);

    // Atomic write: write to temp file, then rename
    const tempFile = `${this.syncStateFile}.tmp`;
    await fs.writeFile(tempFile, JSON.stringify(serialized, null, 2), 'utf8');
    await fs.rename(tempFile, this.syncStateFile);
  }

  /**
   * Update sync state with new last synced timestamp
   */
  async updateLastSyncedAt(): Promise<void> {
    const state = await this.getSyncState();
    if (!state) {
      throw new Error('Cannot update last synced: sync state not initialized');
    }

    const updated = updateLastSynced(state);
    await this.saveSyncState(updated);
  }

  /**
   * Get sync info for a specific prompt
   *
   * @param promptId - Local prompt ID
   * @returns Sync info or null if prompt not synced
   */
  async getPromptSyncInfo(promptId: string): Promise<PromptSyncInfo | null> {
    const state = await this.getSyncState();
    return state?.promptSyncMap[promptId] ?? null;
  }

  /**
   * Set sync info for a specific prompt
   *
   * @param promptId - Local prompt ID
   * @param info - Sync information
   */
  async setPromptSyncInfo(promptId: string, info: PromptSyncInfo): Promise<void> {
    let state = await this.getSyncState();
    if (!state) {
      throw new Error('Cannot set prompt sync info: sync state not initialized');
    }

    state = updatePromptSync(state, promptId, info);
    await this.saveSyncState(state);
  }

  /**
   * Update sync info for multiple prompts atomically
   *
   * More efficient than calling setPromptSyncInfo multiple times
   *
   * @param updates - Map of promptId → syncInfo
   */
  async batchUpdatePromptSyncInfo(updates: ReadonlyMap<string, PromptSyncInfo>): Promise<void> {
    let state = await this.getSyncState();
    if (!state) {
      throw new Error('Cannot batch update sync info: sync state not initialized');
    }

    for (const [promptId, info] of updates) {
      state = updatePromptSync(state, promptId, info);
    }

    await this.saveSyncState(state);
  }

  /**
   * Remove sync info for a deleted prompt
   *
   * @param promptId - Local prompt ID
   */
  async removePromptSyncInfo(promptId: string): Promise<void> {
    const state = await this.getSyncState();
    if (!state) {
      return; // Nothing to remove
    }

    const updated = removePromptSync(state, promptId);
    await this.saveSyncState(updated);
  }

  /**
   * Remove sync info for multiple prompts atomically
   *
   * @param promptIds - Array of local prompt IDs
   */
  async batchRemovePromptSyncInfo(promptIds: ReadonlyArray<string>): Promise<void> {
    let state = await this.getSyncState();
    if (!state) {
      return;
    }

    for (const promptId of promptIds) {
      state = removePromptSync(state, promptId);
    }

    await this.saveSyncState(state);
  }

  /**
   * Clear all sync state (for sign-out or reset)
   *
   * Deletes the sync-state.json file entirely
   */
  async clearAllSyncState(): Promise<void> {
    try {
      await fs.unlink(this.syncStateFile);
    } catch (error: unknown) {
      if (!this.isFileNotFoundError(error)) {
        throw error;
      }
      // File doesn't exist - nothing to clear
    }
  }

  /**
   * Get all prompts that have sync info
   *
   * @returns Array of [promptId, syncInfo] entries
   */
  async getAllSyncedPrompts(): Promise<ReadonlyArray<readonly [string, PromptSyncInfo]>> {
    const state = await this.getSyncState();
    if (!state) {
      return [];
    }

    return Object.entries(state.promptSyncMap);
  }

  /**
   * Find local prompt ID by cloud ID
   *
   * Useful for mapping remote prompts back to local prompts
   *
   * @param cloudId - Cloud prompt ID
   * @returns Local prompt ID or null if not found
   */
  async findLocalPromptId(cloudId: string): Promise<string | null> {
    const state = await this.getSyncState();
    if (!state) {
      return null;
    }

    for (const [promptId, syncInfo] of Object.entries(state.promptSyncMap)) {
      if (syncInfo.cloudId === cloudId) {
        return promptId;
      }
    }

    return null;
  }

  /**
   * Mark a prompt as deleted locally
   *
   * @param promptId - Local prompt ID
   */
  async markPromptAsDeleted(promptId: string): Promise<void> {
    const state = await this.getSyncState();
    if (!state) {
      throw new Error('Cannot mark prompt as deleted: sync state not initialized');
    }

    const existingInfo = state.promptSyncMap[promptId];
    if (!existingInfo) {
      // Prompt not synced yet, nothing to mark
      return;
    }

    const updated = updatePromptSync(state, promptId, {
      ...existingInfo,
      isDeleted: true,
      deletedAt: new Date(),
    });

    await this.saveSyncState(updated);
  }

  /**
   * Update sync info for a specific prompt (allows partial updates)
   *
   * @param promptId - Local prompt ID
   * @param updates - Partial sync info to update
   */
  async updatePromptSyncInfo(promptId: string, updates: Partial<PromptSyncInfo>): Promise<void> {
    const state = await this.getSyncState();
    if (!state) {
      throw new Error('Cannot update prompt sync info: sync state not initialized');
    }

    const existingInfo = state.promptSyncMap[promptId];
    if (!existingInfo) {
      throw new Error(`Cannot update sync info: prompt ${promptId} not synced`);
    }

    const updated = updatePromptSync(state, promptId, {
      ...existingInfo,
      ...updates,
    } as PromptSyncInfo);

    await this.saveSyncState(updated);
  }

  /**
   * Get all deleted prompts (for restore feature)
   *
   * @returns Array of [promptId, syncInfo] entries for deleted prompts
   */
  async getDeletedPrompts(): Promise<ReadonlyArray<{ promptId: string; info: PromptSyncInfo }>> {
    const state = await this.getSyncState();
    if (!state) {
      return [];
    }

    return Object.entries(state.promptSyncMap)
      .filter(([_, info]) => info.isDeleted === true)
      .map(([promptId, info]) => ({ promptId, info }));
  }

  /**
   * Update sync state (allows partial updates)
   *
   * @param updates - Partial sync state to update
   */
  async updateSyncState(updates: Partial<SyncState>): Promise<void> {
    const state = await this.getSyncState();
    if (!state) {
      throw new Error('Cannot update sync state: not initialized');
    }

    const updated = {
      ...state,
      ...updates,
    };

    await this.saveSyncState(updated);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Serialize dates to ISO strings for JSON storage
   */
  private serializeDates(state: SyncState): unknown {
    return {
      ...state,
      lastSyncedAt: state.lastSyncedAt?.toISOString(),
      promptSyncMap: Object.fromEntries(
        Object.entries(state.promptSyncMap).map(([id, info]) => [
          id,
          {
            ...info,
            lastSyncedAt: info.lastSyncedAt.toISOString(),
            deletedAt: info.deletedAt?.toISOString(),
          },
        ])
      ),
    };
  }

  /**
   * Deserialize ISO strings back to Date objects
   */
  private deserializeDates(parsed: SyncState): SyncState {
    const result: SyncState = {
      ...parsed,
      promptSyncMap: Object.fromEntries(
        Object.entries(parsed.promptSyncMap).map(([id, info]) => {
          const deserialized: PromptSyncInfo = {
            ...info,
            lastSyncedAt: new Date(info.lastSyncedAt),
          };

          // Only add deletedAt if it exists
          if (info.deletedAt) {
            deserialized.deletedAt = new Date(info.deletedAt);
          }

          return [id, deserialized];
        })
      ),
    };

    // Only add lastSyncedAt if it exists (optional property)
    if (parsed.lastSyncedAt) {
      return {
        ...result,
        lastSyncedAt: new Date(parsed.lastSyncedAt),
      };
    }

    return result;
  }

  /**
   * Type guard to check if error is ENOENT (file not found)
   */
  private isFileNotFoundError(error: unknown): boolean {
    return (
      typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
    );
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Migration helpers
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Migrate sync state to current schema version if needed
   *
   * Handles:
   * - Schema v2 → v3: Add workspaceId from workspace-meta.json
   */
  private async migrateIfNeeded(state: SyncState): Promise<SyncState> {
    const currentVersion = state.schemaVersion ?? 2; // Assume v2 if not present

    if (currentVersion >= CURRENT_SCHEMA_VERSION && state.workspaceId) {
      return state; // Already up to date
    }

    let migratedState = state;

    // Migration: v2 → v3 (add workspaceId)
    if (!state.workspaceId) {
      const workspaceId = await this.readWorkspaceIdFromMeta();
      if (workspaceId) {
        migratedState = {
          ...migratedState,
          workspaceId,
          schemaVersion: CURRENT_SCHEMA_VERSION,
        };
        console.log(
          `[SyncStateStorage] Migrated sync state to v${CURRENT_SCHEMA_VERSION} with workspaceId: ${workspaceId.substring(0, 8)}...`
        );
      } else {
        // No workspace-meta.json exists yet - will be created on next sync
        console.log(
          '[SyncStateStorage] No workspace-meta.json found, skipping workspaceId migration'
        );
        return state;
      }
    }

    // Save migrated state
    await this.saveSyncState(migratedState);

    return migratedState;
  }

  /**
   * Read workspace ID from workspace-meta.json
   *
   * @returns Workspace ID or null if file doesn't exist
   */
  private async readWorkspaceIdFromMeta(): Promise<string | null> {
    try {
      const content = await fs.readFile(this.workspaceMetaFile, 'utf8');
      const parsed = JSON.parse(content) as { workspaceId?: string };
      return parsed.workspaceId ?? null;
    } catch (error: unknown) {
      if (this.isFileNotFoundError(error)) {
        return null;
      }
      throw error;
    }
  }
}
