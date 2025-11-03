import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import { SyncService } from '../src/services/syncService';
import { PromptService } from '../src/services/promptService';
import { FileStorageProvider } from '../src/storage/fileStorage';
import { createPrompt } from '../src/models/prompt';
import { server, syncTestHelpers } from './e2e/helpers/msw-setup';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import type * as vscode from 'vscode';

describe('SyncService - Integration', () => {
  let syncService: SyncService;
  let promptService: PromptService;
  let testStorageDir: string;
  let context: vscode.ExtensionContext;

  beforeAll(() => {
    server.listen({ onUnhandledRequest: 'warn' });
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

    // Initialize storage and services
    const storageProvider = new FileStorageProvider({ storagePath: testStorageDir });
    await storageProvider.initialize();

    promptService = new PromptService(storageProvider);
    await promptService.initialize();

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

    // Initialize sync service
    syncService = SyncService.initialize(context, testStorageDir);

    // Mock authentication
    const AuthService = await import('../src/services/authService');
    vi.spyOn(AuthService.AuthService.get(), 'getValidAccessToken').mockResolvedValue(
      'mock-access-token'
    );
    vi.spyOn(AuthService.AuthService.get(), 'getRefreshToken').mockResolvedValue(
      'mock-refresh-token'
    );
    vi.spyOn(AuthService.AuthService.get(), 'getUserEmail').mockResolvedValue(
      'test-user@promptbank.test'
    );
  });

  afterEach(async () => {
    // Cleanup
    await fs.rm(testStorageDir, { recursive: true, force: true }).catch(() => {});
    server.resetHandlers();
    vi.clearAllMocks();
  });

  afterAll(() => {
    server.close();
  });

  describe('End-to-End Sync Flows', () => {
    it('should complete first sync flow with local prompts', async () => {
      // Arrange - Create local prompts
      const prompts = [];
      for (let i = 1; i <= 3; i++) {
        const prompt = createPrompt({
          title: `Prompt ${i}`,
          content: `Content ${i}`,
          category: i <= 2 ? 'Category A' : 'Category B',
        });
        await promptService.savePromptDirectly(prompt);
        prompts.push(prompt);
      }

      // Act - First sync
      const localPrompts = await promptService.listPrompts();
      const result = await syncService.performSync(localPrompts, promptService);

      // Assert
      expect(result.stats.uploaded).toBe(3);
      expect(result.stats.downloaded).toBe(0);
      expect(result.stats.conflicts).toBe(0);
      expect(result.stats.deleted).toBe(0);
      expect(result.stats.duration).toBeGreaterThan(0);

      // Verify all prompts in cloud
      const cloudPrompts = syncTestHelpers.getAllCloudPrompts();
      expect(cloudPrompts).toHaveLength(3);
      expect(cloudPrompts.map((p) => p.title).sort()).toEqual([
        'Prompt 1',
        'Prompt 2',
        'Prompt 3',
      ]);
    });

    it('should simulate multi-device sync (Device A uploads, Device B downloads)', async () => {
      // DEVICE A - Upload prompts
      const deviceAPrompt1 = createPrompt({
        title: 'Device A Prompt 1',
        content: 'Content from Device A',
        category: 'Work',
      });
      const deviceAPrompt2 = createPrompt({
        title: 'Device A Prompt 2',
        content: 'Another from Device A',
        category: 'Personal',
      });
      await promptService.savePromptDirectly(deviceAPrompt1);
      await promptService.savePromptDirectly(deviceAPrompt2);

      // Device A syncs
      const deviceALocalPrompts = await promptService.listPrompts();
      const deviceAResult = await syncService.performSync(deviceALocalPrompts, promptService);

      expect(deviceAResult.stats.uploaded).toBe(2);
      expect(deviceAResult.stats.downloaded).toBe(0);

      // DEVICE B - Fresh workspace (simulated by clearing local prompts)
      await promptService.deletePromptById(deviceAPrompt1.id);
      await promptService.deletePromptById(deviceAPrompt2.id);

      // Create new sync service for Device B (simulates different device)
      const testStorageDirB = path.join(
        os.tmpdir(),
        `prompt-bank-sync-test-deviceB-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      );
      const storageProviderB = new FileStorageProvider({ storagePath: testStorageDirB });
      await storageProviderB.initialize();

      const promptServiceB = new PromptService(storageProviderB);
      await promptServiceB.initialize();

      const syncServiceB = SyncService.initialize(context, testStorageDirB);

      // Device B syncs (should download from cloud)
      const deviceBLocalPrompts = await promptServiceB.listPrompts();
      const deviceBResult = await syncServiceB.performSync(deviceBLocalPrompts, promptServiceB);

      expect(deviceBResult.stats.uploaded).toBe(0);
      expect(deviceBResult.stats.downloaded).toBe(2);

      // Verify Device B has prompts from Device A
      const deviceBFinalPrompts = await promptServiceB.listPrompts();
      expect(deviceBFinalPrompts).toHaveLength(2);
      expect(deviceBFinalPrompts.map((p) => p.title).sort()).toEqual([
        'Device A Prompt 1',
        'Device A Prompt 2',
      ]);

      // Cleanup Device B
      await fs.rm(testStorageDirB, { recursive: true, force: true }).catch(() => {});
    });

    it('should handle full conflict resolution flow end-to-end', async () => {
      // Setup - Create initial synced prompt
      const prompt = createPrompt({
        title: 'Shared Prompt',
        content: 'Original Content',
        category: 'Category',
      });
      await promptService.savePromptDirectly(prompt);

      // First sync to establish baseline
      await syncService.performSync([prompt], promptService);

      // Simulate Device A modifying locally
      prompt.content = 'Device A Modified';
      prompt.metadata.modified = new Date();
      await promptService.savePromptDirectly(prompt);

      // Simulate Device B modifying in cloud
      const cloudPrompts = syncTestHelpers.getAllCloudPrompts();
      expect(cloudPrompts).toHaveLength(1);
      syncTestHelpers.updateCloudPrompt(cloudPrompts[0].cloud_id, {
        content: 'Device B Modified',
        content_hash: 'device-b-hash',
      });

      // Device A syncs (detects conflict)
      const localPrompts = await promptService.listPrompts();
      const result = await syncService.performSync(localPrompts, promptService);

      // Assert conflict resolved
      expect(result.stats.conflicts).toBe(1);

      // Verify two copies exist locally
      const finalPrompts = await promptService.listPrompts();
      expect(finalPrompts.length).toBeGreaterThanOrEqual(2);

      const deviceACopy = finalPrompts.find((p) => p.content === 'Device A Modified');
      const deviceBCopy = finalPrompts.find((p) => p.content === 'Device B Modified');

      expect(deviceACopy).toBeDefined();
      expect(deviceBCopy).toBeDefined();
      expect(deviceACopy?.title).toContain('(from');
      expect(deviceBCopy?.title).toContain('(from');
    });

    it('should sync deletions across devices', async () => {
      // Setup - Create and sync prompt
      const prompt = createPrompt({
        title: 'To Be Deleted',
        content: 'Content',
        category: 'Category',
      });
      await promptService.savePromptDirectly(prompt);

      // First sync
      await syncService.performSync([prompt], promptService);

      // Verify cloud has prompt
      let cloudPrompts = syncTestHelpers.getAllCloudPrompts();
      expect(cloudPrompts).toHaveLength(1);

      // Delete locally
      await promptService.deletePromptById(prompt.id);

      // Sync deletion
      const localPrompts = await promptService.listPrompts();
      const result = await syncService.performSync(localPrompts, promptService);

      expect(result.stats.deleted).toBe(1);

      // Verify cloud prompt is soft-deleted
      cloudPrompts = syncTestHelpers.getAllCloudPrompts();
      expect(cloudPrompts).toHaveLength(0); // Filtered out (soft-deleted)

      const allCloudPrompts = syncTestHelpers.getAllCloudPrompts(true); // Include deleted
      expect(allCloudPrompts).toHaveLength(1);
      expect(allCloudPrompts[0].deleted_at).toBeTruthy();
    });
  });

  describe('Sync State Persistence', () => {
    it('should persist sync state across SyncService instances', async () => {
      // Create and sync a prompt
      const prompt = createPrompt({
        title: 'Persistent',
        content: 'Content',
        category: 'Category',
      });
      await promptService.savePromptDirectly(prompt);

      await syncService.performSync([prompt], promptService);

      // Create new SyncService instance (simulates app restart)
      const syncService2 = SyncService.initialize(context, testStorageDir);

      // Get sync state info
      const syncInfo = await syncService2.getSyncStateInfo();

      // Assert sync state persisted
      expect(syncInfo.userId).toBe('test-user@promptbank.test');
      expect(syncInfo.deviceName).toBeTruthy();
      expect(syncInfo.lastSyncedAt).toBeInstanceOf(Date);
      expect(syncInfo.syncedPromptCount).toBe(1);
    });

    it('should clear all sync state when requested', async () => {
      // Create and sync prompts
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
      await promptService.savePromptDirectly(prompt1);
      await promptService.savePromptDirectly(prompt2);

      await syncService.performSync([prompt1, prompt2], promptService);

      // Verify sync state exists
      let syncInfo = await syncService.getSyncStateInfo();
      expect(syncInfo.syncedPromptCount).toBe(2);

      // Clear all sync state
      await syncService.clearAllSyncState();

      // Verify sync state cleared
      await expect(syncService.getSyncStateInfo()).rejects.toThrow(/Not configured/);

      // Next sync should be treated as first sync
      const localPrompts = await promptService.listPrompts();
      const result = await syncService.performSync(localPrompts, promptService);

      // Should re-upload everything as if first sync
      expect(result.stats.uploaded).toBe(2);
    });
  });

  describe('Sync Statistics and Reporting', () => {
    it('should return correct statistics for complex sync', async () => {
      // Setup complex scenario
      // 1. Upload 2 prompts
      const prompt1 = createPrompt({
        title: 'Upload 1',
        content: 'Content 1',
        category: 'Category',
      });
      const prompt2 = createPrompt({
        title: 'Upload 2',
        content: 'Content 2',
        category: 'Category',
      });
      await promptService.savePromptDirectly(prompt1);
      await promptService.savePromptDirectly(prompt2);

      // 2. Add cloud prompt to download
      syncTestHelpers.addCloudPrompt({
        local_id: 'cloud-prompt-1',
        title: 'Download 1',
        content: 'Cloud Content',
        category: 'Category',
        description: null,
        prompt_order: null,
        category_order: null,
        content_hash: 'cloud-hash',
        variables: [],
        metadata: {
          created: new Date().toISOString(),
          modified: new Date().toISOString(),
          usageCount: 0,
        },
        sync_metadata: null,
        deleted_at: null,
      });

      // Perform sync
      const localPrompts = await promptService.listPrompts();
      const result = await syncService.performSync(localPrompts, promptService);

      // Assert comprehensive stats
      expect(result.stats).toMatchObject({
        uploaded: 2,
        downloaded: 1,
        deleted: 0,
        conflicts: 0,
      });
      expect(result.stats.duration).toBeGreaterThan(0);
      expect(typeof result.stats.duration).toBe('number');
    });

    it('should measure sync duration', async () => {
      // Create prompts
      for (let i = 1; i <= 5; i++) {
        const prompt = createPrompt({
          title: `Prompt ${i}`,
          content: `Content ${i}`,
          category: 'Category',
        });
        await promptService.savePromptDirectly(prompt);
      }

      // Measure sync
      const startTime = Date.now();
      const localPrompts = await promptService.listPrompts();
      const result = await syncService.performSync(localPrompts, promptService);
      const elapsed = Date.now() - startTime;

      // Assert duration measured
      expect(result.stats.duration).toBeGreaterThan(0);
      expect(result.stats.duration).toBeLessThanOrEqual(elapsed);
    });
  });
});
