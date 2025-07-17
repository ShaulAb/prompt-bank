import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PromptService } from '../src/services/promptService';
import { FileStorageProvider } from '../src/storage/fileStorage';
import { createPrompt } from '../src/models/prompt';
import { mockWorkspacePath } from './test-setup';
import { promises as fs } from 'fs';
import * as path from 'path';

describe('PromptService - List Prompts', () => {
  let promptService: PromptService;
  let storageProvider: FileStorageProvider;

  beforeEach(async () => {
    // Initialize FileStorageProvider with the mocked workspace path
    storageProvider = new FileStorageProvider({ storagePath: path.join(mockWorkspacePath, '.vscode', 'prompt-bank') });
    promptService = new PromptService(storageProvider);
    await promptService.initialize();
  });

  afterEach(async () => {
    // Clean up the storage directory after each test
    await fs.rm(path.join(mockWorkspacePath, '.vscode', 'prompt-bank'), { recursive: true, force: true }).catch(() => {});
  });

  it('should return an empty array if no prompts exist', async () => {
    const prompts = await promptService.listPrompts();
    expect(prompts).toEqual([]);
  });

  it('should return all prompts when no filter is applied', async () => {
    const prompt1 = createPrompt('Prompt 1', 'Content 1', 'Category A');
    const prompt2 = createPrompt('Prompt 2', 'Content 2', 'Category B');
    await storageProvider.save(prompt1);
    await storageProvider.save(prompt2);

    const prompts = await promptService.listPrompts();
    expect(prompts).toHaveLength(2);
    expect(prompts.map(p => p.title)).toEqual(['Prompt 1', 'Prompt 2']);
  });

  it('should filter prompts by category', async () => {
    const prompt1 = createPrompt('Prompt 1', 'Content 1', 'Category A');
    const prompt2 = createPrompt('Prompt 2', 'Content 2', 'Category B');
    const prompt3 = createPrompt('Prompt 3', 'Content 3', 'Category A');
    await storageProvider.save(prompt1);
    await storageProvider.save(prompt2);
    await storageProvider.save(prompt3);

    const prompts = await promptService.listPrompts({ category: 'Category A' });
    expect(prompts).toHaveLength(2);
    expect(prompts.map(p => p.title)).toEqual(['Prompt 1', 'Prompt 3']);
  });


  it('should filter prompts by search term (title, content, description)', async () => {
    const prompt1 = createPrompt('My Awesome Prompt', 'This is some content about awesome things.', 'Category A');
    prompt1.description = 'A prompt for awesome development.';
    const prompt2 = createPrompt('Another Prompt', 'Content for another prompt.', 'Category B');
    await storageProvider.save(prompt1);
    await storageProvider.save(prompt2);

    const prompts1 = await promptService.listPrompts({ search: 'awesome' });
    expect(prompts1).toHaveLength(1);
    expect(prompts1[0].title).toBe('My Awesome Prompt');

    const prompts2 = await promptService.listPrompts({ search: 'another' });
    expect(prompts2).toHaveLength(1);
    expect(prompts2[0].title).toBe('Another Prompt');

    const prompts3 = await promptService.listPrompts({ search: 'development' });
    expect(prompts3).toHaveLength(1);
    expect(prompts3[0].title).toBe('My Awesome Prompt');
  });

  it('should sort prompts by created date (descending by default)', async () => {
    const prompt1 = createPrompt('Prompt 1', 'Content 1');
    prompt1.metadata.created = new Date('2023-01-01T10:00:00Z');
    const prompt2 = createPrompt('Prompt 2', 'Content 2');
    prompt2.metadata.created = new Date('2023-01-01T10:00:01Z');
    await savePrompts(prompt1, prompt2);

    const prompts = await promptService.listPrompts({ sortBy: 'created' });
    expect(prompts.map(p => p.title)).toEqual(['Prompt 2', 'Prompt 1']);
  });

  // Helper function to save multiple prompts
  async function savePrompts(...prompts: any[]) {
    for (const prompt of prompts) {
      await storageProvider.save(prompt);
    }
  }

  it('should sort prompts by created date (ascending)', async () => {
    const prompt1 = createPrompt('Prompt 1', 'Content 1');
    prompt1.metadata.created = new Date('2023-01-01T10:00:00Z');
    const prompt2 = createPrompt('Prompt 2', 'Content 2');
    prompt2.metadata.created = new Date('2023-01-01T10:00:01Z');
    await savePrompts(prompt1, prompt2);

    const prompts = await promptService.listPrompts({ sortBy: 'created', sortOrder: 'asc' });
    expect(prompts.map(p => p.title)).toEqual(['Prompt 1', 'Prompt 2']);
  });

  it('should sort prompts by usageCount (descending by default)', async () => {
    const prompt1 = createPrompt('Prompt 1', 'Content 1');
    prompt1.metadata.usageCount = 10;
    const prompt2 = createPrompt('Prompt 2', 'Content 2');
    prompt2.metadata.usageCount = 5;
    await storageProvider.save(prompt1);
    await storageProvider.save(prompt2);

    const prompts = await promptService.listPrompts({ sortBy: 'usageCount' });
    expect(prompts.map(p => p.title)).toEqual(['Prompt 1', 'Prompt 2']);
  });


});