/**
 * Workspace Metadata Service
 *
 * Manages workspace identity via a metadata file stored inside the workspace.
 * This follows the industry-standard pattern used by Git (.git/), VS Code (.vscode/),
 * and Dropbox (.dropbox) - the identity travels WITH the workspace.
 *
 * Benefits:
 * - ID survives folder moves and renames
 * - Same ID across devices when metadata file is synced (Git, Dropbox, etc.)
 * - Can detect cloned/copied workspaces (future enhancement)
 */

import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import {
  WorkspaceMetadata,
  WORKSPACE_METADATA_SCHEMA_VERSION,
  WORKSPACE_METADATA_FILENAME,
} from '../models/workspaceMetadata';
import { getDeviceInfo } from '../utils/deviceId';

/**
 * UUID validation regex
 * Matches: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Service for managing workspace identity metadata
 *
 * The metadata file (.vscode/prompt-bank/workspace-meta.json) ensures stable
 * workspace identity across moves, renames, and different devices.
 */
export class WorkspaceMetadataService {
  private readonly metadataPath: string;
  private cachedMetadata: WorkspaceMetadata | null = null;

  constructor(
    workspaceRoot: string,
    private readonly context: vscode.ExtensionContext
  ) {
    this.metadataPath = path.join(
      workspaceRoot,
      '.vscode',
      'prompt-bank',
      WORKSPACE_METADATA_FILENAME
    );
  }

  /**
   * Get the workspace ID, creating metadata file if needed
   *
   * This is the main entry point - always returns a valid workspace ID.
   * Creates the metadata file on first call if it doesn't exist.
   */
  async getOrCreateWorkspaceId(): Promise<string> {
    const metadata = await this.getOrCreateMetadata();
    return metadata.workspaceId;
  }

  /**
   * Get existing metadata or create new if doesn't exist
   */
  async getOrCreateMetadata(): Promise<WorkspaceMetadata> {
    // Return cached if available
    if (this.cachedMetadata) {
      return this.cachedMetadata;
    }

    // Try to read existing metadata
    const existing = await this.readMetadata();
    if (existing) {
      this.cachedMetadata = existing;

      // Update lastDevice if changed (non-blocking, best-effort)
      this.updateLastDeviceIfNeeded(existing).catch((error) => {
        console.warn('Failed to update lastDevice in workspace metadata:', error);
      });

      return existing;
    }

    // Create new metadata (first sync for this workspace)
    const newMetadata = await this.createMetadata();
    this.cachedMetadata = newMetadata;
    return newMetadata;
  }

  /**
   * Read metadata from file
   *
   * @returns Metadata if file exists and is valid, null otherwise
   */
  private async readMetadata(): Promise<WorkspaceMetadata | null> {
    try {
      const content = await fs.readFile(this.metadataPath, 'utf-8');
      const data = JSON.parse(content) as WorkspaceMetadata;

      // Validate required fields
      if (!data.workspaceId || typeof data.workspaceId !== 'string') {
        console.warn('Invalid workspace metadata: missing or invalid workspaceId');
        return null;
      }

      // Validate UUID format
      if (!this.isValidUUID(data.workspaceId)) {
        console.warn(
          `Invalid workspace metadata: workspaceId "${data.workspaceId}" is not a valid UUID`
        );
        return null;
      }

      return data;
    } catch (error) {
      // File doesn't exist or is invalid JSON - that's OK, we'll create it
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.warn('Error reading workspace metadata:', error);
      }
      return null;
    }
  }

  /**
   * Create new metadata file with generated UUID
   */
  private async createMetadata(): Promise<WorkspaceMetadata> {
    const deviceInfo = await getDeviceInfo(this.context);

    const metadata: WorkspaceMetadata = {
      workspaceId: uuidv4(),
      createdAt: new Date().toISOString(),
      lastDevice: deviceInfo.name,
      schemaVersion: WORKSPACE_METADATA_SCHEMA_VERSION,
    };

    await this.writeMetadata(metadata);

    // Inform user about workspace initialization (non-blocking)
    void vscode.window.showInformationMessage(
      'Prompt Bank: Workspace initialized for sync. Your prompts will be isolated to this workspace.'
    );

    return metadata;
  }

  /**
   * Write metadata to file using atomic operation
   *
   * Uses write-to-temp-then-rename pattern to prevent corruption
   */
  private async writeMetadata(metadata: WorkspaceMetadata): Promise<void> {
    // Ensure directory exists
    const dir = path.dirname(this.metadataPath);
    await fs.mkdir(dir, { recursive: true });

    // Write atomically: write to temp file, then rename
    const tempPath = `${this.metadataPath}.tmp`;
    const content = JSON.stringify(metadata, null, 2);

    await fs.writeFile(tempPath, content, 'utf-8');
    await fs.rename(tempPath, this.metadataPath);
  }

  /**
   * Update lastDevice field if current device is different
   *
   * This helps users understand which device last touched the workspace
   */
  private async updateLastDeviceIfNeeded(metadata: WorkspaceMetadata): Promise<void> {
    const deviceInfo = await getDeviceInfo(this.context);

    if (metadata.lastDevice !== deviceInfo.name) {
      const updated: WorkspaceMetadata = {
        ...metadata,
        lastDevice: deviceInfo.name,
      };

      await this.writeMetadata(updated);
      this.cachedMetadata = updated;
    }
  }

  /**
   * Validate UUID format
   *
   * @param id - String to validate
   * @returns True if valid UUID format
   */
  private isValidUUID(id: string): boolean {
    return UUID_REGEX.test(id);
  }

  /**
   * Clear cached metadata
   *
   * Useful for testing or when metadata file changes externally
   */
  clearCache(): void {
    this.cachedMetadata = null;
  }

  /**
   * Check if metadata file exists (without creating it)
   *
   * @returns True if workspace-meta.json exists
   */
  async hasMetadata(): Promise<boolean> {
    try {
      await fs.access(this.metadataPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the path to the metadata file
   *
   * @returns Absolute path to workspace-meta.json
   */
  getMetadataPath(): string {
    return this.metadataPath;
  }

  /**
   * Dispose of service resources
   */
  dispose(): void {
    this.cachedMetadata = null;
  }
}
