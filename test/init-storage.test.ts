import { describe, it, expect, beforeEach } from 'vitest';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { FileStorageProvider } from '../src/storage/fileStorage';

describe('FileStorageProvider Initialization', () => {
  let storageProvider: FileStorageProvider;
  let storageDir: string;

  beforeEach(async () => {
    // Create a unique test directory for each test
    storageDir = path.join(
      os.tmpdir(),
      `prompt-bank-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    );
    await fs.rm(storageDir, { recursive: true, force: true }).catch(() => {});
    storageProvider = new FileStorageProvider({ storagePath: storageDir });
  });

  it('should create the storage directory and prompts.json on initialization', async () => {
    await storageProvider.initialize();

    const storagePath = storageProvider.getStoragePath();
    const promptsPath = path.join(storagePath, 'prompts.json');
    const metadataPath = path.join(storagePath, 'metadata.json');

    const dirStats = await fs.stat(storagePath);
    expect(dirStats.isDirectory()).toBe(true);

    const prompts = JSON.parse(await fs.readFile(promptsPath, 'utf8'));
    expect(prompts).toEqual([]);

    const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf8'));
    expect(metadata.version).toBe('1.0.0');
    expect(metadata.created).toBeDefined();
    expect(metadata.lastModified).toBeDefined();
  });

  it('should preserve existing prompts.json on re-initialization', async () => {
    await storageProvider.initialize();

    const promptsPath = path.join(storageProvider.getStoragePath(), 'prompts.json');
    const existingPrompts = [{ id: '123', title: 'Preserved Prompt' }];
    await fs.writeFile(promptsPath, JSON.stringify(existingPrompts, null, 2));

    await storageProvider.initialize();

    const prompts = JSON.parse(await fs.readFile(promptsPath, 'utf8'));
    expect(prompts).toEqual(existingPrompts);
  });

  it('should preserve existing metadata.json on re-initialization', async () => {
    await storageProvider.initialize();

    const metadataPath = path.join(storageProvider.getStoragePath(), 'metadata.json');
    const existingMeta = {
      version: '1.0.0',
      created: '2023-01-01T00:00:00.000Z',
      lastModified: '2023-01-01T00:00:00.000Z',
    };
    await fs.writeFile(metadataPath, JSON.stringify(existingMeta, null, 2));

    await storageProvider.initialize();

    const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf8'));
    expect(metadata).toEqual(existingMeta);
  });
});
