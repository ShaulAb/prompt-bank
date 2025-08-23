import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FileStorageProvider } from '../src/storage/fileStorage';
import { createPrompt } from '../src/models/prompt';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('FileStorageProvider - Delete Prompt', () => {
  let storageProvider: FileStorageProvider;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'prompt-bank-test-'));
    storageProvider = new FileStorageProvider({ storagePath: tempDir });
    await storageProvider.initialize();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('should delete an existing prompt', async () => {
    const prompt1 = createPrompt('Prompt 1', 'Content 1');
    const prompt2 = createPrompt('Prompt 2', 'Content 2');

    await storageProvider.save(prompt1);
    await storageProvider.save(prompt2);

    const deleted = await storageProvider.delete(prompt1.id);
    expect(deleted).toBe(true);

    const prompts = (await storageProvider.loadAllPrompts?.()) ?? []; // Fallback if loadAllPrompts is not public
    expect(prompts).toHaveLength(1);
    expect(prompts[0].id).toBe(prompt2.id);
  });

  it('should return false if prompt to delete does not exist', async () => {
    const prompt = createPrompt('Prompt 1', 'Content 1');
    await storageProvider.save(prompt);

    const deleted = await storageProvider.delete('non-existent-id');
    expect(deleted).toBe(false);

    const prompts = (await storageProvider.loadAllPrompts?.()) ?? [];
    expect(prompts).toHaveLength(1);
  });
});
