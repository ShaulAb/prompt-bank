import { describe, it, expect, beforeEach } from 'vitest';
import { FileStorageProvider } from '../src/storage/fileStorage';
import { createPrompt } from '../src/models/prompt';

describe('FileStorageProvider - Data Persistence', () => {
  let storageProvider1: FileStorageProvider;
  let storageProvider2: FileStorageProvider;

  beforeEach(async () => {
    storageProvider1 = new FileStorageProvider();
    await storageProvider1.initialize();
  });

  it('should persist data across different instances of FileStorageProvider', async () => {
    const prompt = createPrompt('Persistence Test', 'This should persist.');
    await storageProvider1.save(prompt);

    // Create a new instance of the storage provider
    storageProvider2 = new FileStorageProvider();
    await storageProvider2.initialize();

    const loadedPrompts = await storageProvider2.loadAllPrompts();
    expect(loadedPrompts).toHaveLength(1);
    expect(loadedPrompts[0].title).toBe('Persistence Test');
    expect(loadedPrompts[0].content).toBe('This should persist.');
  });
});
