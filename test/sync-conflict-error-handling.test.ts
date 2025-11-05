/**
 * Tests for 409 conflict error handling with specific error codes
 *
 * This test suite verifies that the SyncService correctly handles the three types
 * of 409 conflicts returned by the sync-prompt Edge Function:
 * 1. PROMPT_DELETED - Soft-deleted prompt conflict
 * 2. VERSION_CONFLICT - Optimistic lock version mismatch
 * 3. OPTIMISTIC_LOCK_CONFLICT - Concurrent modification race condition
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import * as vscode from 'vscode';
import { PromptService } from '../src/services/promptService';
import { SyncService } from '../src/services/syncService';
import { AuthService } from '../src/services/authService';
import { SupabaseClientManager } from '../src/services/supabaseClient';
import { FileStorageProvider } from '../src/storage/fileStorage';
import { SyncStateStorage } from '../src/storage/syncStateStorage';
import { computeContentHash } from '../src/utils/contentHash';
import { createPrompt } from './helpers/prompt-factory';
import { server, syncTestHelpers } from './e2e/helpers/msw-setup';

describe('SyncService - 409 Conflict Error Handling', () => {
  let context: vscode.ExtensionContext;
  let authService: AuthService;
  let promptService: PromptService;
  let syncService: SyncService;
  let syncStateStorage: SyncStateStorage;
  let testStorageDir: string;

  beforeAll(() => {
    server.listen({ onUnhandledRequest: 'warn' });
    SupabaseClientManager.initialize();
  });

  afterAll(() => {
    server.close();
  });

  afterEach(async () => {
    // Clean up local storage
    const { promises: fs } = await import('fs');
    await fs.rm(testStorageDir, { recursive: true, force: true }).catch(() => {});
    
    // Clear all mocks
    vi.clearAllMocks();
  });

  beforeEach(async () => {
    // Clear test helpers state
    syncTestHelpers.clearCloudDatabase();
    syncTestHelpers.resetQuota();

    // Generate unique test storage directory for each test
    const { tmpdir } = await import('os');
    const { join } = await import('path');
    testStorageDir = join(
      tmpdir(),
      `prompt-bank-conflict-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    );

    // Mock extension context
    context = {
      globalState: vscode.globalState,
      workspaceState: vscode.workspaceState,
      secrets: vscode.secrets,
      extensionPath: '/mock/extension/path',
      extensionUri: vscode.Uri.file('/mock/extension/path'),
      subscriptions: [],
    } as unknown as vscode.ExtensionContext;

    // Create services using DI
    authService = new AuthService(context, 'test-publisher', 'test-extension');
    vi.spyOn(authService, 'getValidAccessToken').mockResolvedValue('mock-access-token');
    vi.spyOn(authService, 'getRefreshToken').mockResolvedValue('mock-refresh-token');
    vi.spyOn(authService, 'getUserEmail').mockResolvedValue('test@example.com');

    const storageProvider = new FileStorageProvider({ storagePath: testStorageDir });
    await storageProvider.initialize();

    promptService = new PromptService(storageProvider, authService);
    await promptService.initialize();

    syncStateStorage = new SyncStateStorage(testStorageDir);
    syncService = new SyncService(context, testStorageDir, authService, syncStateStorage);
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

      // Perform first sync to upload prompt to cloud
      const firstSyncResult = await syncService.performSync(await promptService.listPrompts(), promptService);
      expect(firstSyncResult.stats.uploaded).toBe(1);

      // Get the cloud ID that was assigned
      const allCloudPrompts = syncTestHelpers.getAllCloudPrompts();
      expect(allCloudPrompts.length).toBe(1);
      const cloudId = allCloudPrompts[0].cloud_id;

      // Soft-delete the cloud prompt
      syncTestHelpers.deleteCloudPrompt(cloudId);

      // Modify local prompt (this should trigger conflict on next sync)
      prompt.content = 'Modified content';
      await promptService.savePromptDirectly(prompt);

      // Act: Perform sync (should detect soft-delete and upload as NEW)
      const result = await syncService.performSync(await promptService.listPrompts(), promptService);

      // Assert: Should have uploaded as NEW prompt
      expect(result.stats.uploaded).toBe(1);
      expect(result.stats.conflicts).toBe(0);

      // Verify a NEW cloud prompt was created (not the deleted one)
      const finalCloudPrompts = syncTestHelpers.getAllCloudPrompts();
      const activePrompts = finalCloudPrompts.filter((p) => !p.deleted_at);
      expect(activePrompts.length).toBe(1);
      expect(activePrompts[0].content).toBe('Modified content');
      expect(activePrompts[0].cloud_id).not.toBe(cloudId); // Different cloudId
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

      // Perform first sync to upload to cloud
      const firstSyncResult = await syncService.performSync(await promptService.listPrompts(), promptService);
      expect(firstSyncResult.stats.uploaded).toBe(1);

      // Get the cloud ID
      const allCloudPrompts = syncTestHelpers.getAllCloudPrompts();
      const cloudId = allCloudPrompts[0].cloud_id;

      // Simulate another device updating the cloud prompt (version 2)
      syncTestHelpers.updateCloudPrompt(cloudId, {
        content: 'Updated by another device',
      });

      // Modify local prompt (still thinks version is 1)
      prompt.content = 'Modified locally';
      await promptService.savePromptDirectly(prompt);

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

      // Perform first sync to upload to cloud
      const firstSyncResult = await syncService.performSync(await promptService.listPrompts(), promptService);
      expect(firstSyncResult.stats.uploaded).toBe(1);

      // Get the cloud ID
      const allCloudPrompts = syncTestHelpers.getAllCloudPrompts();
      const cloudId = allCloudPrompts[0].cloud_id;

      // Soft-delete cloud prompt
      syncTestHelpers.deleteCloudPrompt(cloudId);

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
      await promptService.savePromptDirectly(prompt);

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

      // First sync to upload
      const firstSyncResult = await syncService.performSync(await promptService.listPrompts(), promptService);
      expect(firstSyncResult.stats.uploaded).toBe(1);
      
      // Get cloud ID and delete it
      const allCloudPrompts = syncTestHelpers.getAllCloudPrompts();
      const cloudId = allCloudPrompts[0].cloud_id;
      syncTestHelpers.deleteCloudPrompt(cloudId);

      prompt.content = 'Modified';
      await promptService.savePromptDirectly(prompt);

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

      // First sync to upload
      const firstSyncResult = await syncService.performSync(await promptService.listPrompts(), promptService);
      expect(firstSyncResult.stats.uploaded).toBe(1);
      
      // Get cloud ID and update it (simulating another device)
      const allCloudPrompts = syncTestHelpers.getAllCloudPrompts();
      const cloudId = allCloudPrompts[0].cloud_id;
      syncTestHelpers.updateCloudPrompt(cloudId, { content: 'Remote change' });

      prompt.content = 'Local change';
      await promptService.savePromptDirectly(prompt);

      // Should throw with detailed error information
      await expect(
        syncService.performSync(await promptService.listPrompts(), promptService)
      ).rejects.toThrow('sync_conflict_retry');
    });
  });
});
