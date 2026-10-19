import * as vscode from 'vscode';
import { Prompt, DEFAULT_CATEGORY } from '../models/prompt';
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
        const category = item?.category || DEFAULT_CATEGORY;
        await PromptEditorPanel.showForNewPrompt(
          this.context,
          '',
          this.promptService,
          this.treeProvider,
          category
        );
      }
    );

    const newCategoryCommand = vscode.commands.registerCommand(
      'promptBank.newCategory',
      async () => {
        const name = await vscode.window.showInputBox({
          title: 'New Prompt Category',
          prompt: 'Enter a name for the new category',
          placeHolder: 'e.g. Code Review',
          validateInput: (value) => {
            const trimmed = value.trim();
            if (!trimmed) return 'Category name cannot be empty';
            if (trimmed.includes('/') || trimmed.includes('\\')) {
              return 'Category name cannot contain / or \\ characters';
            }
            return null;
          },
        });
        if (name === undefined) return;
        try {
          await this.promptService.createCategory(name);
          this.treeProvider.refresh();
        } catch (error) {
          vscode.window.showErrorMessage(
            error instanceof Error ? error.message : 'Failed to create category'
          );
        }
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

    context.subscriptions.push(
      refreshCommand,
      newPromptInCategoryCommand,
      newCategoryCommand,
      insertFromTreeCommand
    );
  }

  /**
   * Insert a prompt from tree view at current cursor position
   */
  private async insertPromptFromTree(prompt: Prompt): Promise<void> {
    await this.promptService.insertPromptById(prompt);
    this.treeProvider.refresh();
  }
}
