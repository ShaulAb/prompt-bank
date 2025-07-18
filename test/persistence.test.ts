import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { FileStorageProvider } from '../src/storage/fileStorage';
import { createPrompt } from '../src/models/prompt';

describe('FileStorageProvider - Data Persistence', () => {
  let storageProvider1: FileStorageProvider;
  let storageProvider2: FileStorageProvider;
  let sharedStorageDir: string;

  beforeEach(async () => {
    // Create a shared storage directory for both instances
    sharedStorageDir = path.join(os.tmpdir(), `prompt-bank-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
    storageProvider1 = new FileStorageProvider({ storagePath: sharedStorageDir });
    await storageProvider1.initialize();
  });

  afterEach(async () => {
    // Clean up the shared storage directory
    await fs.rm(sharedStorageDir, { recursive: true, force: true }).catch(() => {});
  });

  it('should persist data across different instances of FileStorageProvider', async () => {
    const prompt = createPrompt('Persistence Test', 'This should persist.');
    await storageProvider1.save(prompt);

    // Create a new instance of the storage provider using the same storage path
    storageProvider2 = new FileStorageProvider({ storagePath: sharedStorageDir });
    await storageProvider2.initialize();

    const loadedPrompts = await storageProvider2.loadAllPrompts();
    expect(loadedPrompts).toHaveLength(1);
    expect(loadedPrompts[0].title).toBe('Persistence Test');
    expect(loadedPrompts[0].content).toBe('This should persist.');
  });
});
