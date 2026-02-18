/**
 * Sync service for personal prompt synchronization
 *
 * Delegates to SyncEngine (shared three-way merge algorithm) + PersonalTransport
 * (personal-mode I/O) for the actual sync work. This service owns authentication,
 * sync state lifecycle, and the public API.
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
  SyncResult,
  PromptSyncInfo,
} from '../models/syncState';
import { SyncStateStorage } from '../storage/syncStateStorage';
import { AuthService } from './authService';
import { WorkspaceMetadataService } from './workspaceMetadataService';
import { SupabaseClientManager } from './supabaseClient';
import { getDeviceInfo } from '../utils/deviceId';
import type { PromptService } from './promptService';
import { SyncEngine, SYNC_ERROR_CODES, PersonalTransport } from './sync';
import type { SyncEngineConfig } from './sync';

/**
 * Sync service using dependency injection
 *
 * Coordinates between local storage, Supabase backend, and VS Code UI
 * to provide seamless multi-device synchronization.
 */
export class SyncService {
  private syncStateStorage: SyncStateStorage;
  private authService: AuthService;
  private workspaceMetadataService: WorkspaceMetadataService;

  /**
   * Create a new SyncService instance using dependency injection.
   *
   * @param context - VS Code extension context
   * @param workspaceRoot - Absolute path to workspace root directory
   * @param authService - Injected auth service for authentication
   * @param syncStateStorage - Injected sync state storage for managing sync metadata
   * @param workspaceMetadataService - Injected workspace metadata service for workspace identity
   */
  constructor(
    private context: vscode.ExtensionContext,
    _workspaceRoot: string,
    authService: AuthService,
    syncStateStorage: SyncStateStorage,
    workspaceMetadataService: WorkspaceMetadataService
  ) {
    this.authService = authService;
    this.syncStateStorage = syncStateStorage;
    this.workspaceMetadataService = workspaceMetadataService;
  }

  /**
   * Get workspace ID from metadata file (creates if needed)
   */
  private async getWorkspaceId(): Promise<string> {
    return this.workspaceMetadataService.getOrCreateWorkspaceId();
  }

  /**
   * Get or create sync state for current user and device
   */
  private async getOrCreateSyncState(userId: string): Promise<SyncState> {
    let state = await this.syncStateStorage.getSyncState();

    if (!state) {
      const deviceInfo = await getDeviceInfo(this.context);
      const workspaceId = await this.getWorkspaceId();
      state = await this.syncStateStorage.initializeSyncState(userId, deviceInfo, workspaceId);
    }

    return state;
  }

  /**
   * Validate authentication and set session on Supabase client
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

    await SupabaseClientManager.setSession(token, refreshToken);

    return { email, token, refreshToken };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Public API
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Perform full sync operation
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

    // 2. Create transport and engine
    const transport = new PersonalTransport(
      this.context,
      this.authService,
      this.workspaceMetadataService
    );

    const engineConfig: SyncEngineConfig = {
      handleWebCreatedPrompts: true,
      handleCloudDeletion: true,
      checkQuota: true,
    };

    const engine = new SyncEngine(transport, this.syncStateStorage, engineConfig);

    // 3. Register workspace in cloud (enables web UI workspace selector)
    await transport.registerWorkspace();

    // 4. Get or create sync state
    const syncState = await this.getOrCreateSyncState(email);

    // 5. Fetch remote prompts (including soft-deleted for Phase 6)
    const remotePrompts = await transport.fetchRemotePrompts(true);

    // 6. Compute sync plan (three-way merge)
    const plan = engine.computeSyncPlan(
      localPrompts,
      remotePrompts,
      syncState.lastSyncedAt,
      syncState.promptSyncMap
    );

    // 7. Pre-flight quota check (CRITICAL)
    if (transport.checkQuota) {
      await transport.checkQuota(plan.toUpload.length, engine.calculateUploadSize(plan.toUpload));
    }

    // 8. Execute sync plan
    const result = await engine.executeSyncPlan(plan, promptService);

    // 9. Update last synced timestamp
    await this.syncStateStorage.updateLastSyncedAt();
    return result;
  }

  /**
   * Get current sync state for UI display
   */
  public async getSyncStateInfo(): Promise<{
    userId: string;
    deviceName: string;
    lastSyncedAt: Date | undefined;
    syncedPromptCount: number;
  }> {
    const syncState = await this.syncStateStorage.getSyncState();

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
   */
  public async getDeletedPrompts(): Promise<
    ReadonlyArray<{ promptId: string; info: PromptSyncInfo; title: string }>
  > {
    await this.validateAuthenticationAndSetSession();

    const transport = new PersonalTransport(
      this.context,
      this.authService,
      this.workspaceMetadataService
    );

    const deleted = await this.syncStateStorage.getDeletedPrompts();
    const remotePrompts = await transport.fetchRemotePrompts(true);
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
   */
  public async restoreDeletedPrompts(cloudIds: string[]): Promise<number> {
    await this.validateAuthenticationAndSetSession();

    const transport = new PersonalTransport(
      this.context,
      this.authService,
      this.workspaceMetadataService
    );

    let restored = 0;

    for (const cloudId of cloudIds) {
      try {
        await transport.restorePrompt(cloudId);

        const promptId = await this.syncStateStorage.findLocalPromptId(cloudId);
        if (promptId) {
          const existingInfo = await this.syncStateStorage.getPromptSyncInfo(promptId);
          if (existingInfo) {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { deletedAt, ...updates } = existingInfo;
            await this.syncStateStorage.setPromptSyncInfo(promptId, {
              ...updates,
              isDeleted: false,
            });
          }
        }

        restored++;
      } catch (error) {
        console.error(`Failed to restore prompt ${cloudId}:`, error);
      }
    }

    return restored;
  }

  /**
   * Clear all sync state (for reset)
   */
  public async clearAllSyncState(): Promise<void> {
    await this.syncStateStorage.clearAllSyncState();
  }

  /**
   * Dispose of this service and clean up resources
   */
  public async dispose(): Promise<void> {
    // No timers or intervals to clean up
  }
}

/** Re-export for backward compatibility */
export { SYNC_ERROR_CODES };
