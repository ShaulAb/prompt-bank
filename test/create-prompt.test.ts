import { describe, it, expect } from 'vitest';
import { FileStorageProvider } from '../src/storage/fileStorage';
import { createPrompt } from '../src/models/prompt';

describe('FileStorageProvider - Create Prompt', () => {
  it('creates and saves a new prompt', async () => {
    const storage = new FileStorageProvider();
    await storage.initialize();

    const prompt = createPrompt('Test Title', 'Test Content', 'General', ['tag1']);
    await storage.save(prompt);

    const prompts = await storage.loadAllPrompts();
    expect(prompts).toHaveLength(1);
    expect(prompts[0].title).toBe('Test Title');
    expect(prompts[0].content).toBe('Test Content');
    expect(prompts[0].category).toBe('General');
    expect(prompts[0].id).toBeDefined();
  });

  it('updates an existing prompt by ID', async () => {
    const storage = new FileStorageProvider();
    await storage.initialize();

    const prompt = createPrompt('Original', 'Original Content');
    await storage.save(prompt);

    prompt.title = 'Updated';
    prompt.content = 'Updated Content';
    await storage.save(prompt);

    const prompts = await storage.loadAllPrompts();
    expect(prompts).toHaveLength(1);
    expect(prompts[0].title).toBe('Updated');
    expect(prompts[0].content).toBe('Updated Content');
  });
});
