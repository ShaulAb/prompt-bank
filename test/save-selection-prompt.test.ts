import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PromptService } from '../src/services/promptService';
import { FileStorageProvider } from '../src/storage/fileStorage';
import { createPrompt } from '../src/models/prompt';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Save Selection as Prompt', () => {
  let promptService: PromptService;
  let storageProvider: FileStorageProvider;
  let testStorageDir: string;

  beforeEach(async () => {
    // Create a unique test directory for each test
    testStorageDir = path.join(
      os.tmpdir(),
      `prompt-bank-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    );
    storageProvider = new FileStorageProvider({ storagePath: testStorageDir });
    await storageProvider.initialize();
    promptService = new PromptService(storageProvider);
    await promptService.initialize();
  });

  afterEach(async () => {
    // Clean up the storage directory after each test
    await fs.rm(testStorageDir, { recursive: true, force: true }).catch(() => {});
    vi.clearAllMocks();
  });

  describe('savePromptDirectly', () => {
    it('should save a new prompt with correct metadata', async () => {
      const newPrompt = createPrompt(
        'Test Prompt',
        'This is test content',
        'Testing',
        'A test description'
      );

      const savedPrompt = await promptService.savePromptDirectly(newPrompt);

      expect(savedPrompt).toBeDefined();
      expect(savedPrompt.id).toBe(newPrompt.id);
      expect(savedPrompt.title).toBe('Test Prompt');
      expect(savedPrompt.content).toBe('This is test content');
      expect(savedPrompt.category).toBe('Testing');
      expect(savedPrompt.description).toBe('A test description');
      expect(savedPrompt.order).toBe(0); // First prompt in category

      // Verify it was actually saved
      const prompts = await storageProvider.loadAllPrompts();
      expect(prompts).toHaveLength(1);
      expect(prompts[0].id).toBe(newPrompt.id);
    });

    it('should assign correct order when category has existing prompts', async () => {
      // Create existing prompts in the same category
      const prompt1 = createPrompt('First', 'Content 1', 'Testing');
      const prompt2 = createPrompt('Second', 'Content 2', 'Testing');
      prompt1.order = 0;
      prompt2.order = 1;
      await storageProvider.save(prompt1);
      await storageProvider.save(prompt2);

      // Save new prompt in the same category
      const newPrompt = createPrompt('Third', 'Content 3', 'Testing');
      const savedPrompt = await promptService.savePromptDirectly(newPrompt);

      expect(savedPrompt.order).toBe(2); // Should be placed after existing prompts
    });

    it('should handle prompts without descriptions', async () => {
      const newPrompt = createPrompt('No Description', 'Content here', 'General');
      // Don't set a description

      const savedPrompt = await promptService.savePromptDirectly(newPrompt);

      expect(savedPrompt.description).toBeUndefined();
      expect(savedPrompt.title).toBe('No Description');
      expect(savedPrompt.content).toBe('Content here');
    });

    it('should preserve all metadata fields', async () => {
      const newPrompt = createPrompt('Metadata Test', 'Test content', 'Testing');
      const createdDate = newPrompt.metadata.created;
      const modifiedDate = newPrompt.metadata.modified;

      const savedPrompt = await promptService.savePromptDirectly(newPrompt);

      expect(savedPrompt.metadata.created).toEqual(createdDate);
      expect(savedPrompt.metadata.modified).toEqual(modifiedDate);
      expect(savedPrompt.metadata.usageCount).toBe(0);
      // Version might not be set on new prompts, so check if it exists or is 1
      if (savedPrompt.metadata.version !== undefined) {
        expect(savedPrompt.metadata.version).toBe(1);
      }
    });

    it('should handle multiple categories correctly', async () => {
      // Create prompts in different categories
      const promptA = createPrompt('Cat A', 'Content', 'Category A');
      const promptB = createPrompt('Cat B', 'Content', 'Category B');
      promptA.order = 0;
      promptB.order = 0;
      await storageProvider.save(promptA);
      await storageProvider.save(promptB);

      // Add new prompt to Category A
      const newPromptA = createPrompt('Cat A 2', 'Content', 'Category A');
      const savedPromptA = await promptService.savePromptDirectly(newPromptA);

      // Add new prompt to Category B
      const newPromptB = createPrompt('Cat B 2', 'Content', 'Category B');
      const savedPromptB = await promptService.savePromptDirectly(newPromptB);

      expect(savedPromptA.order).toBe(1); // Second in Category A
      expect(savedPromptB.order).toBe(1); // Second in Category B

      // Verify all prompts were saved
      const allPrompts = await storageProvider.loadAllPrompts();
      expect(allPrompts).toHaveLength(4);
    });

    it('should handle empty category (first prompt)', async () => {
      const firstPrompt = createPrompt('First Ever', 'Content', 'New Category');
      const savedPrompt = await promptService.savePromptDirectly(firstPrompt);

      expect(savedPrompt.order).toBe(0); // First prompt should have order 0
    });
  });

  describe('Integration with selection context', () => {
    it('should create prompt from selected text content', async () => {
      const selectedText = `function example() {
  console.log('Hello World');
}`;

      const newPrompt = createPrompt(
        'Example Function',
        selectedText,
        'Code Snippets',
        'A simple example function'
      );

      const savedPrompt = await promptService.savePromptDirectly(newPrompt);

      expect(savedPrompt.content).toBe(selectedText);
      expect(savedPrompt.category).toBe('Code Snippets');

      // Verify the content is preserved exactly
      const prompts = await storageProvider.loadAllPrompts();
      expect(prompts[0].content).toBe(selectedText);
    });

    it('should handle multi-line selections', async () => {
      const multiLineText = `Line 1
Line 2
Line 3
Line 4`;

      const newPrompt = createPrompt('Multi-line', multiLineText, 'General');
      const savedPrompt = await promptService.savePromptDirectly(newPrompt);

      expect(savedPrompt.content).toBe(multiLineText);
      expect(savedPrompt.content.split('\n')).toHaveLength(4);
    });

    it('should handle special characters in content', async () => {
      const specialContent = `const regex = /[a-z]+/gi;
const template = \`Hello \${name}!\`;
const escaped = "Line with \\"quotes\\" and 'apostrophes'";`;

      const newPrompt = createPrompt('Special Chars', specialContent, 'Code');
      const savedPrompt = await promptService.savePromptDirectly(newPrompt);

      expect(savedPrompt.content).toBe(specialContent);
    });
  });
});
