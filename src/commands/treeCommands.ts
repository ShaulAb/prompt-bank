import * as vscode from 'vscode';
import { Prompt, getVersionNumber, getCurrentVersion } from '../models/prompt';
import { PromptTreeProvider } from '../views/promptTreeProvider';
import { PromptService } from '../services/promptService';
import { PromptTreeItem, CategoryTreeItem } from '../views/promptTreeItem';
import { PromptEditorPanel } from '../webview/PromptEditorPanel';

/**
 * Tree-specific commands for the Prompt Bank tree view
 */
export class TreeCommands {
  private context: vscode.ExtensionContext | undefined;

  constructor(
    private treeProvider: PromptTreeProvider,
    private promptService: PromptService
  ) {}

  /**
   * Register all tree commands
   */
  registerCommands(context: vscode.ExtensionContext): void {
    this.context = context;

    // Refresh tree view
    const refreshCommand = vscode.commands.registerCommand('promptBank.refreshTreeView', () => {
      this.treeProvider.refresh();
      vscode.window.showInformationMessage('Prompt Bank tree refreshed');
    });

    // New prompt in category (from category context menu)
    const newPromptInCategoryCommand = vscode.commands.registerCommand(
      'promptBank.newPromptInCategory',
      async (item: CategoryTreeItem) => {
        if (!this.context) {
          vscode.window.showErrorMessage('Extension context not available');
          return;
        }
        const category = item?.category || 'General';
        await PromptEditorPanel.showForNewPrompt(
          this.context,
          '',
          this.promptService,
          this.treeProvider,
          category
        );
      }
    );

    // Insert prompt from tree (when prompt is selected)
    const insertFromTreeCommand = vscode.commands.registerCommand(
      'promptBank.insertPromptFromTree',
      (item: PromptTreeItem | Prompt) => {
        // Type guard: detect if this is from tree view (PromptTreeItem) or direct usage (Prompt)
        const prompt = 'prompt' in item ? item.prompt : item;

        if (!prompt || !prompt.content || !prompt.metadata) {
          vscode.window.showErrorMessage('No prompt selected or invalid item.');
          return;
        }
        this.insertPromptFromTree(prompt);
      }
    );

    // View version history (when prompt is selected)
    const viewVersionHistoryCommand = vscode.commands.registerCommand(
      'promptBank.viewVersionHistory',
      (item: PromptTreeItem | Prompt) => {
        // Type guard: detect if this is from tree view (PromptTreeItem) or direct usage (Prompt)
        const prompt = 'prompt' in item ? item.prompt : item;

        if (!prompt || !prompt.id) {
          vscode.window.showErrorMessage('No prompt selected or invalid item.');
          return;
        }
        this.viewVersionHistory(prompt);
      }
    );

    context.subscriptions.push(
      refreshCommand,
      newPromptInCategoryCommand,
      insertFromTreeCommand,
      viewVersionHistoryCommand
    );
  }

  /**
   * Insert a prompt from tree view at current cursor position
   */
  private async insertPromptFromTree(prompt: Prompt): Promise<void> {
    await this.promptService.insertPromptById(prompt);
    this.treeProvider.refresh();
  }

  /**
   * View version history for a prompt and allow restoration
   */
  async viewVersionHistory(prompt: Prompt): Promise<void> {
    try {
      // Check if versioning is enabled
      const config = vscode.workspace.getConfiguration('promptBank.versioning');
      const enabled = config.get<boolean>('enabled', true);

      if (!enabled) {
        vscode.window
          .showInformationMessage(
            'Versioning is disabled. Enable it in settings to track history.',
            'Open Settings'
          )
          .then((selection) => {
            if (selection === 'Open Settings') {
              vscode.commands.executeCommand(
                'workbench.action.openSettings',
                'promptBank.versioning'
              );
            }
          });
        return;
      }

      // Get version history
      const versions = await this.promptService.getVersionHistory(prompt.id);

      if (versions.length === 0) {
        vscode.window.showInformationMessage(
          'No version history available yet. Edit this prompt to create versions.'
        );
        return;
      }

      // Get current version for marking
      const currentVersion = getCurrentVersion(prompt);

      // Create QuickPick items
      interface VersionQuickPickItem extends vscode.QuickPickItem {
        versionId: string;
      }

      const items: VersionQuickPickItem[] = versions.map((v) => {
        const versionNum = getVersionNumber(prompt, v.versionId);
        const isCurrent = currentVersion?.versionId === v.versionId;
        const deviceName =
          v.deviceName.length > 30 ? v.deviceName.substring(0, 27) + '...' : v.deviceName;

        const item: VersionQuickPickItem = {
          label: `v${versionNum} - ${new Date(v.timestamp).toLocaleString()} (${deviceName})${isCurrent ? ' [Current]' : ''}`,
          description: v.title || v.content?.substring(0, 50) || '(No title)',
          versionId: v.versionId,
        };

        // Only add detail if changeReason exists (exactOptionalPropertyTypes compliance)
        if (v.changeReason) {
          item.detail = v.changeReason;
        }

        return item;
      });

      // Show QuickPick
      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select a version to restore',
        matchOnDescription: true,
        matchOnDetail: true,
        ignoreFocusOut: true,
      });

      if (selected) {
        // Restore the selected version (includes confirmation dialog)
        await this.promptService.restoreVersion(prompt.id, selected.versionId);
        this.treeProvider.refresh();
      }
    } catch (error) {
      vscode.window.showErrorMessage(
        `Failed to load version history: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}
