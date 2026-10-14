import { expect, it, vi } from 'vitest';
import { SyncEngine } from '../src/services/sync/syncEngine';
import { computeContentHash } from '../src/utils/contentHash';
import { createPrompt } from './helpers/prompt-factory';
import type { SyncTransport, LocalPromptStore } from '../src/services/sync/syncTransport';
import type { SyncStateStorage } from '../src/storage/syncStateStorage';

function setup(changed = false, personal = true) {
  const prompt = createPrompt({ title: 'Recovery', content: 'Original' });
  const info = {
    cloudId: 'old-cloud',
    lastSyncedContentHash: computeContentHash(prompt),
    lastSyncedAt: new Date(),
    version: 1,
  };
  if (changed) prompt.content = 'Unsynced local edit';
  const transport = {
    getWritePermission: () => ({ canUpload: true, canDelete: true }),
    parseSyncConflictError: () => null,
    uploadPrompt: vi.fn().mockResolvedValue({ cloudId: 'new-cloud', version: 1 }),
  };
  const storage = {
    getPromptSyncInfo: vi.fn().mockResolvedValue(info),
    setPromptSyncInfo: vi.fn(),
  };
  const store = { deletePromptById: vi.fn().mockResolvedValue(true), savePromptDirectly: vi.fn() };
  const engine = new SyncEngine(
    transport as unknown as SyncTransport,
    storage as unknown as SyncStateStorage,
    { handleCloudDeletion: personal, handleWebCreatedPrompts: personal, checkQuota: false }
  );
  return { engine, prompt, info, transport, storage, store: store as unknown as LocalPromptStore };
}

it('honors permanent remote deletion of an unchanged personal prompt', async () => {
  const h = setup();
  const plan = h.engine.computeSyncPlan([h.prompt], [], new Date(), { [h.prompt.id]: h.info });
  expect(plan.toUpload).toHaveLength(0);
  expect(plan.toDeleteLocally).toHaveLength(1);
  const result = await h.engine.executeSyncPlan(plan, h.store);
  expect(result.stats.deleted).toBe(1);
  expect(h.storage.setPromptSyncInfo).toHaveBeenCalledWith(
    h.prompt.id,
    expect.objectContaining({ isDeleted: true })
  );
});

it('preserves local edits by creating a new cloud row without the missing ID', async () => {
  const h = setup(true);
  const plan = h.engine.computeSyncPlan([h.prompt], [], new Date(), { [h.prompt.id]: h.info });
  expect(plan.toDeleteLocally).toHaveLength(0);
  const result = await h.engine.executeSyncPlan(plan, h.store);
  expect(result.stats.uploaded).toBe(1);
  expect(h.transport.uploadPrompt).toHaveBeenCalledWith(h.prompt, undefined);
  expect(h.storage.setPromptSyncInfo).toHaveBeenCalledWith(
    h.prompt.id,
    expect.objectContaining({ cloudId: 'new-cloud' })
  );
});

it('does not infer deletion from a missing team prompt', () => {
  const h = setup(false, false);
  expect(
    h.engine.computeSyncPlan([h.prompt], [], new Date(), { [h.prompt.id]: h.info }).toDeleteLocally
  ).toHaveLength(0);
});

it('keeps local content and the previous mapping when recreation fails', async () => {
  const h = setup(true);
  h.transport.uploadPrompt.mockRejectedValue(new Error('server unavailable'));
  const plan = h.engine.computeSyncPlan([h.prompt], [], new Date(), { [h.prompt.id]: h.info });
  await expect(h.engine.executeSyncPlan(plan, h.store)).rejects.toThrow('server unavailable');
  expect(h.storage.setPromptSyncInfo).not.toHaveBeenCalled();
  expect(h.store.deletePromptById).not.toHaveBeenCalled();
  expect(h.prompt.content).toBe('Unsynced local edit');
});

it('still uploads a never-synced local prompt', () => {
  const h = setup();
  expect(h.engine.computeSyncPlan([h.prompt], [], undefined, {}).toUpload).toEqual([h.prompt]);
});
