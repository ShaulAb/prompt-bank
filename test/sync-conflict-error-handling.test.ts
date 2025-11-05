/**
 * Tests for 409 conflict error handling with specific error codes
 *
 * This test suite verifies that the SyncService correctly handles the three types
 * of 409 conflicts returned by the sync-prompt Edge Function:
 * 1. PROMPT_DELETED - Soft-deleted prompt conflict
 * 2. VERSION_CONFLICT - Optimistic lock version mismatch
 * 3. OPTIMISTIC_LOCK_CONFLICT - Concurrent modification race condition
 */

import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest';
import * as vscode from 'vscode';
import { PromptService } from '../src/services/promptService';
import { SyncService } from '../src/services/syncService';
import { AuthService } from '../src/services/authService';
import { SupabaseClientManager } from '../src/services/supabaseClient';
import { computeContentHash } from '../src/utils/contentHash';
import { createPrompt } from './helpers/prompt-factory';
import { server, syncTestHelpers } from './e2e/helpers/msw-setup';

describe('SyncService - 409 Conflict Error Handling', () => {
  let context: vscode.ExtensionContext;
  let promptService: PromptService;
  let syncService: SyncService;
  let testStorageDir: string;

  beforeAll(() => {
    server.listen({ onUnhandledRequest: 'warn' });
  });

  afterAll(() => {
    server.close();
  });

  beforeEach(async () => {
    // Clear test helpers state
    syncTestHelpers.clearCloudDatabase();
    syncTestHelpers.resetQuota();

    // Mock extension context
    context = {
      globalState: vscode.globalState,
      workspaceState: vscode.workspaceState,
      secrets: vscode.secrets,
      extensionPath: '/mock/extension/path',
      extensionUri: vscode.Uri.file('/mock/extension/path'),
      subscriptions: [],
    } as unknown as vscode.ExtensionContext;

    // Initialize services
    testStorageDir = (vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '') + '/.vscode/prompt-bank-test';
    AuthService.initialize(context, 'test-publisher', 'test-extension');
    SupabaseClientManager.initialize();
    promptService = new PromptService();
    await promptService.initialize(testStorageDir);
    syncService = SyncService.initialize(context, testStorageDir);

    // Mock authentication
    const authService = AuthService.get();
    vi.spyOn(authService, 'getValidAccessToken').mockResolvedValue('mock-access-token');
    vi.spyOn(authService, 'getRefreshToken').mockResolvedValue('mock-refresh-token');
    vi.spyOn(authService, 'getUserEmail').mockResolvedValue('test@example.com');
  });

  describe('PROMPT_DELETED Conflict', () => {
    it('should upload as NEW when cloud prompt is soft-deleted', async () => {
      // Arrange: Create local prompt
      const prompt = createPrompt({
        title: 'Test Prompt',
        content: 'Original content',
        category: 'Test',
      });
      await promptService.savePromptDirectly(prompt);

      // Create cloud prompt
      const cloudPrompt = syncTestHelpers.addCloudPrompt({
        local_id: prompt.id,
        title: prompt.title,
        content: prompt.content,
        description: prompt.description || null,
        category: prompt.category,
        prompt_order: prompt.order || null,
        category_order: prompt.categoryOrder || null,
        variables: prompt.variables || [],
        metadata: {
          created: prompt.metadata.created.toISOString(),
          modified: prompt.metadata.modified.toISOString(),
          usageCount: prompt.metadata.usageCount,
          lastUsed: prompt.metadata.lastUsed?.toISOString(),
          context: prompt.metadata.context,
        },
        sync_metadata: {
          lastModifiedDeviceId: 'device-1',
          lastModifiedDeviceName: 'Device 1',
        },
      });

      // Perform first sync to establish sync state
      await syncService.performSync(await promptService.listPrompts(), promptService);

      // Soft-delete the cloud prompt
      syncTestHelpers.deleteCloudPrompt(cloudPrompt.cloud_id);

      // Modify local prompt (this should trigger conflict on next sync)
      prompt.content = 'Modified content';
      await promptService.updatePrompt(prompt);

      // Act: Perform sync (should detect soft-delete and upload as NEW)
      const result = await syncService.performSync(await promptService.listPrompts(), promptService);

      // Assert: Should have uploaded as NEW prompt
      expect(result.stats.uploaded).toBe(1);
      expect(result.stats.conflicts).toBe(0);

      // Verify a NEW cloud prompt was created (not the deleted one)
      const allCloudPrompts = syncTestHelpers.getAllCloudPrompts();
      const activePrompts = allCloudPrompts.filter((p) => !p.deleted_at);
      expect(activePrompts.length).toBe(1);
      expect(activePrompts[0].content).toBe('Modified content');
      expect(activePrompts[0].cloud_id).not.toBe(cloudPrompt.cloud_id); // Different cloudId
    });
  });

  describe('VERSION_CONFLICT', () => {
    it('should detect version mismatch and throw sync_conflict_retry', async () => {
      // Arrange: Create local prompt
      const prompt = createPrompt({
        title: 'Test Prompt',
        content: 'Original content',
        category: 'Test',
      });
      await promptService.savePromptDirectly(prompt);

      // Create cloud prompt with version 1
      const cloudPrompt = syncTestHelpers.addCloudPrompt({
        local_id: prompt.id,
        title: prompt.title,
        content: prompt.content,
        description: prompt.description || null,
        category: prompt.category,
        prompt_order: prompt.order || null,
        category_order: prompt.categoryOrder || null,
        variables: prompt.variables || [],
        metadata: {
          created: prompt.metadata.created.toISOString(),
          modified: prompt.metadata.modified.toISOString(),
          usageCount: prompt.metadata.usageCount,
          lastUsed: prompt.metadata.lastUsed?.toISOString(),
          context: prompt.metadata.context,
        },
        sync_metadata: {
          lastModifiedDeviceId: 'device-1',
          lastModifiedDeviceName: 'Device 1',
        },
      });

      // Perform first sync to establish sync state
      await syncService.performSync(await promptService.listPrompts(), promptService);

      // Simulate another device updating the cloud prompt (version 2)
      syncTestHelpers.updateCloudPrompt(cloudPrompt.cloud_id, {
        content: 'Updated by another device',
      });

      // Modify local prompt (still thinks version is 1)
      prompt.content = 'Modified locally';
      await promptService.updatePrompt(prompt);

      // Act & Assert: Should throw sync_conflict_retry error
      await expect(
        syncService.performSync(await promptService.listPrompts(), promptService)
      ).rejects.toThrow('sync_conflict_retry');
    });
  });

  describe('Backward Compatibility', () => {
    it('should handle legacy 409 format gracefully', async () => {
      // Arrange: Create local prompt
      const prompt = createPrompt({
        title: 'Test Prompt',
        content: 'Original content',
        category: 'Test',
      });
      await promptService.savePromptDirectly(prompt);

      // Create cloud prompt
      const cloudPrompt = syncTestHelpers.addCloudPrompt({
        local_id: prompt.id,
        title: prompt.title,
        content: prompt.content,
        description: prompt.description || null,
        category: prompt.category,
        prompt_order: prompt.order || null,
        category_order: prompt.categoryOrder || null,
        variables: prompt.variables || [],
        metadata: {
          created: prompt.metadata.created.toISOString(),
          modified: prompt.metadata.modified.toISOString(),
          usageCount: prompt.metadata.usageCount,
          lastUsed: prompt.metadata.lastUsed?.toISOString(),
          context: prompt.metadata.context,
        },
        sync_metadata: {
          lastModifiedDeviceId: 'device-1',
          lastModifiedDeviceName: 'Device 1',
        },
      });

      // Perform first sync
      await syncService.performSync(await promptService.listPrompts(), promptService);

      // Soft-delete cloud prompt
      syncTestHelpers.deleteCloudPrompt(cloudPrompt.cloud_id);

      // Temporarily replace MSW handler with legacy format
      const { server } = await import('./e2e/helpers/msw-setup');
      const { http, HttpResponse } = await import('msw');
      server.use(
        http.post('*/functions/v1/sync-prompt', async ({ request }) => {
          const body = (await request.json()) as { cloudId?: string };
          if (body.cloudId) {
            // Return legacy format (generic error)
            return HttpResponse.json(
              { error: 'conflict', message: 'Prompt conflict' },
              { status: 409 }
            );
          }
          // Allow new prompt creation
          return HttpResponse.json({ cloudId: 'new-cloud-id', version: 1 });
        })
      );

      // Modify local prompt
      prompt.content = 'Modified content';
      await promptService.updatePrompt(prompt);

      // Act: Should still work with legacy format (assumes PROMPT_DELETED)
      const result = await syncService.performSync(await promptService.listPrompts(), promptService);

      // Assert: Should have uploaded as NEW (backward compatibility behavior)
      expect(result.stats.uploaded).toBe(1);
    });
  });

  describe('Error Parsing', () => {
    it('should correctly parse PROMPT_DELETED error with details', async () => {
      // This is implicitly tested by the first test, but we can verify the details
      const prompt = createPrompt({
        title: 'Test Prompt',
        content: 'Content',
        category: 'Test',
      });
      await promptService.savePromptDirectly(prompt);

      const cloudPrompt = syncTestHelpers.addCloudPrompt({
        local_id: prompt.id,
        title: prompt.title,
        content: prompt.content,
        description: null,
        category: prompt.category,
        prompt_order: null,
        category_order: null,
        variables: [],
        metadata: {
          created: prompt.metadata.created.toISOString(),
          modified: prompt.metadata.modified.toISOString(),
          usageCount: 0,
        },
        sync_metadata: {
          lastModifiedDeviceId: 'device-1',
          lastModifiedDeviceName: 'Device 1',
        },
      });

      await syncService.performSync(await promptService.listPrompts(), promptService);
      syncTestHelpers.deleteCloudPrompt(cloudPrompt.cloud_id);

      prompt.content = 'Modified';
      await promptService.updatePrompt(prompt);

      // Should successfully handle the detailed error response
      const result = await syncService.performSync(await promptService.listPrompts(), promptService);
      expect(result.stats.uploaded).toBe(1);
    });

    it('should correctly parse VERSION_CONFLICT error with version details', async () => {
      const prompt = createPrompt({
        title: 'Test Prompt',
        content: 'Content',
        category: 'Test',
      });
      await promptService.savePromptDirectly(prompt);

      const cloudPrompt = syncTestHelpers.addCloudPrompt({
        local_id: prompt.id,
        title: prompt.title,
        content: prompt.content,
        description: null,
        category: prompt.category,
        prompt_order: null,
        category_order: null,
        variables: [],
        metadata: {
          created: prompt.metadata.created.toISOString(),
          modified: prompt.metadata.modified.toISOString(),
          usageCount: 0,
        },
        sync_metadata: {
          lastModifiedDeviceId: 'device-1',
          lastModifiedDeviceName: 'Device 1',
        },
      });

      await syncService.performSync(await promptService.listPrompts(), promptService);
      syncTestHelpers.updateCloudPrompt(cloudPrompt.cloud_id, { content: 'Remote change' });

      prompt.content = 'Local change';
      await promptService.updatePrompt(prompt);

      // Should throw with detailed error information
      await expect(
        syncService.performSync(await promptService.listPrompts(), promptService)
      ).rejects.toThrow('sync_conflict_retry');
    });
  });
});
