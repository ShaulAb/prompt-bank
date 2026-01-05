import * as vscode from 'vscode';
import { Prompt } from '../models/prompt';
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

    context.subscriptions.push(refreshCommand, newPromptInCategoryCommand, insertFromTreeCommand);
  }

  /**
   * Insert a prompt from tree view at current cursor position
   */
  private async insertPromptFromTree(prompt: Prompt): Promise<void> {
    await this.promptService.insertPromptById(prompt);
    this.treeProvider.refresh();
  }
}
