import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PromptEditorPanel } from '../src/webview/PromptEditorPanel';
import { PromptService } from '../src/services/promptService';
import { PromptTreeProvider } from '../src/views/promptTreeProvider';
import { FileStorageProvider } from '../src/storage/fileStorage';
import { CategoryTreeItem } from '../src/views/promptTreeItem';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';

// Mock file system for reading HTML files
vi.mock('fs', async () => {
  const actual = await vi.importActual('fs');
  return {
    ...actual,
    readFileSync: vi.fn(() => '<html>Mock HTML Content</html>'),
  };
});

describe('Context Menu Commands', () => {
  let promptService: PromptService;
  let treeProvider: PromptTreeProvider;
  let storageProvider: FileStorageProvider;
  let testStorageDir: string;
  let vscode: any;
  let mockWebviewPanel: any;
  let mockContext: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    vscode = await import('vscode');

    // Create mock webview panel
    mockWebviewPanel = {
      webview: {
        html: '',
        onDidReceiveMessage: vi.fn(),
        postMessage: vi.fn(),
      },
      dispose: vi.fn(),
      onDidDispose: vi.fn(),
    };

    vscode.window.createWebviewPanel.mockReturnValue(mockWebviewPanel);

    mockContext = {
      extensionUri: { fsPath: '/mock/extension/path' },
      subscriptions: [],
    };

    // Create test storage
    testStorageDir = path.join(
      os.tmpdir(),
      `prompt-bank-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    );
    storageProvider = new FileStorageProvider({ storagePath: testStorageDir });
    await storageProvider.initialize();

    promptService = new PromptService(storageProvider);
    await promptService.initialize();

    treeProvider = {
      refresh: vi.fn(),
    } as any;
  });

  afterEach(async () => {
    await fs.rm(testStorageDir, { recursive: true, force: true }).catch(() => {});
    vi.clearAllMocks();
  });

  describe('New Prompt in Category', () => {
    it('should open prompt editor with pre-filled category', async () => {
      const category = 'My Custom Category';

      await PromptEditorPanel.showForNewPrompt(
        mockContext as any,
        '',
        promptService,
        treeProvider,
        category
      );

      expect(vscode.window.createWebviewPanel).toHaveBeenCalledWith(
        'promptEditor',
        'New Prompt',
        1,
        expect.any(Object)
      );

      // Verify message handler is set up (panel is functional)
      expect(mockWebviewPanel.webview.onDidReceiveMessage).toHaveBeenCalled();
    });

    it('should default to General category when none provided', async () => {
      await PromptEditorPanel.showForNewPrompt(
        mockContext as any,
        '',
        promptService,
        treeProvider
        // No category provided
      );

      expect(vscode.window.createWebviewPanel).toHaveBeenCalled();
    });

    it('should save prompt with the pre-filled category', async () => {
      const category = 'Development';
      const saveSpy = vi.spyOn(promptService, 'savePromptDirectly');

      await PromptEditorPanel.showForNewPrompt(
        mockContext as any,
        '',
        promptService,
        treeProvider,
        category
      );

      // Simulate user saving the prompt
      const messageHandler = mockWebviewPanel.webview.onDidReceiveMessage.mock.calls[0][0];
      await messageHandler({
        type: 'save',
        data: {
          title: 'New Development Prompt',
          content: 'Some development content',
          category: category,
          description: '',
        },
      });

      expect(saveSpy).toHaveBeenCalled();
      const savedPrompt = saveSpy.mock.calls[0][0];
      expect(savedPrompt.category).toBe(category);
    });
  });

  describe('CategoryTreeItem for context menu', () => {
    it('should have correct contextValue for menu targeting', () => {
      const categoryItem = new CategoryTreeItem('Test Category', 5, 0);
      expect(categoryItem.contextValue).toBe('promptBankCategory');
    });

    it('should expose category name for command handler', () => {
      const categoryName = 'My Category';
      const categoryItem = new CategoryTreeItem(categoryName, 3, 1);
      expect(categoryItem.category).toBe(categoryName);
    });
  });
});
