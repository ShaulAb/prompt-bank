import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PromptService } from '../../src/services/promptService';
import { FileStorageProvider } from '../../src/storage/fileStorage';
import { AuthService } from '../../src/services/authService';
import { createPrompt } from '../../src/models/prompt';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import type * as vscode from 'vscode';

describe('Version Pruning', () => {
  let promptService: PromptService;
  let storageProvider: FileStorageProvider;
  let authService: AuthService;
  let testStorageDir: string;
  let context: vscode.ExtensionContext;

  beforeEach(async () => {
    // Create test storage directory
    testStorageDir = path.join(
      os.tmpdir(),
      `prompt-bank-pruning-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    );

    // Mock VS Code workspace configuration
    const vscode = await import('vscode');
    vi.spyOn(vscode.workspace, 'getConfiguration').mockImplementation((section?: string) => {
      const mockConfig = {
        get: vi.fn((key: string, defaultValue?: any) => {
          // Default versioning configuration
          if (key === 'enabled') return true;
          if (key === 'strategy') return 'on-save';
          if (key === 'maxVersions') return 5; // Small limit for testing
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

  it('should prune old versions when exceeding maxVersions', async () => {
    // Create initial prompt
    const prompt = createPrompt('Test Prompt', 'Version 1', 'General');
    let saved = await promptService.savePromptDirectly(prompt);

    // Create 6 versions (maxVersions = 5, so oldest should be pruned)
    for (let i = 2; i <= 7; i++) {
      saved.content = `Version ${i}`;
      await promptService.editPromptById(saved);
      saved = (await storageProvider.load(saved.id))!;
      // Small delay to ensure timestamp ordering
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    // Verify only 5 versions remain (oldest pruned)
    expect(saved.versions).toHaveLength(5);

    // Verify the correct versions remain (should be v2-v6, v1 pruned)
    expect(saved.versions[0].content).toBe('Version 2');
    expect(saved.versions[1].content).toBe('Version 3');
    expect(saved.versions[2].content).toBe('Version 4');
    expect(saved.versions[3].content).toBe('Version 5');
    expect(saved.versions[4].content).toBe('Version 6');

    // Verify current content is v7
    expect(saved.content).toBe('Version 7');
  });

  it('should keep all versions under limit', async () => {
    // Mock configuration with higher limit
    const vscode = await import('vscode');
    vi.spyOn(vscode.workspace, 'getConfiguration').mockImplementation((section?: string) => {
      const mockConfig = {
        get: vi.fn((key: string, defaultValue?: any) => {
          if (key === 'enabled') return true;
          if (key === 'strategy') return 'on-save';
          if (key === 'maxVersions') return 10; // Higher limit
          if (key === 'debounceMinutes') return 5;
          return defaultValue;
        }),
        has: vi.fn(() => true),
        inspect: vi.fn(),
        update: vi.fn(),
      };
      return mockConfig as any;
    });

    // Create initial prompt
    const prompt = createPrompt('Test Prompt', 'Version 1', 'General');
    let saved = await promptService.savePromptDirectly(prompt);

    // Create only 3 versions (well under maxVersions = 10)
    for (let i = 2; i <= 4; i++) {
      saved.content = `Version ${i}`;
      await promptService.editPromptById(saved);
      saved = (await storageProvider.load(saved.id))!;
    }

    // Verify all 3 versions are kept
    expect(saved.versions).toHaveLength(3);
    expect(saved.versions[0].content).toBe('Version 1');
    expect(saved.versions[1].content).toBe('Version 2');
    expect(saved.versions[2].content).toBe('Version 3');

    // Verify current content is v4
    expect(saved.content).toBe('Version 4');
  });
});
