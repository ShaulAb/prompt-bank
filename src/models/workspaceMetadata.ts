/**
 * Workspace metadata for sync isolation
 *
 * This file defines the structure of .vscode/prompt-bank/workspace-meta.json
 * which stores the workspace identity. The metadata file travels WITH the
 * workspace (via Git, Dropbox, manual copy, etc.) ensuring stable identity.
 *
 * Design Philosophy:
 * - Workspace identity must live INSIDE the workspace, not outside
 * - Same pattern as Git (.git/), VS Code (.vscode/), Dropbox (.dropbox)
 * - UUID survives folder moves, renames, and works across devices
 */

/**
 * Workspace metadata stored in .vscode/prompt-bank/workspace-meta.json
 */
export interface WorkspaceMetadata {
  /**
   * Unique identifier for this workspace (UUID v4)
   * This is the primary key for workspace isolation in the cloud
   */
  readonly workspaceId: string;

  /**
   * ISO timestamp when this workspace was first initialized for sync
   */
  readonly createdAt: string;

  /**
   * Human-readable name of the last device that modified this file
   * Useful for debugging and user awareness
   */
  lastDevice: string;

  /**
   * Schema version for future migrations
   * Bump this when changing the metadata format
   */
  readonly schemaVersion: number;
}

/**
 * Current schema version for workspace metadata
 * Increment when making breaking changes to WorkspaceMetadata structure
 */
export const WORKSPACE_METADATA_SCHEMA_VERSION = 1;

/**
 * Filename for workspace metadata
 */
export const WORKSPACE_METADATA_FILENAME = 'workspace-meta.json';

/**
 * Special workspace ID for prompts created before workspace isolation (v0.7.0 and earlier)
 * These prompts belong to a "legacy" workspace and won't sync to new workspaces
 *
 * When upgrading from v0.7.0:
 * - Existing cloud prompts get this workspace_id
 * - New workspaces get proper UUIDs
 * - Legacy prompts remain accessible but isolated
 */
export const LEGACY_WORKSPACE_ID = 'legacy-pre-workspace-isolation';
