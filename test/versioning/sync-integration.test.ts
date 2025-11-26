import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import { SyncService } from '../../src/services/syncService';
import { AuthService } from '../../src/services/authService';
import { SupabaseClientManager } from '../../src/services/supabaseClient';
import { PromptService } from '../../src/services/promptService';
import { FileStorageProvider } from '../../src/storage/fileStorage';
import { SyncStateStorage } from '../../src/storage/syncStateStorage';
import { WorkspaceMetadataService } from '../../src/services/workspaceMetadataService';
import { createPrompt } from '../../src/models/prompt';
import { generateUUID } from '../../src/models/prompt';
import { server, syncTestHelpers } from '../e2e/helpers/msw-setup';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import type * as vscode from 'vscode';
import type { PromptVersion } from '../../src/models/prompt';

describe('Sync Integration - Versioning', () => {
  let syncService: SyncService;
  let authService: AuthService;
  let promptService: PromptService;
  let syncStateStorage: SyncStateStorage;
  let workspaceMetadataService: WorkspaceMetadataService;
  let storageProvider: FileStorageProvider;
  let testStorageDir: string;
  let context: vscode.ExtensionContext;

  beforeAll(() => {
    server.listen({ onUnhandledRequest: 'warn' });
    // Initialize Supabase client once for all tests
    SupabaseClientManager.initialize();
  });

  beforeEach(async () => {
    // Clear cloud database and reset quota
    syncTestHelpers.clearCloudDatabase();
    syncTestHelpers.resetQuota();

    // Create test storage directory
    testStorageDir = path.join(
      os.tmpdir(),
      `prompt-bank-sync-version-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    );

    // Mock VS Code workspace configuration
    const vscode = await import('vscode');
    vi.spyOn(vscode.workspace, 'getConfiguration').mockImplementation((section?: string) => {
      const mockConfig = {
        get: vi.fn((key: string, defaultValue?: any) => {
          // Default versioning configuration
          if (key === 'enabled') return true;
          if (key === 'strategy') return 'on-save';
          if (key === 'maxVersions') return 10;
          if (key === 'debounceMinutes') return 5;
          return defaultValue;
        }),
        has: vi.fn(() => true),
        inspect: vi.fn(),
        update: vi.fn(),
      };
      return mockConfig as any;
    });

    // Mock ExtensionContext
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

    // Mock authentication methods
    vi.spyOn(authService, 'getValidAccessToken').mockResolvedValue('mock-access-token');
    vi.spyOn(authService, 'getRefreshToken').mockResolvedValue('mock-refresh-token');
    vi.spyOn(authService, 'getUserEmail').mockResolvedValue('test-user@promptbank.test');

    // Initialize storage
    storageProvider = new FileStorageProvider({ storagePath: testStorageDir });
    await storageProvider.initialize();

    promptService = new PromptService(storageProvider, authService);
    await promptService.initialize();

    // Create sync state storage and sync service with DI
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

  it('should upload versions to cloud in metadata', async () => {
    // Create prompt with versions
    const prompt = createPrompt('Test Prompt', 'Version 1', 'General');
    let saved = await promptService.savePromptDirectly(prompt);

    // Create 2 versions by editing
    saved.content = 'Version 2';
    await promptService.editPromptById(saved);
    saved = (await storageProvider.load(saved.id))!;

    saved.content = 'Version 3';
    await promptService.editPromptById(saved);
    saved = (await storageProvider.load(saved.id))!;

    expect(saved.versions).toHaveLength(2);

    // Sync to cloud
    const localPrompts = await promptService.listPrompts({});
    await syncService.performSync(localPrompts, promptService);

    // Fetch from cloud and verify versions are included
    const cloudPrompts = syncTestHelpers.getAllCloudPrompts();
    expect(cloudPrompts.length).toBe(1);

    const cloudPrompt = cloudPrompts[0];
    expect(cloudPrompt.metadata).toBeDefined();

    // Parse metadata and verify versions array exists
    const metadata = cloudPrompt.metadata;
    expect(metadata.versions).toBeDefined();
    expect(metadata.versions).toHaveLength(2);

    // Verify version structure
    expect(metadata.versions[0].versionId).toBeDefined();
    expect(metadata.versions[0].content).toBe('Version 1');
    expect(metadata.versions[1].content).toBe('Version 2');
  });

  it('should download versions from cloud', async () => {
    // Create versions on "another device" (directly in cloud)
    const cloudVersions: PromptVersion[] = [
      {
        versionId: generateUUID(),
        timestamp: new Date('2025-01-01T10:00:00Z'),
        deviceId: 'device-remote',
        deviceName: 'Remote Device',
        content: 'Cloud Version 1',
        title: 'Cloud Prompt',
        category: 'General',
      },
      {
        versionId: generateUUID(),
        timestamp: new Date('2025-01-01T11:00:00Z'),
        deviceId: 'device-remote',
        deviceName: 'Remote Device',
        content: 'Cloud Version 2',
        title: 'Cloud Prompt',
        category: 'General',
      },
    ];

    // Add prompt directly to cloud with versions
    syncTestHelpers.addCloudPrompt({
      local_id: 'remote-prompt-1',
      title: 'Cloud Prompt',
      content: 'Cloud Version 3',
      description: null,
      category: 'General',
      prompt_order: null,
      category_order: null,
      variables: [],
      content_hash: 'mock-hash',
      metadata: {
        created: new Date('2025-01-01T09:00:00Z').toISOString(),
        modified: new Date('2025-01-01T12:00:00Z').toISOString(),
        usageCount: 0,
        versions: cloudVersions.map((v) => ({
          versionId: v.versionId,
          timestamp: v.timestamp.toISOString(),
          deviceId: v.deviceId,
          deviceName: v.deviceName,
          content: v.content,
          title: v.title,
          category: v.category,
        })),
      },
      sync_metadata: {
        lastModifiedDeviceId: 'device-remote',
        lastModifiedDeviceName: 'Remote Device',
      },
    });

    // Download from cloud (pass empty local prompts to trigger download)
    await syncService.performSync([], promptService);

    // Verify versions were downloaded
    const localPrompts = await promptService.listPrompts({ category: 'General' });
    expect(localPrompts).toHaveLength(1);

    const downloaded = localPrompts[0];
    expect(downloaded.versions).toHaveLength(2);
    expect(downloaded.versions[0].content).toBe('Cloud Version 1');
    expect(downloaded.versions[1].content).toBe('Cloud Version 2');
    expect(downloaded.content).toBe('Cloud Version 3');
  });
});
