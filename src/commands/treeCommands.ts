import * as vscode from 'vscode';
import { Prompt } from '../models/prompt';
import { PromptTreeProvider } from '../views/promptTreeProvider';

/**
 * Tree-specific commands for the Prompt Bank tree view
 */
export class TreeCommands {
  constructor(
    private treeProvider: PromptTreeProvider
  ) {}

  /**
   * Register all tree commands
   */
  registerCommands(context: vscode.ExtensionContext): void {
    // Refresh tree view
    const refreshCommand = vscode.commands.registerCommand('promptBank.refreshTree', () => {
      this.treeProvider.refresh();
      vscode.window.showInformationMessage('Prompt Bank tree refreshed');
    });

    // Insert prompt from tree (when prompt is clicked)
    const insertFromTreeCommand = vscode.commands.registerCommand(
      'promptBank.insertPromptFromTree',
      (prompt: Prompt) => this.insertPromptFromTree(prompt)
    );

    context.subscriptions.push(refreshCommand, insertFromTreeCommand);
  }

  /**
   * Insert a prompt from tree view at current cursor position
   */
  private async insertPromptFromTree(prompt: Prompt): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage('No active editor found');
      return;
    }

    try {
      // TODO: Phase 3 - Handle template variables
      const contentToInsert = prompt.content;

      // Insert at current cursor position
      await editor.edit((editBuilder: vscode.TextEditorEdit) => {
        editBuilder.insert(editor.selection.active, contentToInsert);
      });

      // Update usage statistics
      prompt.metadata.usageCount++;
      prompt.metadata.lastUsed = new Date();
      
      // Note: We'll need to update the prompt in storage
      // For now, we'll refresh the tree to show updated usage count
      this.treeProvider.refresh();

      vscode.window.showInformationMessage(`Inserted: "${prompt.title}"`);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to insert prompt: ${error}`);
    }
  }
} 