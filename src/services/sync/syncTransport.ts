/**
 * Transport interface for SyncEngine
 *
 * Defines the contract between the sync engine (merge algorithm + conflict resolution)
 * and mode-specific I/O (personal vs team). Each transport handles its own edge functions,
 * role checks, and workspace scoping.
 */

import type { Prompt } from '../../models/prompt';
import type {
  RemotePrompt,
  PromptSyncInfo,
  SyncConflictError,
} from '../../models/syncState';

/**
 * Write permission descriptor returned by transport
 */
export interface WritePermission {
  readonly canUpload: boolean;
  readonly canDelete: boolean;
}

/**
 * Transport interface between SyncEngine and mode-specific I/O
 *
 * Personal transport: calls sync-prompt, get-user-prompts, delete-prompt, etc.
 * Team transport: calls sync-team-prompt, get-team-prompts with role gating.
 */
export interface SyncTransport {
  /** Fetch remote prompts from cloud */
  fetchRemotePrompts(includeDeleted: boolean): Promise<readonly RemotePrompt[]>;

  /** Upload a prompt to cloud with optimistic locking */
  uploadPrompt(
    prompt: Prompt,
    syncInfo?: PromptSyncInfo
  ): Promise<{ cloudId: string; version: number }>;

  /** Soft-delete a prompt in cloud */
  deletePrompt(cloudId: string): Promise<void>;

  /** Parse 409 responses into SyncConflictError */
  parseSyncConflictError(error: unknown): SyncConflictError | null;

  /** Get write permission for the current user/role */
  getWritePermission(): WritePermission;

  /** Get attribution name for conflict copies (device name) */
  getIdentity(): Promise<string>;

  /** Pre-flight quota check (personal only, optional) */
  checkQuota?(uploadCount: number, uploadSizeBytes: number): Promise<void>;

  /** Register workspace in cloud (personal only, optional) */
  registerWorkspace?(): Promise<void>;
}

/**
 * Configuration flags for SyncEngine behavior differences
 */
export interface SyncEngineConfig {
  /** Handle web-created prompts (toAssignLocalId phase) — personal only */
  handleWebCreatedPrompts: boolean;

  /** Handle cloud deletion (toDelete phase for locally-deleted prompts) — personal only */
  handleCloudDeletion: boolean;

  /** Run pre-flight quota check before uploading — personal only */
  checkQuota: boolean;
}

/**
 * Local prompt store interface for SyncEngine to save/delete prompts locally
 *
 * PromptService satisfies this for personal mode.
 * FileStorageProvider.save()/delete() get wrapped for team mode.
 */
export interface LocalPromptStore {
  savePromptDirectly(prompt: Prompt): Promise<Prompt>;
  deletePromptById(id: string): Promise<boolean>;
}
