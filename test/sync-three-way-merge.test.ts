import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import { SyncService } from '../src/services/syncService';
import { AuthService } from '../src/services/authService';
import { SupabaseClientManager } from '../src/services/supabaseClient';
import { PromptService } from '../src/services/promptService';
import { FileStorageProvider } from '../src/storage/fileStorage';
import { createPrompt } from './helpers/prompt-factory';
import { server, syncTestHelpers } from './e2e/helpers/msw-setup';
import { computeContentHash } from '../src/utils/contentHash';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as vscode from 'vscode';

describe('SyncService - Three-Way Merge Algorithm', () => {
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

    // Initialize services (required by SyncService)
    AuthService.initialize(context, 'test-publisher', 'test-extension');
    SupabaseClientManager.initialize();

    // Initialize sync service
    syncService = SyncService.initialize(context, testStorageDir);

    // Mock authentication
    vi.spyOn(AuthService.get(), 'getValidAccessToken').mockResolvedValue('mock-access-token');
    vi.spyOn(AuthService.get(), 'getRefreshToken').mockResolvedValue('mock-refresh-token');
    vi.spyOn(AuthService.get(), 'getUserEmail').mockResolvedValue('test-user@promptbank.test');
  });

  afterEach(async () => {
    // Cleanup
    await fs.rm(testStorageDir, { recursive: true, force: true }).catch(() => {});
    server.resetHandlers();
    vi.clearAllMocks();

    // CRITICAL: Reset singleton instances to ensure test isolation
    // TypeScript doesn't allow accessing private static fields, so we use type assertion
    (SyncService as any).instance = undefined;
    (AuthService as any).instance = undefined;
    (SupabaseClientManager as any).instance = undefined;
  });

  afterAll(() => {
    server.close();
  });

  describe('First Sync Scenarios', () => {
    it('should handle empty local and empty cloud (no changes)', async () => {
      // Act
      const result = await syncService.performSync([], promptService);

      // Assert
      expect(result.stats.uploaded).toBe(0);
      expect(result.stats.downloaded).toBe(0);
      expect(result.stats.conflicts).toBe(0);
      expect(result.stats.deleted).toBe(0);
    });

    it('should upload all local prompts when cloud is empty', async () => {
      // Arrange
      const prompt1 = createPrompt({ title: 'Prompt 1', content: 'Content 1', category: 'Category A' });
      const prompt2 = createPrompt({ title: 'Prompt 2', content: 'Content 2', category: 'Category B' });
      await promptService.savePromptDirectly(prompt1);
      await promptService.savePromptDirectly(prompt2);

      // Act
      const localPrompts = await promptService.listPrompts();
      const result = await syncService.performSync(localPrompts, promptService);

      // Assert
      expect(result.stats.uploaded).toBe(2);
      expect(result.stats.downloaded).toBe(0);
      expect(result.stats.conflicts).toBe(0);

      // Verify cloud state
      const cloudPrompts = syncTestHelpers.getAllCloudPrompts();
      expect(cloudPrompts).toHaveLength(2);
      expect(cloudPrompts[0].title).toBe('Prompt 1');
      expect(cloudPrompts[1].title).toBe('Prompt 2');
    });

    it('should download all cloud prompts when local is empty', async () => {
      // Arrange - Add prompts to cloud with correct content hashes
      const prompt1Data = {
        title: 'Cloud Prompt 1',
        content: 'Cloud Content 1',
        category: 'Cloud Category',
      };
      const prompt1 = syncTestHelpers.addCloudPrompt({
        local_id: 'prompt-1',
        ...prompt1Data,
        description: null,
        prompt_order: null,
        category_order: null,
        content_hash: computeContentHash(prompt1Data as any),
        variables: [],
        metadata: {
          created: new Date().toISOString(),
          modified: new Date().toISOString(),
          usageCount: 0,
        },
        sync_metadata: null,
        deleted_at: null,
      });

      const prompt2Data = {
        title: 'Cloud Prompt 2',
        content: 'Cloud Content 2',
        category: 'Cloud Category',
      };
      const prompt2 = syncTestHelpers.addCloudPrompt({
        local_id: 'prompt-2',
        ...prompt2Data,
        description: null,
        prompt_order: null,
        category_order: null,
        content_hash: computeContentHash(prompt2Data as any),
        variables: [],
        metadata: {
          created: new Date().toISOString(),
          modified: new Date().toISOString(),
          usageCount: 0,
        },
        sync_metadata: null,
        deleted_at: null,
      });

      // Act
      const result = await syncService.performSync([], promptService);

      // Assert
      expect(result.stats.uploaded).toBe(0);
      expect(result.stats.downloaded).toBe(2);
      expect(result.stats.conflicts).toBe(0);

      // Verify local state
      const localPrompts = await promptService.listPrompts();
      expect(localPrompts).toHaveLength(2);
      expect(localPrompts.find((p) => p.title === 'Cloud Prompt 1')).toBeDefined();
      expect(localPrompts.find((p) => p.title === 'Cloud Prompt 2')).toBeDefined();
    });

    it('should not conflict when same prompt with same content exists on both sides', async () => {
      // Arrange - Create local prompt
      const prompt = createPrompt({
        title: 'Same Prompt',
        content: 'Same Content',
        category: 'Category',
      });
      await promptService.savePromptDirectly(prompt);

      // Compute correct hash for same content
      const hash = computeContentHash(prompt);

      // Add same prompt to cloud (simulating previous sync)
      const cloudPrompt = syncTestHelpers.addCloudPrompt({
        local_id: prompt.id,
        title: 'Same Prompt',
        content: 'Same Content',
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

      // Setup sync state to indicate previous sync
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
      });

      // Act
      const localPrompts = await promptService.listPrompts();
      const result = await syncService.performSync(localPrompts, promptService);

      // Assert
      expect(result.stats.uploaded).toBe(0);
      expect(result.stats.downloaded).toBe(0);
      expect(result.stats.conflicts).toBe(0);
    });

    it('should create conflict when same prompt ID has different content on first sync', async () => {
      // Arrange - Create local prompt
      const prompt = createPrompt({
        title: 'Prompt Title',
        content: 'Local Content',
        category: 'Category',
      });
      await promptService.savePromptDirectly(prompt);

      // Add different content to cloud with same title
      const cloudData = {
        title: 'Prompt Title',
        content: 'Different Cloud Content', // Different content
        category: 'Category',
      };
      syncTestHelpers.addCloudPrompt({
        local_id: prompt.id,
        ...cloudData,
        description: null,
        prompt_order: null,
        category_order: null,
        content_hash: computeContentHash(cloudData as any),
        variables: [],
        metadata: {
          created: new Date().toISOString(),
          modified: new Date().toISOString(),
          usageCount: 0,
        },
        sync_metadata: null,
        deleted_at: null,
      });

      // Act
      const localPrompts = await promptService.listPrompts();
      const result = await syncService.performSync(localPrompts, promptService);

      // Assert
      expect(result.stats.conflicts).toBe(1);

      // Verify two copies created with device-specific names
      const finalPrompts = await promptService.listPrompts();
      expect(finalPrompts.length).toBeGreaterThanOrEqual(2);
      expect(finalPrompts.some((p) => p.title.includes('(from'))).toBe(true);
    });
  });

  describe('Subsequent Sync Scenarios', () => {
    it('should upload when local modified and remote unchanged', async () => {
      // Arrange - Setup previous sync state
      const prompt = createPrompt({
        title: 'Original Title',
        content: 'Original Content',
        category: 'Category',
      });
      await promptService.savePromptDirectly(prompt);

      const originalHash = computeContentHash(prompt);

      const cloudPrompt = syncTestHelpers.addCloudPrompt({
        local_id: prompt.id,
        title: 'Original Title',
        content: 'Original Content',
        category: 'Category',
        description: null,
        prompt_order: null,
        category_order: null,
        content_hash: originalHash,
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
      await syncStateStorage.initializeSyncState('test-user@promptbank.test', {
        id: 'device-1',
        name: 'Test Device',
      });
      await syncStateStorage.setPromptSyncInfo(prompt.id, {
        cloudId: cloudPrompt.cloud_id,
        lastSyncedContentHash: originalHash,
        lastSyncedAt: new Date(),
        version: 1,
      });

      // Modify local prompt
      prompt.content = 'Modified Local Content';
      prompt.metadata.modified = new Date();
      await promptService.savePromptDirectly(prompt);

      // Act
      const localPrompts = await promptService.listPrompts();
      const result = await syncService.performSync(localPrompts, promptService);

      // Assert
      expect(result.stats.uploaded).toBe(1);
      expect(result.stats.downloaded).toBe(0);
      expect(result.stats.conflicts).toBe(0);

      // Verify cloud updated
      const updatedCloudPrompt = syncTestHelpers.getCloudPrompt(cloudPrompt.cloud_id);
      expect(updatedCloudPrompt?.content).toBe('Modified Local Content');
    });

    it('should download when remote modified and local unchanged', async () => {
      // Arrange - Setup previous sync state
      const prompt = createPrompt({
        title: 'Original Title',
        content: 'Original Content',
        category: 'Category',
      });
      await promptService.savePromptDirectly(prompt);

      const originalHash = computeContentHash(prompt);

      const cloudPrompt = syncTestHelpers.addCloudPrompt({
        local_id: prompt.id,
        title: 'Original Title',
        content: 'Original Content',
        category: 'Category',
        description: null,
        prompt_order: null,
        category_order: null,
        content_hash: originalHash,
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
      await syncStateStorage.initializeSyncState('test-user@promptbank.test', {
        id: 'device-1',
        name: 'Test Device',
      });
      await syncStateStorage.setPromptSyncInfo(prompt.id, {
        cloudId: cloudPrompt.cloud_id,
        lastSyncedContentHash: originalHash,
        lastSyncedAt: new Date(),
        version: 1,
      });

      // Modify cloud prompt with correct hash
      const modifiedHash = computeContentHash({
        title: 'Original Title',
        content: 'Modified Cloud Content',
        category: 'Category',
      } as any);
      syncTestHelpers.updateCloudPrompt(cloudPrompt.cloud_id, {
        content: 'Modified Cloud Content',
        content_hash: modifiedHash,
      });

      // Act
      const localPrompts = await promptService.listPrompts();
      const result = await syncService.performSync(localPrompts, promptService);

      // Assert
      expect(result.stats.uploaded).toBe(0);
      expect(result.stats.downloaded).toBe(1);
      expect(result.stats.conflicts).toBe(0);

      // Verify local updated
      const finalPrompts = await promptService.listPrompts();
      const updatedLocalPrompt = finalPrompts.find((p) => p.id === prompt.id);
      expect(updatedLocalPrompt?.content).toBe('Modified Cloud Content');
    });

    it('should not sync when neither local nor remote modified', async () => {
      // Arrange - Setup previous sync state
      const prompt = createPrompt({
        title: 'Unchanged Title',
        content: 'Unchanged Content',
        category: 'Category',
      });
      await promptService.savePromptDirectly(prompt);

      const unchangedHash = computeContentHash(prompt);

      const cloudPrompt = syncTestHelpers.addCloudPrompt({
        local_id: prompt.id,
        title: 'Unchanged Title',
        content: 'Unchanged Content',
        category: 'Category',
        description: null,
        prompt_order: null,
        category_order: null,
        content_hash: unchangedHash,
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
      await syncStateStorage.initializeSyncState('test-user@promptbank.test', {
        id: 'device-1',
        name: 'Test Device',
      });
      await syncStateStorage.setPromptSyncInfo(prompt.id, {
        cloudId: cloudPrompt.cloud_id,
        lastSyncedContentHash: unchangedHash,
        lastSyncedAt: new Date(),
        version: 1,
      });

      // Act
      const localPrompts = await promptService.listPrompts();
      const result = await syncService.performSync(localPrompts, promptService);

      // Assert
      expect(result.stats.uploaded).toBe(0);
      expect(result.stats.downloaded).toBe(0);
      expect(result.stats.conflicts).toBe(0);
      expect(result.stats.deleted).toBe(0);
    });

    it('should not conflict when both modified but content hash is identical', async () => {
      // Arrange - Setup previous sync state
      const prompt = createPrompt({
        title: 'Title',
        content: 'Old Content',
        category: 'Category',
      });
      await promptService.savePromptDirectly(prompt);

      const oldHash = computeContentHash(prompt);

      const cloudPrompt = syncTestHelpers.addCloudPrompt({
        local_id: prompt.id,
        title: 'Title',
        content: 'Old Content',
        category: 'Category',
        description: null,
        prompt_order: null,
        category_order: null,
        content_hash: oldHash,
        variables: [],
        metadata: {
          created: prompt.metadata.created.toISOString(),
          modified: new Date(Date.now() - 1000).toISOString(), // Older
          usageCount: 0,
        },
        sync_metadata: null,
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
        lastSyncedContentHash: oldHash,
        lastSyncedAt: new Date(Date.now() - 2000),
        version: 1,
      });

      // Both sides modified to same content
      prompt.content = 'Same Content';
      prompt.metadata.modified = new Date();
      await promptService.savePromptDirectly(prompt);

      const sameHash = computeContentHash(prompt);
      syncTestHelpers.updateCloudPrompt(cloudPrompt.cloud_id, {
        content: 'Same Content',
        content_hash: sameHash,
      });

      // Act
      const localPrompts = await promptService.listPrompts();
      const result = await syncService.performSync(localPrompts, promptService);

      // Assert - Should detect identical content, no conflict
      expect(result.stats.conflicts).toBe(0);
    });

    it('should create conflict when both modified with different content', async () => {
      // Arrange - Setup previous sync state
      const prompt = createPrompt({
        title: 'Title',
        content: 'Original Content',
        category: 'Category',
      });
      await promptService.savePromptDirectly(prompt);

      const originalHash = computeContentHash(prompt);

      const cloudPrompt = syncTestHelpers.addCloudPrompt({
        local_id: prompt.id,
        title: 'Title',
        content: 'Original Content',
        category: 'Category',
        description: null,
        prompt_order: null,
        category_order: null,
        content_hash: originalHash,
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

      // Both sides modified to different content
      prompt.content = 'Local Modified Content';
      prompt.metadata.modified = new Date();
      await promptService.savePromptDirectly(prompt);

      const cloudHash = computeContentHash({
        title: 'Title',
        content: 'Cloud Modified Content',
        category: 'Category',
      } as any);
      syncTestHelpers.updateCloudPrompt(cloudPrompt.cloud_id, {
        content: 'Cloud Modified Content',
        content_hash: cloudHash,
      });

      // Act
      const localPrompts = await promptService.listPrompts();
      const result = await syncService.performSync(localPrompts, promptService);

      // Assert
      expect(result.stats.conflicts).toBe(1);

      // Verify two copies created
      const finalPrompts = await promptService.listPrompts();
      expect(finalPrompts.length).toBeGreaterThanOrEqual(2);
      const localCopy = finalPrompts.find((p) => p.content === 'Local Modified Content');
      const cloudCopy = finalPrompts.find((p) => p.content === 'Cloud Modified Content');
      expect(localCopy).toBeDefined();
      expect(cloudCopy).toBeDefined();
      expect(localCopy?.title).toContain('(from');
      expect(cloudCopy?.title).toContain('(from');
    });
  });

  describe('Deletion Scenarios', () => {
    it('should soft-delete cloud prompt when deleted locally', async () => {
      // Arrange - Setup synced prompt
      const prompt = createPrompt({
        title: 'To Delete',
        content: 'Content',
        category: 'Category',
      });
      await promptService.savePromptDirectly(prompt);

      const hash = computeContentHash(prompt);

      const cloudPrompt = syncTestHelpers.addCloudPrompt({
        local_id: prompt.id,
        title: 'To Delete',
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

      // Setup sync state
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
      });

      // Delete local prompt
      await promptService.deletePromptById(prompt.id);

      // Act
      const localPrompts = await promptService.listPrompts();
      const result = await syncService.performSync(localPrompts, promptService);

      // Assert
      expect(result.stats.deleted).toBe(1);

      // Verify cloud prompt is soft-deleted
      const deletedPrompt = syncTestHelpers.getCloudPrompt(cloudPrompt.cloud_id);
      expect(deletedPrompt?.deleted_at).toBeTruthy();
    });

    it('should keep modified local version when cloud prompt deleted (delete-modify conflict)', async () => {
      // Arrange - Setup synced prompt
      const prompt = createPrompt({
        title: 'Conflicted',
        content: 'Original Content',
        category: 'Category',
      });
      await promptService.savePromptDirectly(prompt);

      const originalHash = computeContentHash(prompt);

      const cloudPrompt = syncTestHelpers.addCloudPrompt({
        local_id: prompt.id,
        title: 'Conflicted',
        content: 'Original Content',
        category: 'Category',
        description: null,
        prompt_order: null,
        category_order: null,
        content_hash: originalHash,
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

      // CRITICAL: Reset singleton to ensure SyncService picks up the manually configured sync state
      (SyncService as unknown as { instance: unknown }).instance = undefined;
      (AuthService as unknown as { instance: unknown }).instance = undefined;
      (SupabaseClientManager as unknown as { instance: unknown }).instance = undefined;

      // Re-initialize services
      AuthService.initialize(context, 'test-publisher', 'test-extension');

      // Mock authentication and refresh token
      vi.spyOn(AuthService.get(), 'getValidAccessToken').mockResolvedValue('mock-access-token');
      vi.spyOn(AuthService.get(), 'getRefreshToken').mockResolvedValue('mock-refresh-token');
      vi.spyOn(AuthService.get(), 'getUserEmail').mockResolvedValue('test@example.com');

      SupabaseClientManager.initialize();
      syncService = SyncService.initialize(context, testStorageDir);

      // Modify local prompt
      prompt.content = 'Modified Locally';
      prompt.metadata.modified = new Date();
      await promptService.savePromptDirectly(prompt);

      // Delete cloud prompt
      syncTestHelpers.deleteCloudPrompt(cloudPrompt.cloud_id);

      // Act
      const localPrompts = await promptService.listPrompts();
      const result = await syncService.performSync(localPrompts, promptService);

      // Assert - Local modified version should be uploaded as new
      expect(result.stats.uploaded).toBe(1);

      // Verify local prompt still exists with modifications
      const finalPrompts = await promptService.listPrompts();
      expect(finalPrompts).toHaveLength(1);
      expect(finalPrompts[0].content).toBe('Modified Locally');
    });
  });

  describe('Content Hash Detection', () => {
    it('should detect conflict when same-second edits have different content', async () => {
      // Arrange - Setup synced prompt
      const now = new Date();
      const prompt = createPrompt({
        title: 'Same Second Edit',
        content: 'Original',
        category: 'Category',
      });
      prompt.metadata.modified = now;
      await promptService.savePromptDirectly(prompt);

      const originalHash = computeContentHash(prompt);

      const cloudPrompt = syncTestHelpers.addCloudPrompt({
        local_id: prompt.id,
        title: 'Same Second Edit',
        content: 'Original',
        category: 'Category',
        description: null,
        prompt_order: null,
        category_order: null,
        content_hash: originalHash,
        variables: [],
        metadata: {
          created: prompt.metadata.created.toISOString(),
          modified: now.toISOString(), // Same second
          usageCount: 0,
        },
        sync_metadata: null,
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
        lastSyncedContentHash: originalHash,
        lastSyncedAt: new Date(now.getTime() - 5000),
        version: 1,
      });

      // Both modified in same second with different content
      prompt.content = 'Local Edit';
      prompt.metadata.modified = now;
      await promptService.savePromptDirectly(prompt);

      const cloudHash = computeContentHash({
        title: 'Same Second Edit',
        content: 'Cloud Edit',
        category: 'Category',
      } as any);
      syncTestHelpers.updateCloudPrompt(cloudPrompt.cloud_id, {
        content: 'Cloud Edit',
        content_hash: cloudHash,
      });

      // Act
      const localPrompts = await promptService.listPrompts();
      const result = await syncService.performSync(localPrompts, promptService);

      // Assert - Content hash should detect the difference despite same timestamp
      expect(result.stats.conflicts).toBeGreaterThanOrEqual(1);
    });

    it('should not conflict when only timestamp changed but content identical', async () => {
      // Arrange - Setup synced prompt
      const prompt = createPrompt({
        title: 'Timestamp Only',
        content: 'Same Content',
        category: 'Category',
      });
      await promptService.savePromptDirectly(prompt);

      const sameHash = computeContentHash(prompt);

      const cloudPrompt = syncTestHelpers.addCloudPrompt({
        local_id: prompt.id,
        title: 'Timestamp Only',
        content: 'Same Content',
        category: 'Category',
        description: null,
        prompt_order: null,
        category_order: null,
        content_hash: sameHash,
        variables: [],
        metadata: {
          created: prompt.metadata.created.toISOString(),
          modified: new Date(Date.now() - 1000).toISOString(), // Different timestamp
          usageCount: 0,
        },
        sync_metadata: null,
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
        lastSyncedContentHash: sameHash,
        lastSyncedAt: new Date(Date.now() - 5000),
        version: 1,
      });

      // Update timestamp on local but keep same content
      prompt.metadata.modified = new Date();
      await promptService.savePromptDirectly(prompt);

      // Act
      const localPrompts = await promptService.listPrompts();
      const result = await syncService.performSync(localPrompts, promptService);

      // Assert - No conflict because content hash is identical
      expect(result.stats.conflicts).toBe(0);
    });
  });
});
