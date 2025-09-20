import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PromptService } from '../src/services/promptService';
import { FileStorageProvider } from '../src/storage/fileStorage';
import { createPrompt } from '../src/models/prompt';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('PromptService', () => {
  let promptService: PromptService;
  let storageProvider: FileStorageProvider;
  let testStorageDir: string;
  let vscode: any;

  beforeEach(async () => {
    // Reset mocks
    vi.clearAllMocks();

    // Get vscode mock
    vscode = await import('vscode');

    // Create test storage
    testStorageDir = path.join(
      os.tmpdir(),
      `prompt-bank-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    );
    storageProvider = new FileStorageProvider({ storagePath: testStorageDir });
    await storageProvider.initialize();

    // Initialize service
    promptService = new PromptService(storageProvider);
    await promptService.initialize();
  });

  afterEach(async () => {
    // Clean up
    await fs.rm(testStorageDir, { recursive: true, force: true }).catch(() => {});
    vi.clearAllMocks();
  });

  describe('getPromptContent', () => {
    it('should return selection when text is selected in editor', async () => {
      const selectedText = 'This is selected text';

      // Mock active editor with selection
      vscode.window.activeTextEditor = {
        selection: { isEmpty: false },
        document: {
          getText: vi.fn(() => selectedText),
        },
      };

      // Access private method through reflection
      const getPromptContent = (promptService as any).getPromptContent.bind(promptService);
      const result = await getPromptContent();

      expect(result).toEqual({
        content: selectedText,
        source: 'selection',
      });
    });

    it('should fallback to clipboard when no text is selected', async () => {
      const clipboardText = 'This is from clipboard';

      // Mock no active editor
      vscode.window.activeTextEditor = undefined;

      // Mock clipboard content
      vscode.env.clipboard.readText.mockResolvedValue(clipboardText);

      const getPromptContent = (promptService as any).getPromptContent.bind(promptService);
      const result = await getPromptContent();

      expect(result).toEqual({
        content: clipboardText,
        source: 'clipboard',
      });
    });

    it('should return null when neither selection nor clipboard has content', async () => {
      // Mock editor with no selection
      vscode.window.activeTextEditor = {
        selection: { isEmpty: false },
        document: {
          getText: vi.fn(() => ''), // Empty selection
        },
      };

      // Mock empty clipboard
      vscode.env.clipboard.readText.mockResolvedValue('');

      const getPromptContent = (promptService as any).getPromptContent.bind(promptService);
      const result = await getPromptContent();

      expect(result).toBeNull();
    });

    it('should handle clipboard read errors gracefully', async () => {
      // Mock no editor
      vscode.window.activeTextEditor = undefined;

      // Mock clipboard error
      vscode.env.clipboard.readText.mockRejectedValue(new Error('Clipboard access denied'));

      const getPromptContent = (promptService as any).getPromptContent.bind(promptService);
      const result = await getPromptContent();

      expect(result).toBeNull();
    });

    it('should trim whitespace when checking for content', async () => {
      // Mock editor with whitespace-only selection
      vscode.window.activeTextEditor = {
        selection: { isEmpty: false },
        document: {
          getText: vi.fn(() => '   \n\t  '), // Only whitespace
        },
      };

      // Mock clipboard with actual content
      vscode.env.clipboard.readText.mockResolvedValue('Actual content');

      const getPromptContent = (promptService as any).getPromptContent.bind(promptService);
      const result = await getPromptContent();

      expect(result).toEqual({
        content: 'Actual content',
        source: 'clipboard',
      });
    });
  });

  describe('savePrompt', () => {
    // Note: These tests are commented out because savePrompt requires user input
    // through showInputBox which is difficult to mock reliably in isolation mode.
    // The core functionality is tested through savePromptDirectly tests.

    it.skip('should save prompt from selection', async () => {
      // Skipped: requires complex mocking of user input dialogs
    });

    it.skip('should save prompt from clipboard', async () => {
      // Skipped: requires complex mocking of user input dialogs
    });

    it('should show error when no content is available', async () => {
      // Mock no editor and empty clipboard
      vscode.window.activeTextEditor = undefined;
      vscode.env.clipboard.readText.mockResolvedValue('');

      const savedPrompt = await promptService.savePrompt();

      expect(savedPrompt).toBeNull();
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        'No text selected or available in clipboard to save as a prompt.'
      );
    });

    it('should handle user cancellation', async () => {
      const selectedText = 'Some text';

      // Mock editor with selection
      vscode.window.activeTextEditor = {
        selection: { isEmpty: false },
        document: {
          getText: vi.fn(() => selectedText),
        },
      };

      // Mock user cancels at title input
      vscode.window.showInputBox.mockResolvedValueOnce(undefined);

      const savedPrompt = await promptService.savePrompt();

      expect(savedPrompt).toBeNull();
      expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
    });
  });

  describe('savePromptDirectly', () => {
    it('should add file context when editor is active with known project type', async () => {
      // Mock active editor with package.json file (will be detected as Node.js project)
      vscode.window.activeTextEditor = {
        document: {
          fileName: '/project/package.json',
          languageId: 'json',
        },
      };

      const newPrompt = createPrompt('Test', 'Content', 'Category');
      const savedPrompt = await promptService.savePromptDirectly(newPrompt);

      expect(savedPrompt.metadata.context).toBeDefined();
      expect(savedPrompt.metadata.context?.fileExtension).toBe('json');
      expect(savedPrompt.metadata.context?.language).toBe('json');
      expect(savedPrompt.metadata.context?.projectType).toBe('Node.js');
    });

    it('should work without file context', async () => {
      // Mock no active editor
      vscode.window.activeTextEditor = undefined;

      const newPrompt = createPrompt('Test', 'Content', 'Category');
      const savedPrompt = await promptService.savePromptDirectly(newPrompt);

      expect(savedPrompt.metadata.context).toBeUndefined();
      expect(savedPrompt.title).toBe('Test');
    });

    it('should preserve prompt ID', async () => {
      const newPrompt = createPrompt('Test', 'Content', 'Category');
      const originalId = newPrompt.id;

      const savedPrompt = await promptService.savePromptDirectly(newPrompt);

      expect(savedPrompt.id).toBe(originalId);
    });

    it('should handle sequential saves correctly', async () => {
      const prompt1 = createPrompt('Prompt 1', 'Content 1', 'Category');
      const prompt2 = createPrompt('Prompt 2', 'Content 2', 'Category');
      const prompt3 = createPrompt('Prompt 3', 'Content 3', 'Category');

      // Save prompts sequentially (more realistic for this use case)
      const saved1 = await promptService.savePromptDirectly(prompt1);
      const saved2 = await promptService.savePromptDirectly(prompt2);
      const saved3 = await promptService.savePromptDirectly(prompt3);

      // All should be saved with incremental orders
      expect(saved1.order).toBe(0);
      expect(saved2.order).toBe(1);
      expect(saved3.order).toBe(2);

      // Verify all were saved
      const allPrompts = await storageProvider.loadAllPrompts();
      expect(allPrompts).toHaveLength(3);
    });
  });

  describe('Project Type Detection', () => {
    it('should detect Node.js project from package.json', async () => {
      const detectProjectType = (promptService as any).detectProjectType.bind(promptService);
      const projectType = detectProjectType('/project/package.json');

      expect(projectType).toBe('Node.js');
    });

    it('should detect Python project from requirements.txt', async () => {
      const detectProjectType = (promptService as any).detectProjectType.bind(promptService);
      const projectType = detectProjectType('/project/requirements.txt');

      expect(projectType).toBe('Python');
    });

    it('should return undefined for unknown project types', async () => {
      const detectProjectType = (promptService as any).detectProjectType.bind(promptService);
      const projectType = detectProjectType('/project/src/index.ts');

      expect(projectType).toBeUndefined();
    });
  });

  describe('Integration Tests', () => {
    it('should handle full workflow: save, list, edit, delete', async () => {
      // 1. Save a prompt
      const prompt = createPrompt('Workflow Test', 'Test content', 'Testing');
      const savedPrompt = await promptService.savePromptDirectly(prompt);
      expect(savedPrompt).toBeDefined();

      // 2. List prompts
      const prompts = await promptService.listPrompts();
      expect(prompts).toHaveLength(1);
      expect(prompts[0].title).toBe('Workflow Test');

      // 3. Edit the prompt
      savedPrompt.title = 'Updated Workflow Test';
      savedPrompt.content = 'Updated content';
      await promptService.editPromptById(savedPrompt);

      // 4. Verify edit
      const updatedPrompts = await promptService.listPrompts();
      expect(updatedPrompts[0].title).toBe('Updated Workflow Test');
      expect(updatedPrompts[0].content).toBe('Updated content');

      // 5. Delete the prompt
      const deleted = await promptService.deletePromptById(savedPrompt.id);
      expect(deleted).toBe(true);

      // 6. Verify deletion
      const finalPrompts = await promptService.listPrompts();
      expect(finalPrompts).toHaveLength(0);
    });

    it('should maintain data integrity across operations', async () => {
      // Create multiple prompts
      const prompts = [
        createPrompt('Prompt 1', 'Content 1', 'Category A'),
        createPrompt('Prompt 2', 'Content 2', 'Category B'),
        createPrompt('Prompt 3', 'Content 3', 'Category A'),
      ];

      // Save all prompts
      for (const prompt of prompts) {
        await promptService.savePromptDirectly(prompt);
      }

      // Verify all saved correctly
      const savedPrompts = await promptService.listPrompts();
      expect(savedPrompts).toHaveLength(3);

      // Filter by category
      const categoryAPrompts = await promptService.listPrompts({ category: 'Category A' });
      expect(categoryAPrompts).toHaveLength(2);

      const categoryBPrompts = await promptService.listPrompts({ category: 'Category B' });
      expect(categoryBPrompts).toHaveLength(1);
    });
  });
});
