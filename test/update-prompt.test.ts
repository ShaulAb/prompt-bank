import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FileStorageProvider } from '../src/storage/fileStorage';
import { createPrompt } from '../src/models/prompt';
import { mockWorkspacePath } from './test-setup';
import { promises as fs } from 'fs';
import * as path from 'path';

describe('FileStorageProvider - Update Prompt', () => {
  let storageProvider: FileStorageProvider;

  beforeEach(async () => {
    storageProvider = new FileStorageProvider({ storagePath: path.join(mockWorkspacePath, '.vscode', 'prompt-bank') });
    await storageProvider.initialize();
  });

  afterEach(async () => {
    // Clean up the storage directory after each test
    await fs.rm(path.join(mockWorkspacePath, '.vscode', 'prompt-bank'), { recursive: true, force: true }).catch(() => {});
  });

  it('should update an existing prompt', async () => {
    const initialPrompt = createPrompt('Original Title', 'Original Content', 'Category A', ['tag1']);
    await storageProvider.save(initialPrompt);

    // Modify values
    initialPrompt.title = 'Updated Title';
    initialPrompt.content = 'Updated Content';
    initialPrompt.category = 'Category B';
    initialPrompt.metadata.usageCount = 5;

    await storageProvider.update(initialPrompt);

    const prompts = await storageProvider.loadAllPrompts();
    expect(prompts).toHaveLength(1);
    const updatedPrompt = prompts[0];

    expect(updatedPrompt.id).toBe(initialPrompt.id);
    expect(updatedPrompt.title).toBe('Updated Title');
    expect(updatedPrompt.content).toBe('Updated Content');
    expect(updatedPrompt.category).toBe('Category B');
    expect(updatedPrompt.metadata.usageCount).toBe(5);
    expect(new Date(updatedPrompt.metadata.modified).getTime())
      .toBeGreaterThanOrEqual(initialPrompt.metadata.modified.getTime());
  });

  it('should create a new prompt if update is called with a non-existent ID', async () => {
    const nonExistentPrompt = createPrompt('Non Existent', 'Content');
    await storageProvider.update(nonExistentPrompt);

    const prompts = await storageProvider.loadAllPrompts();
    expect(prompts).toHaveLength(1);
    expect(prompts[0].id).toBe(nonExistentPrompt.id);
  });
});
