import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PromptEditorPanel } from '../src/webview/PromptEditorPanel';
import { PromptService } from '../src/services/promptService';
import { PromptTreeProvider } from '../src/views/promptTreeProvider';
import { FileStorageProvider } from '../src/storage/fileStorage';
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

describe('New Prompt Command (promptBank.newPrompt)', () => {
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

  describe('Opening Editor Panel', () => {
    it('should open prompt editor panel with empty content', async () => {
      const panel = await PromptEditorPanel.showForNewPrompt(
        mockContext as any,
        '', // Empty content - this is what newPrompt command does
        promptService,
        treeProvider
      );

      expect(vscode.window.createWebviewPanel).toHaveBeenCalledWith(
        'promptEditor',
        'New Prompt',
        1, // ViewColumn.One
        expect.any(Object)
      );
    });

    it('should set up message handler for webview communication', async () => {
      await PromptEditorPanel.showForNewPrompt(mockContext as any, '', promptService, treeProvider);

      expect(mockWebviewPanel.webview.onDidReceiveMessage).toHaveBeenCalled();
    });
  });

  describe('Saving New Prompt', () => {
    it('should save prompt when user fills form and submits', async () => {
      const saveSpy = vi.spyOn(promptService, 'savePromptDirectly');

      await PromptEditorPanel.showForNewPrompt(mockContext as any, '', promptService, treeProvider);

      // Simulate user filling the form and saving
      const messageHandler = mockWebviewPanel.webview.onDidReceiveMessage.mock.calls[0][0];
      await messageHandler({
        type: 'save',
        data: {
          title: 'My New Prompt',
          content: 'User typed this content',
          category: 'General',
          description: 'A helpful prompt',
        },
      });

      expect(saveSpy).toHaveBeenCalled();
      const savedPrompt = saveSpy.mock.calls[0][0];
      expect(savedPrompt.title).toBe('My New Prompt');
      expect(savedPrompt.content).toBe('User typed this content');
      expect(savedPrompt.category).toBe('General');
      expect(savedPrompt.description).toBe('A helpful prompt');
    });

    it('should refresh tree view after saving new prompt', async () => {
      await PromptEditorPanel.showForNewPrompt(mockContext as any, '', promptService, treeProvider);

      const messageHandler = mockWebviewPanel.webview.onDidReceiveMessage.mock.calls[0][0];
      await messageHandler({
        type: 'save',
        data: {
          title: 'Test Prompt',
          content: 'Test content',
          category: 'Testing',
          description: '',
        },
      });

      expect(treeProvider.refresh).toHaveBeenCalled();
    });

    it('should handle saving prompt without description', async () => {
      const saveSpy = vi.spyOn(promptService, 'savePromptDirectly');

      await PromptEditorPanel.showForNewPrompt(mockContext as any, '', promptService, treeProvider);

      const messageHandler = mockWebviewPanel.webview.onDidReceiveMessage.mock.calls[0][0];
      await messageHandler({
        type: 'save',
        data: {
          title: 'No Description',
          content: 'Some content',
          category: 'General',
          description: '', // Empty description
        },
      });

      expect(saveSpy).toHaveBeenCalled();
      const savedPrompt = saveSpy.mock.calls[0][0];
      expect(savedPrompt.description).toBeUndefined();
    });

    it('should handle saving prompt with new category', async () => {
      const saveSpy = vi.spyOn(promptService, 'savePromptDirectly');

      await PromptEditorPanel.showForNewPrompt(mockContext as any, '', promptService, treeProvider);

      const messageHandler = mockWebviewPanel.webview.onDidReceiveMessage.mock.calls[0][0];
      await messageHandler({
        type: 'save',
        data: {
          title: 'First in Category',
          content: 'Content here',
          category: 'Brand New Category',
          description: '',
        },
      });

      expect(saveSpy).toHaveBeenCalled();
      const savedPrompt = saveSpy.mock.calls[0][0];
      expect(savedPrompt.category).toBe('Brand New Category');
    });
  });

  describe('Cancel Operation', () => {
    it('should dispose panel when cancel message received', async () => {
      await PromptEditorPanel.showForNewPrompt(mockContext as any, '', promptService, treeProvider);

      const messageHandler = mockWebviewPanel.webview.onDidReceiveMessage.mock.calls[0][0];
      await messageHandler({ type: 'cancel' });

      expect(mockWebviewPanel.dispose).toHaveBeenCalled();
    });
  });
});
