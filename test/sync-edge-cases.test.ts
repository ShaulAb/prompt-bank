import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import { SyncService } from '../src/services/syncService';
import { AuthService } from '../src/services/authService';
import { SupabaseClientManager } from '../src/services/supabaseClient';
import { PromptService } from '../src/services/promptService';
import { FileStorageProvider } from '../src/storage/fileStorage';
import { SyncStateStorage } from '../src/storage/syncStateStorage';
import { WorkspaceMetadataService } from '../src/services/workspaceMetadataService';
import { createPrompt } from './helpers/prompt-factory';
import { server, syncTestHelpers } from './e2e/helpers/msw-setup';
import { computeContentHash } from '../src/utils/contentHash';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import type * as vscode from 'vscode';

describe('SyncService - Edge Cases', () => {
  let syncService: SyncService;
  let authService: AuthService;
  let promptService: PromptService;
  let syncStateStorage: SyncStateStorage;
  let workspaceMetadataService: WorkspaceMetadataService;
  let testStorageDir: string;
  let context: vscode.ExtensionContext;

  beforeAll(() => {
    server.listen({ onUnhandledRequest: 'warn' });
    SupabaseClientManager.initialize();
  });

  beforeEach(async () => {
    // Clear cloud database and reset quota
    syncTestHelpers.clearCloudDatabase();
    syncTestHelpers.resetQuota();

    // Create test storage directory
    testStorageDir = path.join(
      os.tmpdir(),
      `prompt-bank-sync-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    );

    // Mock ExtensionContext
    const vscode = await import('vscode');
    context = {
      globalState: vscode.globalState,
      workspaceState: vscode.workspaceState,
      secrets: vscode.secrets,
      subscriptions: [],
      extensionUri: vscode.Uri.file(testStorageDir),
      extensionPath: testStorageDir,
      extension: {} as any,
      storageUri: vscode.Uri.file(testStorageDir),
      globalStorageUri: vscode.Uri.file(path.join(testStorageDir, 'global')),
      logUri: vscode.Uri.file(path.join(testStorageDir, 'logs')),
      extensionMode: 3, // ExtensionMode.Test
      environmentVariableCollection: {} as any,
      storagePath: testStorageDir,
      globalStoragePath: path.join(testStorageDir, 'global'),
      logPath: path.join(testStorageDir, 'logs'),
      asAbsolutePath: (relativePath: string) => path.join(testStorageDir, relativePath),
    } as unknown as vscode.ExtensionContext;

    // Create services using DI
    authService = new AuthService(context, 'test-publisher', 'test-extension');
    vi.spyOn(authService, 'getValidAccessToken').mockResolvedValue('mock-access-token');
    vi.spyOn(authService, 'getRefreshToken').mockResolvedValue('mock-refresh-token');
    vi.spyOn(authService, 'getUserEmail').mockResolvedValue('test-user@promptbank.test');

    const storageProvider = new FileStorageProvider({ storagePath: testStorageDir });
    await storageProvider.initialize();

    promptService = new PromptService(storageProvider, authService);
    await promptService.initialize();

    syncStateStorage = new SyncStateStorage(testStorageDir);
    workspaceMetadataService = new WorkspaceMetadataService(testStorageDir, context);
    syncService = new SyncService(context, testStorageDir, authService, syncStateStorage, workspaceMetadataService);
  });

  afterEach(async () => {
    await fs.rm(testStorageDir, { recursive: true, force: true }).catch(() => {});
    server.resetHandlers();
    vi.clearAllMocks();
  });

  afterAll(() => {
    server.close();
  });

  describe('Corrupted Sync State Handling', () => {
    it('should auto-clear sync state when pointing to deleted cloud prompt', async () => {
      // Arrange - Create local prompt
      const prompt = createPrompt({
        title: 'Corrupted State',
        content: 'Content',
        category: 'Category',
      });
      await promptService.savePromptDirectly(prompt);

      const hash = computeContentHash(prompt);

      // Create a soft-deleted cloud prompt
      const cloudPrompt = syncTestHelpers.addCloudPrompt({
        local_id: prompt.id,
        title: 'Corrupted State',
        content: 'Content',
        category: 'Category',
        description: null,
        prompt_order: null,
        category_order: null,
        content_hash: hash,
        variables: [],
        metadata: {
          created: prompt.metadata.created.toISOString(),
          modified: prompt.metadata.modified.toISOString(),
          usageCount: 0,
        },
        sync_metadata: null,
        deleted_at: null,
      });

      // Soft-delete the cloud prompt
      syncTestHelpers.deleteCloudPrompt(cloudPrompt.cloud_id);

      // Setup corrupted sync state (points to deleted cloud prompt)
      const SyncStateStorage = await import('../src/storage/syncStateStorage');
      const syncStateStorage = new SyncStateStorage.SyncStateStorage(testStorageDir);
      await syncStateStorage.initializeSyncState('test-user@promptbank.test', {
        id: 'device-1',
        name: 'Test Device',
      });
      await syncStateStorage.setPromptSyncInfo(prompt.id, {
        cloudId: cloudPrompt.cloud_id,
        lastSyncedContentHash: hash,
        lastSyncedAt: new Date(),
        version: 1,
        isDeleted: true, // Corrupted state: points to deleted prompt
      });

      // Act
      const localPrompts = await promptService.listPrompts();
      const result = await syncService.performSync(localPrompts, promptService);

      // Assert - Should detect corruption and re-upload as new
      expect(result.stats.uploaded).toBe(1);

      // Verify new cloud prompt created (not the corrupted one)
      const cloudPrompts = syncTestHelpers.getAllCloudPrompts();
      expect(cloudPrompts).toHaveLength(1);
      expect(cloudPrompts[0].cloud_id).not.toBe(cloudPrompt.cloud_id);
    });

    it('should handle missing cloudId in sync state', async () => {
      // Arrange - Create local prompt
      const prompt = createPrompt({
        title: 'Missing CloudId',
        content: 'Content',
        category: 'Category',
      });
      await promptService.savePromptDirectly(prompt);

      // Setup sync state with missing cloudId
      const SyncStateStorage = await import('../src/storage/syncStateStorage');
      const syncStateStorage = new SyncStateStorage.SyncStateStorage(testStorageDir);
      await syncStateStorage.initializeSyncState('test-user@promptbank.test', {
        id: 'device-1',
        name: 'Test Device',
      });
      await syncStateStorage.setPromptSyncInfo(prompt.id, {
        cloudId: '', // Missing/empty cloudId
        lastSyncedContentHash: '',
        lastSyncedAt: new Date(),
        version: 0,
      });

      // Act
      const localPrompts = await promptService.listPrompts();
      const result = await syncService.performSync(localPrompts, promptService);

      // Assert - Should treat as new prompt and upload
      expect(result.stats.uploaded).toBe(1);

      // Verify cloud prompt created
      const cloudPrompts = syncTestHelpers.getAllCloudPrompts();
      expect(cloudPrompts).toHaveLength(1);
      expect(cloudPrompts[0].title).toBe('Missing CloudId');
    });
  });

  describe('Quota Enforcement', () => {
    it('should fail pre-flight check when would exceed prompt limit', async () => {
      // Arrange - Set low quota limit
      syncTestHelpers.setQuota({
        promptLimit: 2,
        promptCount: 1, // Already have 1
      });

      // Create 3 local prompts (exceeds limit of 2)
      const prompt1 = createPrompt({
        title: 'Prompt 1',
        content: 'Content 1',
        category: 'Category',
      });
      const prompt2 = createPrompt({
        title: 'Prompt 2',
        content: 'Content 2',
        category: 'Category',
      });
      const prompt3 = createPrompt({
        title: 'Prompt 3',
        content: 'Content 3',
        category: 'Category',
      });
      await promptService.savePromptDirectly(prompt1);
      await promptService.savePromptDirectly(prompt2);
      await promptService.savePromptDirectly(prompt3);

      // Act & Assert - Should throw before uploading anything
      const localPrompts = await promptService.listPrompts();
      await expect(syncService.performSync(localPrompts, promptService)).rejects.toThrow(/exceed limit/);

      // Verify nothing was uploaded (atomic failure)
      const cloudPrompts = syncTestHelpers.getAllCloudPrompts();
      expect(cloudPrompts).toHaveLength(0);
    });

    it('should fail pre-flight check when would exceed storage limit', async () => {
      // Arrange - Set low storage limit (100 bytes)
      syncTestHelpers.setQuota({
        storageLimit: 100,
        storageBytes: 0,
      });

      // Create large prompt that exceeds limit
      const largePrompt = createPrompt({
        title: 'Large Prompt',
        content: 'x'.repeat(200), // 200 bytes content
        category: 'Category',
      });
      await promptService.savePromptDirectly(largePrompt);

      // Act & Assert - Should throw before uploading
      const localPrompts = await promptService.listPrompts();
      await expect(syncService.performSync(localPrompts, promptService)).rejects.toThrow(/exceed.*MB/);

      // Verify nothing was uploaded
      const cloudPrompts = syncTestHelpers.getAllCloudPrompts();
      expect(cloudPrompts).toHaveLength(0);
    });

    it('should show warning when approaching quota (90%+) but continue sync', async () => {
      // Arrange - Set quota at 91% usage
      syncTestHelpers.setQuota({
        promptLimit: 100,
        promptCount: 91,
        percentageUsed: 91,
      });

      // Create one more prompt
      const prompt = createPrompt({
        title: 'Near Limit',
        content: 'Content',
        category: 'Category',
      });
      await promptService.savePromptDirectly(prompt);

      // Mock window.showWarningMessage to capture warning
      const vscode = await import('vscode');
      const showWarningMock = vi.spyOn(vscode.window, 'showWarningMessage').mockResolvedValue(undefined);

      // Act
      const localPrompts = await promptService.listPrompts();
      const result = await syncService.performSync(localPrompts, promptService);

      // Assert - Should warn but succeed
      expect(result.stats.uploaded).toBe(1);
      expect(showWarningMock).toHaveBeenCalledWith(expect.stringContaining('91%'));

      // Verify prompt was uploaded
      const cloudPrompts = syncTestHelpers.getAllCloudPrompts();
      expect(cloudPrompts).toHaveLength(1);
    });

    it('should guarantee all-or-nothing sync (no partial uploads)', async () => {
      // Arrange - Set quota that allows 2 prompts
      syncTestHelpers.setQuota({
        promptLimit: 2,
        promptCount: 0,
      });

      // Create 3 prompts (exceeds limit)
      for (let i = 1; i <= 3; i++) {
        const prompt = createPrompt({
          title: `Prompt ${i}`,
          content: `Content ${i}`,
          category: 'Category',
        });
        await promptService.savePromptDirectly(prompt);
      }

      // Act
      const localPrompts = await promptService.listPrompts();
      try {
        await syncService.performSync(localPrompts, promptService);
        // Should not reach here
        expect(true).toBe(false);
      } catch (error) {
        // Expected to fail
      }

      // Assert - No prompts should be uploaded (atomic failure)
      const cloudPrompts = syncTestHelpers.getAllCloudPrompts();
      expect(cloudPrompts).toHaveLength(0); // All-or-nothing guarantee
    });
  });

  describe('Conflict Resolution Details', () => {
    it('should strip existing conflict suffix to prevent nesting', async () => {
      // Arrange - Create prompt with existing conflict suffix
      const prompt = createPrompt({
        title: 'Debug React (from MacBook - Jan 1)', // Already has suffix
        content: 'Local Content',
        category: 'Category',
      });
      await promptService.savePromptDirectly(prompt);

      // Compute hashes for different content
      const cloudHash = computeContentHash({
        title: 'Debug React',
        content: 'Cloud Content',
        category: 'Category',
      } as any);

      const originalHash = computeContentHash({
        title: 'Debug React',
        content: 'Original Content',
        category: 'Category',
      } as any);

      // Add conflicting cloud prompt
      const cloudPrompt = syncTestHelpers.addCloudPrompt({
        local_id: prompt.id,
        title: 'Debug React',
        content: 'Cloud Content',
        category: 'Category',
        description: null,
        prompt_order: null,
        category_order: null,
        content_hash: cloudHash,
        variables: [],
        metadata: {
          created: prompt.metadata.created.toISOString(),
          modified: prompt.metadata.modified.toISOString(),
          usageCount: 0,
        },
        sync_metadata: {
          lastModifiedDeviceName: 'Desktop',
        },
        deleted_at: null,
      });

      // Setup sync state for conflict scenario
      const SyncStateStorage = await import('../src/storage/syncStateStorage');
      const syncStateStorage = new SyncStateStorage.SyncStateStorage(testStorageDir);
      await syncStateStorage.initializeSyncState('test-user@promptbank.test', {
        id: 'device-1',
        name: 'Test Device',
      });
      await syncStateStorage.setPromptSyncInfo(prompt.id, {
        cloudId: cloudPrompt.cloud_id,
        lastSyncedContentHash: originalHash,
        lastSyncedAt: new Date(Date.now() - 5000),
        version: 1,
      });

      // Act
      const localPrompts = await promptService.listPrompts();
      const result = await syncService.performSync(localPrompts, promptService);

      // Assert
      expect(result.stats.conflicts).toBe(1);

      // Verify suffix not nested
      const finalPrompts = await promptService.listPrompts();
      const conflictPrompts = finalPrompts.filter((p) => p.title.includes('(from'));
      expect(conflictPrompts.length).toBe(2);

      // Should have base title + single suffix, not nested
      for (const p of conflictPrompts) {
        const suffixCount = (p.title.match(/\(from/g) || []).length;
        expect(suffixCount).toBe(1); // Only one suffix
      }
    });

    it('should assign NEW IDs to both conflict copies', async () => {
      // Arrange - Setup conflict scenario
      const originalId = 'original-prompt-id';
      const prompt = createPrompt({
        id: originalId,
        title: 'Conflicted',
        content: 'Local Content',
        category: 'Category',
      });
      await promptService.savePromptDirectly(prompt);

      const cloudHash = computeContentHash({
        title: 'Conflicted',
        content: 'Cloud Content',
        category: 'Category',
      } as any);

      const originalHash = computeContentHash({
        title: 'Conflicted',
        content: 'Original Content',
        category: 'Category',
      } as any);

      const cloudPrompt = syncTestHelpers.addCloudPrompt({
        local_id: originalId,
        title: 'Conflicted',
        content: 'Cloud Content',
        category: 'Category',
        description: null,
        prompt_order: null,
        category_order: null,
        content_hash: cloudHash,
        variables: [],
        metadata: {
          created: prompt.metadata.created.toISOString(),
          modified: prompt.metadata.modified.toISOString(),
          usageCount: 0,
        },
        sync_metadata: null,
        deleted_at: null,
      });

      // Setup sync state
      const SyncStateStorage = await import('../src/storage/syncStateStorage');
      const syncStateStorage = new SyncStateStorage.SyncStateStorage(testStorageDir);
      const testWorkspaceId = await workspaceMetadataService.getOrCreateWorkspaceId();
      await syncStateStorage.initializeSyncState('test-user@promptbank.test', {
        id: 'device-1',
        name: 'Test Device',
      }, testWorkspaceId);
      await syncStateStorage.setPromptSyncInfo(originalId, {
        cloudId: cloudPrompt.cloud_id,
        lastSyncedContentHash: originalHash,
        lastSyncedAt: new Date(Date.now() - 5000),
        version: 1,
      });

      // Create fresh services with DI (they'll pick up the pre-configured sync state)
      const authServiceFresh = new AuthService(context, 'test-publisher', 'test-extension');
      vi.spyOn(authServiceFresh, 'getValidAccessToken').mockResolvedValue('mock-access-token');
      vi.spyOn(authServiceFresh, 'getRefreshToken').mockResolvedValue('mock-refresh-token');
      vi.spyOn(authServiceFresh, 'getUserEmail').mockResolvedValue('test-user@promptbank.test');

      const syncServiceFresh = new SyncService(context, testStorageDir, authServiceFresh, syncStateStorage, workspaceMetadataService);

      // Act
      const localPrompts = await promptService.listPrompts();
      const result = await syncServiceFresh.performSync(localPrompts, promptService);

      // Assert
      expect(result.stats.conflicts).toBe(1);

      // Verify both copies have NEW IDs (not reusing original)
      const finalPrompts = await promptService.listPrompts();
      const conflictPrompts = finalPrompts.filter((p) => p.title.includes('(from'));
      expect(conflictPrompts.length).toBe(2);

      for (const p of conflictPrompts) {
        expect(p.id).not.toBe(originalId); // NEW ID, not original
        expect(p.id).toMatch(/^prompt_\d+_/); // Generated ID format
      }
    });

    it('should include device name and timestamp in conflict titles', async () => {
      // Arrange - Setup conflict
      const prompt = createPrompt({
        title: 'Title',
        content: 'Local Content',
        category: 'Category',
      });
      await promptService.savePromptDirectly(prompt);

      const cloudHash = computeContentHash({
        title: 'Title',
        content: 'Cloud Content',
        category: 'Category',
      } as any);

      const cloudPrompt = syncTestHelpers.addCloudPrompt({
        local_id: prompt.id,
        title: 'Title',
        content: 'Cloud Content',
        category: 'Category',
        description: null,
        prompt_order: null,
        category_order: null,
        content_hash: cloudHash,
        variables: [],
        metadata: {
          created: prompt.metadata.created.toISOString(),
          modified: prompt.metadata.modified.toISOString(),
          usageCount: 0,
        },
        sync_metadata: {
          lastModifiedDeviceName: 'Remote Device',
        },
        deleted_at: null,
      });

      // Setup sync state
      const SyncStateStorage = await import('../src/storage/syncStateStorage');
      const syncStateStorage = new SyncStateStorage.SyncStateStorage(testStorageDir);
      await syncStateStorage.initializeSyncState('test-user@promptbank.test', {
        id: 'device-1',
        name: 'Test Device',
      });
      await syncStateStorage.setPromptSyncInfo(prompt.id, {
        cloudId: cloudPrompt.cloud_id,
        lastSyncedContentHash: 'original-hash',
        lastSyncedAt: new Date(Date.now() - 5000),
        version: 1,
      });

      // Act
      const localPrompts = await promptService.listPrompts();
      const result = await syncService.performSync(localPrompts, promptService);

      // Assert
      expect(result.stats.conflicts).toBe(1);

      // Verify titles include device name and date
      const finalPrompts = await promptService.listPrompts();
      const conflictPrompts = finalPrompts.filter((p) => p.title.includes('(from'));
      expect(conflictPrompts.length).toBe(2);

      // Check format: "Title (from DeviceName - Mon DD HH:MM)"
      const titleRegex = /Title \(from .+ - \w{3} \d{1,2} \d{2}:\d{2}\)/;
      for (const p of conflictPrompts) {
        expect(p.title).toMatch(titleRegex);
      }
    });
  });
});
