/**
 * PersonalTransport — Personal mode I/O for SyncEngine
 *
 * Wraps all personal-mode edge function calls extracted from SyncService:
 * sync-prompt, get-user-prompts, delete-prompt, restore-prompt,
 * get-user-quota, register-workspace.
 */

import * as vscode from 'vscode';
import type { Prompt } from '../../models/prompt';
import type {
  RemotePrompt,
  PromptSyncInfo,
  SyncConflictError,
  UserQuota,
} from '../../models/syncState';
import { SyncConflictType } from '../../models/syncState';
import { SupabaseClientManager } from '../supabaseClient';
import type { AuthService } from '../authService';
import type { WorkspaceMetadataService } from '../workspaceMetadataService';
import { computeContentHash } from '../../utils/contentHash';
import { getDeviceInfo } from '../../utils/deviceId';
import type { SyncTransport, WritePermission } from './syncTransport';

export class PersonalTransport implements SyncTransport {
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly authService: AuthService,
    private readonly workspaceMetadataService: WorkspaceMetadataService
  ) {}

  private async getWorkspaceId(): Promise<string> {
    return this.workspaceMetadataService.getOrCreateWorkspaceId();
  }

  private getWorkspaceName(): string {
    const folders = vscode.workspace.workspaceFolders;
    return folders?.[0]?.name ?? 'Unnamed Workspace';
  }

  // ────────────────────────────────────────────────────────────────────────────
  // SyncTransport Implementation
  // ────────────────────────────────────────────────────────────────────────────

  async fetchRemotePrompts(includeDeleted = false): Promise<readonly RemotePrompt[]> {
    const supabase = SupabaseClientManager.get();
    const workspaceId = await this.getWorkspaceId();

    try {
      const { data, error } = await supabase.functions.invoke('get-user-prompts', {
        body: {
          workspaceId,
          includeDeleted,
        },
      });

      if (error) {
        const errorMessage = error.message || String(error);
        const errorContext = (error as { context?: { status?: number } }).context;

        if (
          errorContext?.status === 401 ||
          errorMessage.toLowerCase().includes('invalid jwt') ||
          errorMessage.toLowerCase().includes('unauthorized')
        ) {
          console.warn('[PersonalTransport] Detected invalid JWT error. Clearing tokens...');
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
        if (error.message.includes('session has expired')) {
          throw error;
        }
        throw new Error(`Failed to fetch remote prompts: ${error.message}`);
      }
      throw error;
    }
  }

  async uploadPrompt(
    prompt: Prompt,
    syncInfo?: PromptSyncInfo
  ): Promise<{ cloudId: string; version: number }> {
    const supabase = SupabaseClientManager.get();
    const contentHash = computeContentHash(prompt);
    const deviceInfo = await getDeviceInfo(this.context);
    const workspaceId = await this.getWorkspaceId();

    const body = {
      workspaceId,
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
        const errorMessage = error.message || String(error);
        const errorContext = (error as { context?: { status?: number } }).context;

        if (
          errorContext?.status === 401 ||
          errorMessage.toLowerCase().includes('invalid jwt') ||
          errorMessage.toLowerCase().includes('unauthorized')
        ) {
          console.warn(
            '[PersonalTransport] Detected invalid JWT error during upload. Clearing tokens...'
          );
          await this.authService.clearInvalidTokens();
          throw new Error(
            'Your session has expired. Please try syncing again to sign in with a new session.'
          );
        }

        // Check for 409 conflict - Need to parse Response object to get error details
        if (errorContext?.status === 409) {
          const response = errorContext as unknown as Response;
          let responseBody: any;

          try {
            const clonedResponse = response.clone();
            responseBody = await clonedResponse.json();
          } catch (parseError) {
            console.warn('[PersonalTransport] Failed to parse 409 response body:', parseError);
            throw new Error('Sync conflict detected but response body could not be parsed');
          }

          const conflictError = new Error(responseBody?.message || 'Sync conflict');
          (conflictError as any).context = {
            status: 409,
            error: responseBody?.error,
            details: responseBody?.details,
          };
          throw conflictError;
        }

        throw error;
      }

      return data as { cloudId: string; version: number };
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('session has expired')) {
          throw error;
        }
        if ((error as any).context) {
          throw error;
        }
        throw new Error(`Failed to upload prompt: ${error.message}`);
      }
      throw error;
    }
  }

  async deletePrompt(cloudId: string): Promise<void> {
    const supabase = SupabaseClientManager.get();
    const deviceInfo = await getDeviceInfo(this.context);
    const workspaceId = await this.getWorkspaceId();

    const { error } = await supabase.functions.invoke('delete-prompt', {
      body: { workspaceId, cloudId, deviceId: deviceInfo.id },
    });

    if (error) {
      const errorContext = (error as { context?: { status?: number } }).context;
      if (errorContext?.status === 404) {
        console.info(`[PersonalTransport] Prompt ${cloudId} already deleted in cloud`);
        return;
      }
      throw new Error(`Failed to delete prompt: ${error.message}`);
    }
  }

  parseSyncConflictError(error: unknown): SyncConflictError | null {
    if (!(error instanceof Error)) {
      return null;
    }

    const errorContext = (
      error as { context?: { status?: number; error?: string; details?: unknown } }
    ).context;

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
    if (error.message?.includes('conflict') || errorContext.error === 'conflict') {
      console.warn(
        '[PersonalTransport] Received legacy 409 conflict format. Assuming PROMPT_DELETED.'
      );
      return {
        code: SyncConflictType.PROMPT_DELETED,
        message: 'Conflict detected (legacy format)',
      };
    }

    return null;
  }

  getWritePermission(): WritePermission {
    return { canUpload: true, canDelete: true };
  }

  async getIdentity(): Promise<string> {
    // For personal mode, device name comes from sync state (set during init)
    // We use the device info utility directly
    const deviceInfo = await getDeviceInfo(this.context);
    return deviceInfo.name;
  }

  async checkQuota(uploadCount: number, uploadSizeBytes: number): Promise<void> {
    const quota = await this.fetchUserQuota();

    if (quota.promptCount + uploadCount > quota.promptLimit) {
      const overage = uploadCount - (quota.promptLimit - quota.promptCount);
      throw new Error(
        `Cannot sync: would exceed limit by ${overage} prompts. ` +
          `Delete ${overage} prompts and try again.`
      );
    }

    if (quota.storageBytes + uploadSizeBytes > quota.storageLimit) {
      const overageMB = (
        (quota.storageBytes + uploadSizeBytes - quota.storageLimit) / 1048576
      ).toFixed(1);
      throw new Error(
        `Cannot sync: would exceed 10 MB storage limit by ${overageMB} MB. ` +
          `Delete some prompts and try again.`
      );
    }

    if (quota.percentageUsed > 90) {
      void vscode.window.showWarningMessage(
        `You're using ${quota.percentageUsed}% of your storage quota. ` +
          `Consider deleting old prompts.`
      );
    }
  }

  async registerWorkspace(): Promise<void> {
    try {
      const supabase = SupabaseClientManager.get();
      const workspaceId = await this.getWorkspaceId();
      const workspaceName = this.getWorkspaceName();
      const deviceInfo = await getDeviceInfo(this.context);

      const { error } = await supabase.functions.invoke('register-workspace', {
        body: {
          workspaceId,
          workspaceName,
          deviceName: deviceInfo.name,
        },
      });

      if (error) {
        console.warn('[PersonalTransport] Failed to register workspace:', error.message);
      }
    } catch (error) {
      console.warn(
        '[PersonalTransport] Error registering workspace:',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Personal-only helpers
  // ────────────────────────────────────────────────────────────────────────────

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
   * Restore a soft-deleted prompt in the cloud (used by SyncService public API)
   */
  async restorePrompt(cloudId: string): Promise<void> {
    const supabase = SupabaseClientManager.get();
    const workspaceId = await this.getWorkspaceId();

    const { error } = await supabase.functions.invoke('restore-prompt', {
      body: { workspaceId, cloudId },
    });

    if (error) {
      throw new Error(`Failed to restore prompt: ${error.message}`);
    }
  }
}
