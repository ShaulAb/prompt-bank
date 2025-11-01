/**
 * Sync commands for personal prompt synchronization
 *
 * Commands for syncing prompts across devices via Supabase backend
 */

import * as vscode from 'vscode';
import type { PromptService } from '../services/promptService';
import { SyncService } from '../services/syncService';

/**
 * Register sync commands with VS Code
 */
export const registerSyncCommands = (
  context: vscode.ExtensionContext,
  promptService: PromptService
): vscode.Disposable[] => {
  const syncService = SyncService.get();

  return [
    // Command: Sync prompts now
    vscode.commands.registerCommand('promptBank.syncPrompts', async () => {
      await syncPromptsCommand(promptService, syncService);
    }),

    // Command: Enable/disable auto-sync
    vscode.commands.registerCommand('promptBank.toggleAutoSync', async () => {
      await toggleAutoSyncCommand();
    }),

    // Command: View sync status
    vscode.commands.registerCommand('promptBank.viewSyncStatus', async () => {
      await viewSyncStatusCommand(syncService);
    }),

    // Command: Clear sync state (reset)
    vscode.commands.registerCommand('promptBank.clearSyncState', async () => {
      await clearSyncStateCommand(syncService);
    }),

    // Command: Restore deleted prompts
    vscode.commands.registerCommand('promptBank.restoreDeletedPrompts', async () => {
      await restoreDeletedPromptsCommand(syncService, promptService);
    }),
  ];
};

/**
 * Sync prompts command handler
 */
async function syncPromptsCommand(
  promptService: PromptService,
  syncService: SyncService
): Promise<void> {
  // Show progress notification
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Syncing prompts...',
      cancellable: false,
    },
    async (progress) => {
      try {
        progress.report({ message: 'Fetching local prompts...' });
        const localPrompts = await promptService.listPrompts();

        progress.report({ message: 'Comparing with cloud...' });
        const result = await syncService.performSync(localPrompts, promptService);

        // Show success message with stats
        const message =
          `Sync completed! ` +
          `${result.stats.uploaded} uploaded, ` +
          `${result.stats.downloaded} downloaded, ` +
          `${result.stats.deleted} deleted, ` +
          `${result.stats.conflicts} conflicts resolved`;

        void vscode.window.showInformationMessage(message);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        // Show user-friendly error message
        void vscode.window.showErrorMessage(`Sync failed: ${errorMessage}`);
      }
    }
  );
}

/**
 * Toggle auto-sync command handler
 */
async function toggleAutoSyncCommand(): Promise<void> {
  const cfg = vscode.workspace.getConfiguration('promptBank');
  const currentValue = cfg.get<boolean>('sync.autoSync', false);

  await cfg.update('sync.autoSync', !currentValue, vscode.ConfigurationTarget.Global);

  const newStatus = !currentValue ? 'enabled' : 'disabled';
  void vscode.window.showInformationMessage(`Auto-sync ${newStatus}`);
}

/**
 * View sync status command handler
 */
async function viewSyncStatusCommand(syncService: SyncService): Promise<void> {
  try {
    const status = await syncService.getSyncStateInfo();

    // Format sync status as QuickPick items
    const items: vscode.QuickPickItem[] = [
      {
        label: '$(account) User',
        description: status.userId,
      },
      {
        label: '$(device-desktop) Device',
        description: status.deviceName,
      },
      {
        label: '$(clock) Last Synced',
        description: status.lastSyncedAt
          ? new Date(status.lastSyncedAt).toLocaleString()
          : 'Never',
      },
      {
        label: '$(database) Synced Prompts',
        description: `${status.syncedPromptCount} prompts`,
      },
    ];

    await vscode.window.showQuickPick(items, {
      title: 'Sync Status',
      canPickMany: false,
    });
  } catch (error: unknown) {
    void vscode.window.showErrorMessage('Failed to get sync status');
  }
}

/**
 * Clear sync state command handler (reset)
 */
async function clearSyncStateCommand(syncService: SyncService): Promise<void> {
  const confirmation = await vscode.window.showWarningMessage(
    'Are you sure you want to clear all sync state? This will not delete your prompts, ' +
      'but will remove all sync metadata. Next sync will be treated as first-time sync.',
    { modal: true },
    'Clear Sync State'
  );

  if (confirmation === 'Clear Sync State') {
    try {
      await syncService.clearAllSyncState();
      void vscode.window.showInformationMessage('Sync state cleared successfully');
    } catch (error: unknown) {
      void vscode.window.showErrorMessage('Failed to clear sync state');
    }
  }
}

/**
 * Restore deleted prompts command handler
 */
async function restoreDeletedPromptsCommand(
  syncService: SyncService,
  promptService: PromptService
): Promise<void> {
  try {
    // Fetch deleted prompts
    const deletedPrompts = await syncService.getDeletedPrompts();

    if (deletedPrompts.length === 0) {
      void vscode.window.showInformationMessage('No deleted prompts to restore');
      return;
    }

    // Show quick pick with deleted prompts
    const items = deletedPrompts.map((p) => ({
      label: p.title,
      description: `Deleted ${p.info.deletedAt?.toLocaleDateString() || 'recently'}`,
      picked: false,
      cloudId: p.info.cloudId,
    }));

    const selected = await vscode.window.showQuickPick(items, {
      canPickMany: true,
      placeHolder: 'Select prompts to restore',
      title: `Restore Deleted Prompts (${deletedPrompts.length} available)`,
    });

    if (!selected || selected.length === 0) {
      return;
    }

    // Restore selected prompts
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Restoring prompts...',
        cancellable: false,
      },
      async (progress) => {
        const cloudIds = selected.map((s) => s.cloudId);
        const restored = await syncService.restoreDeletedPrompts(cloudIds);

        // Trigger a sync to download restored prompts
        progress.report({ message: 'Syncing restored prompts...' });
        const localPrompts = await promptService.listPrompts();
        await syncService.performSync(localPrompts, promptService);

        void vscode.window.showInformationMessage(
          `Successfully restored ${restored} prompt(s)`
        );
      }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    void vscode.window.showErrorMessage(`Failed to restore prompts: ${errorMessage}`);
  }
}
