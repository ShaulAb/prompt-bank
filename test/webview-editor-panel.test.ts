import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PromptEditorPanel } from '../src/webview/PromptEditorPanel';
import { WebViewCache } from '../src/webview/WebViewCache';
import { PromptService } from '../src/services/promptService';
import { PromptTreeProvider } from '../src/views/promptTreeProvider';
import { FileStorageProvider } from '../src/storage/fileStorage';
import { createPrompt } from '../src/models/prompt';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';

// Mock file system for reading HTML files
vi.mock('fs', async () => {
  const actual = await vi.importActual('fs');
  return {
    ...actual,
    readFileSync: vi.fn(
      () => '<html>/*__PROMPT_DATA_INJECTION__*/ null; /*__PROMPT_CATEGORIES__*/ null</html>'
    ),
  };
});

describe('PromptEditorPanel', () => {
  let promptService: PromptService;
  let treeProvider: PromptTreeProvider;
  let storageProvider: FileStorageProvider;
  let testStorageDir: string;
  let vscode: any;
  let mockWebviewPanel: any;
  let mockContext: any;

  beforeEach(async () => {
    // Reset mocks
    vi.clearAllMocks();
    WebViewCache.clear();

    // Get vscode mock
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

    // Set up createWebviewPanel to return our mock
    vscode.window.createWebviewPanel.mockReturnValue(mockWebviewPanel);

    // Mock context
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

    // Initialize services
    promptService = new PromptService(storageProvider);
    await promptService.initialize();

    // Create mock tree provider
    treeProvider = {
      refresh: vi.fn(),
    } as any;
  });

  afterEach(async () => {
    // Clean up
    await fs.rm(testStorageDir, { recursive: true, force: true }).catch(() => {});
    vi.clearAllMocks();
  });

  describe.each(['show', 'showForNewPrompt'] as const)('%s category choices', (entryPoint) => {
    async function openEditor() {
      if (entryPoint === 'show') {
        await PromptEditorPanel.show(mockContext, undefined, promptService, treeProvider);
      } else {
        await PromptEditorPanel.showForNewPrompt(mockContext, '', promptService, treeProvider);
      }
    }

    it('offers stored empty categories in the editor', async () => {
      await promptService.createCategory('Empty category');
      await openEditor();
      await vi.waitFor(() =>
        expect(mockWebviewPanel.webview.postMessage).toHaveBeenCalledWith({
          type: 'categories',
          data: ['Empty category', 'General'],
          selected: undefined,
        })
      );
    });

    it('refreshes category choices after creating, renaming, and deleting categories', async () => {
      await openEditor();
      await promptService.createCategory('Drafts');
      await openEditor();
      await vi.waitFor(() =>
        expect(mockWebviewPanel.webview.postMessage).toHaveBeenCalledWith({
          type: 'categories',
          data: ['Drafts', 'General'],
          selected: undefined,
        })
      );

      await promptService.renameCategory('Drafts', 'Reviews');
      await openEditor();
      await vi.waitFor(() =>
        expect(mockWebviewPanel.webview.postMessage).toHaveBeenCalledWith({
          type: 'categories',
          data: ['General', 'Reviews'],
          selected: undefined,
        })
      );

      await promptService.deleteCategory('Reviews');
      await openEditor();
      await vi.waitFor(() =>
        expect(mockWebviewPanel.webview.postMessage).toHaveBeenCalledWith({
          type: 'categories',
          data: ['General'],
          selected: undefined,
        })
      );
    });
  });

  describe('Edit Mode (existing prompt)', () => {
    it('loads current storage data instead of a stale tree item', async () => {
      const stale = createPrompt('Stale', 'old', 'Test');
      await storageProvider.save(stale);
      await storageProvider.save({ ...stale, content: 'downloaded content' });
      await PromptEditorPanel.show(mockContext, stale, promptService, treeProvider);
      expect(mockWebviewPanel.webview.html).toContain('downloaded content');
    });

    it('preserves a draft rather than overwriting a prompt changed after opening', async () => {
      const original = createPrompt('Prompt', 'original', 'Test');
      await storageProvider.save(original);
      await PromptEditorPanel.show(mockContext, original, promptService, treeProvider);
      await storageProvider.save({ ...original, content: 'new cloud content' });
      const handler = mockWebviewPanel.webview.onDidReceiveMessage.mock.calls[0][0];
      await handler({
        type: 'save',
        data: { title: 'Prompt', content: 'stale draft', category: 'Test', description: '' },
      });
      expect((await storageProvider.load(original.id))?.content).toBe('new cloud content');
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining('Your draft')
      );
      expect(mockWebviewPanel.dispose).not.toHaveBeenCalled();
    });

    it('does not reopen an editor for a deleted tree item', async () => {
      const deleted = createPrompt('Deleted', 'old', 'Test');
      await PromptEditorPanel.show(mockContext, deleted, promptService, treeProvider);
      expect(vscode.window.createWebviewPanel).not.toHaveBeenCalled();
    });
    // These tests are simplified because createOrShow is a static method that's hard to test
    it.skip('should create panel in edit mode with existing prompt data', async () => {
      // Skipped: requires more complex mocking of static methods
    });

    it.skip('should update existing prompt when saving in edit mode', async () => {
      // Skipped: requires more complex mocking of static methods
    });
  });

  describe('Create Mode (new prompt with initial content)', () => {
    it.skip('should create panel in create mode with initial content', async () => {
      // Skipped: showForNewPrompt is a static method that's hard to test in isolation
    });

    it('should save new prompt when in create mode', async () => {
      const initialContent = 'Selected code snippet';

      // Spy on the savePromptDirectly method
      const saveSpy = vi.spyOn(promptService, 'savePromptDirectly');

      const panel = await PromptEditorPanel.showForNewPrompt(
        mockContext as any,
        initialContent,
        promptService,
        treeProvider
      );

      // Simulate save message from webview
      const messageHandler = mockWebviewPanel.webview.onDidReceiveMessage.mock.calls[0][0];
      await messageHandler({
        type: 'save',
        data: {
          title: 'New Prompt Title',
          content: initialContent,
          category: 'Code Snippets',
          description: 'A useful code snippet',
        },
      });

      expect(saveSpy).toHaveBeenCalled();
      const savedPrompt = saveSpy.mock.calls[0][0];
      expect(savedPrompt.title).toBe('New Prompt Title');
      expect(savedPrompt.content).toBe(initialContent);
      expect(savedPrompt.category).toBe('Code Snippets');
      expect(savedPrompt.description).toBe('A useful code snippet');
    });

    it('should handle empty description in create mode', async () => {
      const initialContent = 'Some content';
      const saveSpy = vi.spyOn(promptService, 'savePromptDirectly');

      const panel = await PromptEditorPanel.showForNewPrompt(
        mockContext as any,
        initialContent,
        promptService,
        treeProvider
      );

      const messageHandler = mockWebviewPanel.webview.onDidReceiveMessage.mock.calls[0][0];
      await messageHandler({
        type: 'save',
        data: {
          title: 'No Description Prompt',
          content: initialContent,
          category: 'General',
          description: '', // Empty description
        },
      });

      expect(saveSpy).toHaveBeenCalled();
      const savedPrompt = saveSpy.mock.calls[0][0];
      expect(savedPrompt.description).toBeUndefined();
    });
  });

  describe('Panel Management', () => {
    it.skip('should dispose panel after save', async () => {
      // Skipped: requires more complex mocking of static methods
    });

    it.skip('should refresh tree view after save', async () => {
      // Skipped: requires more complex mocking of static methods
    });

    it.skip('should handle cancel message', async () => {
      // Skipped: requires more complex mocking of static methods
    });
  });

  describe('Category Handling', () => {
    it.skip('should load existing categories for dropdown', async () => {
      // Skipped: showForNewPrompt is a static method that's hard to test in isolation
    });

    it('should handle new category creation', async () => {
      const saveSpy = vi.spyOn(promptService, 'savePromptDirectly');

      const panel = await PromptEditorPanel.showForNewPrompt(
        mockContext as any,
        'Content for new category',
        promptService,
        treeProvider
      );

      const messageHandler = mockWebviewPanel.webview.onDidReceiveMessage.mock.calls[0][0];
      await messageHandler({
        type: 'save',
        data: {
          title: 'First in New Category',
          content: 'Content',
          category: 'Brand New Category', // New category
          description: '',
        },
      });

      expect(saveSpy).toHaveBeenCalled();
      const savedPrompt = saveSpy.mock.calls[0][0];
      expect(savedPrompt.category).toBe('Brand New Category');
    });
  });
});
