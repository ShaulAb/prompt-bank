import * as vscode from 'vscode';
import { Prompt } from '../models/prompt';
import { PromptTreeProvider } from '../views/promptTreeProvider';
import { PromptService } from '../services/promptService';

/**
 * Tree-specific commands for the Prompt Bank tree view
 */
export class TreeCommands {
  constructor(
    private treeProvider: PromptTreeProvider,
    private promptService: PromptService
  ) {}

  /**
   * Register all tree commands
   */
  registerCommands(context: vscode.ExtensionContext): void {
    // Refresh tree view
    const refreshCommand = vscode.commands.registerCommand('promptBank.refreshTreeView', () => {
      this.treeProvider.refresh();
      vscode.window.showInformationMessage('Prompt Bank tree refreshed');
    });

    // Insert prompt from tree (when prompt is selected)
    const insertFromTreeCommand = vscode.commands.registerCommand(
      'promptBank.insertPromptFromTree',
      (item: any) => {
        let prompt;
        if (item && item.prompt) {
          prompt = item.prompt;
        } else if (item && item.content && item.metadata) {
          prompt = item;
        } else {
          vscode.window.showErrorMessage('No prompt selected or invalid item.');
          return;
        }
        this.insertPromptFromTree(prompt);
      }
    );

    context.subscriptions.push(refreshCommand, insertFromTreeCommand);
  }

  /**
   * Insert a prompt from tree view at current cursor position
   */
  private async insertPromptFromTree(prompt: Prompt): Promise<void> {
    await this.promptService.insertPromptById(prompt);
    this.treeProvider.refresh();
  }
} 