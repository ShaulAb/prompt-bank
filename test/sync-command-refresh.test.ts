import { expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { registerSyncCommands } from '../src/commands/syncCommands';
import { WebViewCache } from '../src/webview/WebViewCache';
import type { PromptService } from '../src/services/promptService';
import type { SyncService } from '../src/services/syncService';

vi.mock('vscode', () => ({
  commands: { registerCommand: vi.fn(() => ({ dispose: vi.fn() })) },
  ProgressLocation: { Notification: 1 },
  window: {
    withProgress: vi.fn((_options, task) => task({ report: vi.fn() })),
    showInformationMessage: vi.fn(),
    showErrorMessage: vi.fn(),
  },
}));

for (const failed of [false, true]) {
  it(`refreshes sidebar and category cache after ${failed ? 'partial failure' : 'sync completion'}`, async () => {
    vi.clearAllMocks();
    WebViewCache.setCategoriesCache(['stale category']);
    const refresh = vi.fn();
    const performSync = failed
      ? vi.fn().mockRejectedValue(new Error('server unavailable'))
      : vi
          .fn()
          .mockResolvedValue({ stats: { uploaded: 0, downloaded: 1, deleted: 0, conflicts: 0 } });
    registerSyncCommands(
      {} as vscode.ExtensionContext,
      { listPrompts: vi.fn().mockResolvedValue([]) } as unknown as PromptService,
      { performSync } as unknown as SyncService,
      refresh
    );
    const command = vi
      .mocked(vscode.commands.registerCommand)
      .mock.calls.find(([name]) => name === 'promptBank.syncPrompts')![1];
    await command();
    expect(refresh).toHaveBeenCalledOnce();
    expect(WebViewCache.getCachedCategories()).toBeNull();
  });
}
