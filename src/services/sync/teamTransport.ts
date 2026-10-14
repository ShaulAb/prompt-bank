/**
 * TeamTransport — Team mode I/O for SyncEngine
 *
 * Wraps all team-mode edge function calls:
 * sync-team-prompt, get-team-prompts with role gating.
 */

import * as vscode from 'vscode';
import type { Prompt } from '../../models/prompt';
import type {
  RemotePrompt,
  PromptSyncInfo,
  SyncConflictError,
} from '../../models/syncState';
import { SyncConflictType } from '../../models/syncState';
import { SupabaseClientManager } from '../supabaseClient';
import type { AuthService } from '../authService';
import type { TeamRole } from '../../models/team';
import { canEdit, canDelete } from '../../models/team';
import { computeContentHash } from '../../utils/contentHash';
import { getDeviceInfo } from '../../utils/deviceId';
import type { SyncTransport, WritePermission } from './syncTransport';

export class TeamTransport implements SyncTransport {
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly authService: AuthService,
    private readonly teamId: string,
    private readonly teamRole: TeamRole
  ) {}

  async fetchRemotePrompts(includeDeleted = false): Promise<readonly RemotePrompt[]> {
    const supabase = SupabaseClientManager.get();

    const { data, error } = await supabase.functions.invoke('get-team-prompts', {
      body: { teamId: this.teamId, includeDeleted },
    });

    if (error) {
      const errorContext = (error as { context?: { status?: number } }).context;
      if (errorContext?.status === 401) {
        await this.authService.clearInvalidTokens();
        throw new Error('Your session has expired. Please sign in again.');
      }
      if (errorContext?.status === 403) {
        throw new Error('You are not a member of this team.');
      }
      throw new Error(`Failed to fetch team prompts: ${error.message}`);
    }

    return (data as { prompts: RemotePrompt[] }).prompts || [];
  }

  async uploadPrompt(
    prompt: Prompt,
    syncInfo?: PromptSyncInfo
  ): Promise<{ cloudId: string; version: number }> {
    const supabase = SupabaseClientManager.get();
    const contentHash = computeContentHash(prompt);
    const deviceInfo = await getDeviceInfo(this.context);

    const body = {
      teamId: this.teamId,
      cloudId: syncInfo?.cloudId,
      expectedVersion: syncInfo?.version,
      contentHash,
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
      const { data, error } = await supabase.functions.invoke('sync-team-prompt', {
        body,
      });

      if (error) {
        const errorContext = (error as { context?: { status?: number } }).context;

        if (errorContext?.status === 401) {
          await this.authService.clearInvalidTokens();
          throw new Error('Session expired during team sync.');
        }

        if (errorContext?.status === 403) {
          const insufficientRoleError = new Error('Insufficient permissions to edit team prompts.');
          (insufficientRoleError as any).context = {
            status: 403,
            error: 'INSUFFICIENT_ROLE',
          };
          throw insufficientRoleError;
        }

        // Check for 409 conflict
        if (errorContext?.status === 409) {
          const response = errorContext as unknown as Response;
          let responseBody: any;

          try {
            const clonedResponse = response.clone();
            responseBody = await clonedResponse.json();
          } catch {
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

        throw new Error(`Team prompt upload failed: ${error.message}`);
      }

      const uploadData = data as { cloudId: string; version: number };
      return { cloudId: uploadData.cloudId, version: uploadData.version };
    } catch (error) {
      if (error instanceof Error) {
        if ((error as any).context) {
          throw error;
        }
        if (
          error.message.includes('Session expired') ||
          error.message.includes('Insufficient permissions')
        ) {
          throw error;
        }
        throw new Error(`Team prompt upload failed: ${error.message}`);
      }
      throw error;
    }
  }

  async deletePrompt(cloudId: string): Promise<void> {
    // Team mode doesn't currently support cloud deletion from extension
    // (handled by admin through web UI)
    console.warn(`[TeamTransport] Cloud deletion not supported for team prompts (cloudId: ${cloudId})`);
  }

  parseSyncConflictError(error: unknown): SyncConflictError | null {
    if (!(error instanceof Error)) {
      return null;
    }

    const errorContext = (
      error as { context?: { status?: number; error?: string; details?: unknown } }
    ).context;

    if (!errorContext) {
      return null;
    }

    // Handle 403 INSUFFICIENT_ROLE as a special conflict type
    if (errorContext.status === 403 && errorContext.error === 'INSUFFICIENT_ROLE') {
      return null; // Let the caller handle permission errors directly
    }

    if (errorContext.status !== 409) {
      return null;
    }

    if (
      errorContext.error &&
      Object.values(SyncConflictType).includes(errorContext.error as SyncConflictType)
    ) {
      return {
        code: errorContext.error as SyncConflictType,
        message: error.message || 'Sync conflict',
        ...(errorContext.details
          ? { details: errorContext.details as NonNullable<SyncConflictError['details']> }
          : {}),
      };
    }

    if (error.message?.includes('conflict') || errorContext.error === 'conflict') {
      return {
        code: SyncConflictType.PROMPT_DELETED,
        message: 'Conflict detected (legacy format)',
      };
    }

    return null;
  }

  getWritePermission(): WritePermission {
    return {
      canUpload: canEdit(this.teamRole),
      canDelete: canDelete(this.teamRole),
    };
  }

  async getIdentity(): Promise<string> {
    const deviceInfo = await getDeviceInfo(this.context);
    return deviceInfo.name;
  }
}
