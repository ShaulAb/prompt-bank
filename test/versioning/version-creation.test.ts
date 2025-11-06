import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PromptService } from '../../src/services/promptService';
import { FileStorageProvider } from '../../src/storage/fileStorage';
import { AuthService } from '../../src/services/authService';
import { createPrompt } from '../../src/models/prompt';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import type * as vscode from 'vscode';

describe('Version Creation', () => {
  let promptService: PromptService;
  let storageProvider: FileStorageProvider;
  let authService: AuthService;
  let testStorageDir: string;
  let context: vscode.ExtensionContext;

  beforeEach(async () => {
    // Create test storage directory
    testStorageDir = path.join(
      os.tmpdir(),
      `prompt-bank-version-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
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

    // Initialize services
    authService = new AuthService(context, 'test-publisher', 'test-extension');
    storageProvider = new FileStorageProvider({ storagePath: testStorageDir });
    await storageProvider.initialize();

    promptService = new PromptService(storageProvider, authService);
    await promptService.initialize();
  });

  afterEach(async () => {
    await fs.rm(testStorageDir, { recursive: true, force: true }).catch(() => {});
    vi.clearAllMocks();
  });

  it('should create version on edit', async () => {
    // Create initial prompt
    const prompt = createPrompt('Test Prompt', 'Original content', 'General');
    const saved = await promptService.savePromptDirectly(prompt);

    // Edit the prompt (this should trigger version creation)
    saved.content = 'Updated content';
    saved.title = 'Updated Title';
    saved.description = 'Updated description';
    await promptService.editPromptById(saved);

    // Reload to get updated version from storage
    const updated = await storageProvider.load(saved.id);
    if (!updated) {
      throw new Error('Prompt not found after edit');
    }

    // Verify version was created
    expect(updated.versions).toHaveLength(1);
    const version = updated.versions[0];

    expect(version.versionId).toBeDefined();
    expect(version.versionId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i); // UUID v4 format
    expect(version.timestamp).toBeInstanceOf(Date);
    expect(version.deviceId).toBeDefined();
    expect(version.deviceName).toBeDefined();
    expect(version.content).toBe('Original content');
    expect(version.title).toBe('Test Prompt');
    expect(version.category).toBe('General');
  });

  it('should create multiple versions on multiple edits', async () => {
    // Create initial prompt
    const prompt = createPrompt('Test Prompt', 'Version 1 content', 'General');
    let saved = await promptService.savePromptDirectly(prompt);

    // Edit 1
    saved.content = 'Version 2 content';
    await promptService.editPromptById(saved);
    saved = (await storageProvider.load(saved.id))!;
    expect(saved.versions).toHaveLength(1);
    expect(saved.versions[0].content).toBe('Version 1 content');

    // Edit 2
    saved.content = 'Version 3 content';
    await promptService.editPromptById(saved);
    saved = (await storageProvider.load(saved.id))!;
    expect(saved.versions).toHaveLength(2);
    expect(saved.versions[0].content).toBe('Version 1 content');
    expect(saved.versions[1].content).toBe('Version 2 content');

    // Edit 3
    saved.content = 'Version 4 content';
    await promptService.editPromptById(saved);
    saved = (await storageProvider.load(saved.id))!;
    expect(saved.versions).toHaveLength(3);
    expect(saved.versions[0].content).toBe('Version 1 content');
    expect(saved.versions[1].content).toBe('Version 2 content');
    expect(saved.versions[2].content).toBe('Version 3 content');

    // Verify all versions have unique UUIDs
    const versionIds = saved.versions.map((v) => v.versionId);
    const uniqueIds = new Set(versionIds);
    expect(uniqueIds.size).toBe(3);
  });

  it('should not create version when disabled', async () => {
    // Mock configuration with versioning disabled
    const vscode = await import('vscode');
    vi.spyOn(vscode.workspace, 'getConfiguration').mockImplementation((section?: string) => {
      const mockConfig = {
        get: vi.fn((key: string, defaultValue?: any) => {
          if (key === 'enabled') return false; // Disabled
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

    // Create and edit prompt
    const prompt = createPrompt('Test Prompt', 'Original content', 'General');
    const saved = await promptService.savePromptDirectly(prompt);

    saved.content = 'Updated content';
    await promptService.editPromptById(saved);

    const updated = await storageProvider.load(saved.id);
    if (!updated) {
      throw new Error('Prompt not found after edit');
    }

    // Verify no versions were created
    expect(updated.versions).toHaveLength(0);
  });
});
