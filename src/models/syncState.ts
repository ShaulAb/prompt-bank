/**
 * Sync state models for personal prompt synchronization
 *
 * CRITICAL: Sync state is stored separately from Prompt objects to prevent
 * infinite loops (modifying sync state would trigger metadata.modified updates)
 */

/**
 * Complete sync state for the current workspace
 * Stored in: .vscode/prompt-bank/sync-state.json
 */
export interface SyncState {
  /** User's email from Google OAuth (unique identifier) */
  readonly userId: string;

  /** Stable device identifier (persists across sessions) */
  readonly deviceId: string;

  /** Human-readable device name (e.g., "MacBook Pro (Mac)") */
  readonly deviceName: string;

  /** Last successful sync timestamp */
  lastSyncedAt?: Date;

  /** Map: promptId → sync information for that prompt */
  promptSyncMap: Readonly<Record<string, PromptSyncInfo>>;
}

/**
 * Sync information for a single prompt
 * Tracks cloud ID and content hash to detect conflicts
 */
export interface PromptSyncInfo {
  /** UUID in cloud storage (different from local prompt ID) */
  readonly cloudId: string;

  /** SHA256 hash of (title + content + category) at last sync */
  readonly lastSyncedContentHash: string;

  /** When this specific prompt was last synced */
  readonly lastSyncedAt: Date;

  /** Version number from database (for optimistic locking) */
  readonly version: number;
}

/**
 * Remote prompt structure as returned from Supabase
 * Matches the user_prompts table schema
 */
export interface RemotePrompt {
  readonly id: string;
  readonly user_id: string;
  readonly cloud_id: string;
  readonly local_id: string;
  readonly title: string;
  readonly content: string;
  readonly description: string | null;
  readonly category: string;
  readonly prompt_order: number | null;
  readonly category_order: number | null;
  readonly variables: unknown; // JSONB
  readonly metadata: unknown; // JSONB
  readonly sync_metadata: unknown; // JSONB
  readonly version: number;
  readonly content_hash: string;
  readonly created_at: string; // ISO timestamp
  readonly updated_at: string; // ISO timestamp
}

/**
 * User quota information from Supabase
 */
export interface UserQuota {
  readonly promptCount: number;
  readonly promptLimit: number; // 1000
  readonly storageBytes: number;
  readonly storageLimit: number; // 10485760 (10 MB)
  readonly percentageUsed: number;
}

/**
 * Sync plan computed by three-way merge algorithm
 */
export interface SyncPlan {
  /** Prompts to upload to cloud */
  toUpload: unknown[]; // Array<Prompt> - mutable for building plan

  /** Prompts to download from cloud */
  toDownload: RemotePrompt[];

  /** Prompts with conflicts (modified both locally and remotely) */
  conflicts: SyncConflict[];
}

/**
 * A conflict between local and remote versions of a prompt
 */
export interface SyncConflict {
  readonly local: unknown; // Prompt
  readonly remote: RemotePrompt;
}

/**
 * Result of a sync operation
 */
export interface SyncResult {
  readonly stats: SyncStats;
  readonly conflicts?: ReadonlyArray<SyncConflict>;
}

/**
 * Statistics from a sync operation
 */
export interface SyncStats {
  uploaded: number;
  downloaded: number;
  conflicts: number;
  duration: number; // milliseconds
}

/**
 * Device information
 */
export interface DeviceInfo {
  readonly id: string;
  readonly name: string;
  readonly platform: 'win32' | 'darwin' | 'linux';
  readonly hostname: string;
}

/**
 * Create an empty sync state for a new device
 */
export const createEmptySyncState = (
  userId: string,
  deviceId: string,
  deviceName: string
): SyncState => ({
  userId,
  deviceId,
  deviceName,
  promptSyncMap: Object.freeze({}),
});

/**
 * Create a new PromptSyncInfo entry
 */
export const createPromptSyncInfo = (
  cloudId: string,
  contentHash: string,
  version: number = 1
): PromptSyncInfo => ({
  cloudId,
  lastSyncedContentHash: contentHash,
  lastSyncedAt: new Date(),
  version,
});

/**
 * Update sync state with new last synced timestamp
 */
export const updateLastSynced = (state: SyncState): SyncState => ({
  ...state,
  lastSyncedAt: new Date(),
});

/**
 * Add or update prompt sync info in sync state
 */
export const updatePromptSync = (
  state: SyncState,
  promptId: string,
  syncInfo: PromptSyncInfo
): SyncState => ({
  ...state,
  promptSyncMap: Object.freeze({
    ...state.promptSyncMap,
    [promptId]: syncInfo,
  }),
});

/**
 * Remove prompt sync info from sync state
 */
export const removePromptSync = (
  state: SyncState,
  promptId: string
): SyncState => {
  const { [promptId]: _, ...rest } = state.promptSyncMap;
  return {
    ...state,
    promptSyncMap: Object.freeze(rest),
  };
};
