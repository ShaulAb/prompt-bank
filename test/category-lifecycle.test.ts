import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createPrompt } from '../src/models/prompt';
import { PromptService } from '../src/services/promptService';
import { FileStorageProvider } from '../src/storage/fileStorage';

describe('Category lifecycle with file storage', () => {
  let storagePath: string;
  let service: PromptService;

  async function reopen(): Promise<PromptService> {
    const reopened = new PromptService(new FileStorageProvider({ storagePath }));
    await reopened.initialize();
    return reopened;
  }

  beforeEach(async () => {
    storagePath = await fs.mkdtemp(path.join(os.tmpdir(), 'prompt-bank-categories-'));
    service = await reopen();
  });

  afterEach(async () => {
    await service.dispose();
    await fs.rm(storagePath, { recursive: true, force: true });
  });

  it('persists an empty category across service instances and trims its name', async () => {
    await service.createCategory('  Code Review  ');

    const reopened = await reopen();
    expect(await reopened.getCategories()).toEqual(['Code Review']);
    expect(await reopened.listPrompts()).toEqual([]);
  });

  it('persists renaming an empty category', async () => {
    await service.createCategory('Drafts');

    expect(await service.renameCategory('Drafts', 'Reviews')).toBe(0);

    expect(await (await reopen()).getCategories()).toEqual(['Reviews']);
  });

  it('deletes an empty category without deleting other categories or prompts', async () => {
    await service.createCategory('Drafts');
    await service.createCategory('Keep');
    const prompt = createPrompt('Existing prompt', 'Keep this content', 'Keep');
    await service.savePromptDirectly(prompt);

    await service.deleteCategory('Drafts');

    const reopened = await reopen();
    expect(await reopened.getCategories()).toEqual(['Keep']);
    expect(await reopened.listPrompts()).toEqual([expect.objectContaining({ id: prompt.id })]);
  });

  it('retains categories from existing prompts when no category file exists', async () => {
    await service.savePromptDirectly(createPrompt('Legacy prompt', 'Content', 'Legacy'));
    await expect(fs.access(path.join(storagePath, 'categories.json'))).rejects.toThrow();

    const reopened = await reopen();
    expect(await reopened.getCategories()).toEqual(['Legacy']);
    await reopened.createCategory('Empty');
    expect((await (await reopen()).getCategories()).sort()).toEqual(['Empty', 'Legacy']);
  });

  it('renames a populated category and preserves its prompt content after reopening', async () => {
    await service.createCategory('Drafts');
    const prompt = createPrompt('Review request', 'Review this code', 'Drafts');
    await service.savePromptDirectly(prompt);

    expect(await service.renameCategory('Drafts', 'Reviews')).toBe(1);

    const reopened = await reopen();
    expect(await reopened.getCategories()).toEqual(['Reviews']);
    expect(await reopened.listPrompts()).toEqual([
      expect.objectContaining({ id: prompt.id, category: 'Reviews', content: 'Review this code' }),
    ]);
  });

  it('rejects blank names and case-insensitive duplicates from stored or prompt categories', async () => {
    await service.createCategory('Reviews');
    await service.savePromptDirectly(createPrompt('Legacy prompt', 'Content', 'Legacy'));

    await expect(service.createCategory('   ')).rejects.toThrow('cannot be empty');
    await expect(service.createCategory(' reviews ')).rejects.toThrow('already exists');
    await expect(service.createCategory('LEGACY')).rejects.toThrow('already exists');

    expect((await (await reopen()).getCategories()).sort()).toEqual(['Legacy', 'Reviews']);
  });
});
