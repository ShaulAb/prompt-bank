import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PromptService } from '../../src/services/promptService';
import { FileStorageProvider } from '../../src/storage/fileStorage';
import { AuthService } from '../../src/services/authService';
import { createPrompt } from '../../src/models/prompt';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import type * as vscode from 'vscode';

describe('Version Restoration', () => {
  let promptService: PromptService;
  let storageProvider: FileStorageProvider;
  let authService: AuthService;
  let testStorageDir: string;
  let context: vscode.ExtensionContext;

  beforeEach(async () => {
    // Create test storage directory
    testStorageDir = path.join(
      os.tmpdir(),
      `prompt-bank-restore-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
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

  it('should restore old version and create new version', async () => {
    // Create initial prompt with "Hello" content
    const prompt = createPrompt('Test Prompt', 'Hello', 'General');
    let saved = await promptService.savePromptDirectly(prompt);

    // Edit to "World" (creates v1 with "Hello")
    saved.content = 'World';
    await promptService.editPromptById(saved);
    saved = (await storageProvider.load(saved.id))!;

    expect(saved.versions).toHaveLength(1);
    expect(saved.versions[0].content).toBe('Hello');
    expect(saved.content).toBe('World');

    // Get the version ID for v1
    const v1VersionId = saved.versions[0].versionId;

    // Mock user confirmation to allow restoration
    const vscode = await import('vscode');
    vi.spyOn(vscode.window, 'showWarningMessage').mockResolvedValue('Restore' as any);

    // Restore v1 (should restore "Hello" and create new version with "World")
    const restored = await promptService.restoreVersion(saved.id, v1VersionId);

    // Verify content is restored to "Hello"
    expect(restored.content).toBe('Hello');

    // Verify new version was created
    expect(restored.versions).toHaveLength(2);
    expect(restored.versions[0].content).toBe('Hello'); // Original v1
    expect(restored.versions[1].content).toBe('World'); // Snapshot before restoration

    // Verify new version has restoration message
    expect(restored.versions[1].changeReason).toContain('Before restoring v1');
  });

  it('should restore all fields (title, description, category)', async () => {
    // Create initial prompt with all fields
    const prompt = createPrompt(
      'Original Title',
      'Original Content',
      'Original Category',
      'Original Description'
    );
    let saved = await promptService.savePromptDirectly(prompt);

    // Edit all fields (creates v1 with original values)
    saved.content = 'Updated Content';
    saved.title = 'Updated Title';
    saved.description = 'Updated Description';
    saved.category = 'Updated Category';
    await promptService.editPromptById(saved);
    saved = (await storageProvider.load(saved.id))!;

    expect(saved.versions).toHaveLength(1);
    const v1 = saved.versions[0];
    expect(v1.content).toBe('Original Content');
    expect(v1.title).toBe('Original Title');
    expect(v1.description).toBe('Original Description');
    expect(v1.category).toBe('Original Category');

    // Verify current state has updated values
    expect(saved.content).toBe('Updated Content');
    expect(saved.title).toBe('Updated Title');
    expect(saved.description).toBe('Updated Description');
    expect(saved.category).toBe('Updated Category');

    // Mock user confirmation to allow restoration
    const vscode = await import('vscode');
    vi.spyOn(vscode.window, 'showWarningMessage').mockResolvedValue('Restore' as any);

    // Restore v1
    const restored = await promptService.restoreVersion(saved.id, v1.versionId);

    // Verify ALL fields are restored
    expect(restored.content).toBe('Original Content');
    expect(restored.title).toBe('Original Title');
    expect(restored.description).toBe('Original Description');
    expect(restored.category).toBe('Original Category');

    // Verify new version was created with updated values
    expect(restored.versions).toHaveLength(2);
    const v2 = restored.versions[1];
    expect(v2.content).toBe('Updated Content');
    expect(v2.title).toBe('Updated Title');
    expect(v2.description).toBe('Updated Description');
    expect(v2.category).toBe('Updated Category');
  });
});
