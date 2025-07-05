import * as vscode from 'vscode';
import { Prompt } from '../models/prompt';
import { PromptService } from '../services/promptService';
import { PromptTreeProvider } from '../views/promptTreeProvider';
import { CategoryTreeItem, PromptTreeItem } from '../views/promptTreeItem';
import { PromptEditorPanel } from '../webview/PromptEditorPanel';

/**
 * Context menu commands for tree view items
 */
export class ContextMenuCommands {
  private extensionContext: vscode.ExtensionContext | undefined;
  constructor(
    private promptService: PromptService,
    private treeProvider: PromptTreeProvider
  ) {}

  /**
   * Register all context menu commands
   */
  registerCommands(context: vscode.ExtensionContext): void {
    this.extensionContext = context;
    const editPromptCommand = vscode.commands.registerCommand(
      'promptBank.editPromptFromTree',
      (item: PromptTreeItem) => this.editPrompt(item)
    );

    const copyContentCommand = vscode.commands.registerCommand(
      'promptBank.copyPromptContent',
      (item: PromptTreeItem) => this.copyPromptContent(item)
    );

    const deletePromptCommand = vscode.commands.registerCommand(
      'promptBank.deletePromptFromTree',
      (item: PromptTreeItem) => this.deletePrompt(item)
    );

    const renameCategoryCommand = vscode.commands.registerCommand(
      'promptBank.renameCategory',
      (item: CategoryTreeItem) => this.renameCategory(item)
    );

    const deleteCategoryCommand = vscode.commands.registerCommand(
      'promptBank.deleteCategory',
      (item: CategoryTreeItem) => this.deleteCategory(item)
    );

    context.subscriptions.push(
      editPromptCommand,
      copyContentCommand,
      deletePromptCommand,
      renameCategoryCommand,
      deleteCategoryCommand
    );
  }

  /**
   * Edit a prompt inline
   */
  private async editPrompt(item: PromptTreeItem): Promise<void> {
    const prompt = item.prompt;
    if (!this.extensionContext) {
      vscode.window.showErrorMessage('Extension context not available.');
      return;
        }
    // Open the webview editor panel with the prompt data and categories
    await PromptEditorPanel.show(
      this.extensionContext,
      prompt,
      this.promptService,
      this.treeProvider
    );
  }

  /**
   * Copy prompt content to clipboard
   */
  private async copyPromptContent(item: PromptTreeItem): Promise<void> {
    try {
      await vscode.env.clipboard.writeText(item.prompt.content);
      vscode.window.showInformationMessage(`Copied "${item.prompt.title}" to clipboard`);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to copy content: ${error}`);
    }
  }

  /**
   * Delete a prompt with confirmation
   */
  private async deletePrompt(item: PromptTreeItem): Promise<void> {
    const prompt = item.prompt;

    // Confirm deletion
    const confirmation = await vscode.window.showWarningMessage(
      `Are you sure you want to delete "${prompt.title}"?`,
      { modal: true },
      'Delete'
    );

    if (confirmation !== 'Delete') {
      return;
    }

    try {
      // Delete the prompt
      const success = await this.promptService.deletePromptById(prompt.id);
      
      if (success) {
        // Refresh the tree
        this.treeProvider.refresh();
        vscode.window.showInformationMessage(`Deleted prompt: "${prompt.title}"`);
      } else {
        vscode.window.showErrorMessage('Failed to delete prompt');
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Error deleting prompt: ${error}`);
    }
  }

  /**
   * Rename a category
   */
  private async renameCategory(item: CategoryTreeItem): Promise<void> {
    const oldCategoryName = item.category;

    // Get new category name
    const newCategoryName = await vscode.window.showInputBox({
      prompt: 'Rename category',
      value: oldCategoryName,
      validateInput: (value) => {
        if (!value.trim()) {
          return 'Category name is required';
        }
        if (value.length > 50) {
          return 'Category name must be less than 50 characters';
        }
        if (value.trim() === oldCategoryName) {
          return 'Please enter a different name';
        }
        return null;
      }
    });

    if (!newCategoryName) {
      return; // User cancelled
    }

    try {
      // Atomically rename entire category in the service
      const count = await this.promptService.renameCategory(oldCategoryName, newCategoryName.trim());
      if (count === 0) {
        vscode.window.showWarningMessage(`No prompts found in category "${oldCategoryName}"`);
      } else {
        this.treeProvider.refresh();
        vscode.window.showInformationMessage(
          `Renamed category "${oldCategoryName}" to "${newCategoryName}" (${count} prompts updated)`
        );
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to rename category: ${error}`);
    }
  }

  /**
   * Delete a category and all its prompts
   */
  private async deleteCategory(item: CategoryTreeItem): Promise<void> {
    const category = item.category;
    
    try {
      // Check if category has prompts
      const promptsInCategory = await this.promptService.listPrompts({ category });
      
      let confirmationMessage = `Are you sure you want to delete the category "${category}"?`;
      
      if (promptsInCategory.length > 0) {
        confirmationMessage = `Are you sure you want to delete the category "${category}" and all ${promptsInCategory.length} prompts in it? This cannot be undone.`;
      }
      
      // Confirm deletion
      const confirmation = await vscode.window.showWarningMessage(
        confirmationMessage,
        { modal: true },
        'Delete'
      );
      
      if (confirmation !== 'Delete') {
        return;
      }
      
      // Delete all prompts in this category
      if (promptsInCategory.length > 0) {
        const deletePromises = promptsInCategory.map(prompt => 
          this.promptService.deletePromptById(prompt.id)
        );
        
        await Promise.all(deletePromises);
      }
      
      // Refresh the tree view
      this.treeProvider.refresh();
      
      if (promptsInCategory.length > 0) {
        vscode.window.showInformationMessage(
          `Deleted category "${category}" and ${promptsInCategory.length} prompts`
        );
      } else {
        vscode.window.showInformationMessage(`Deleted category: "${category}"`);
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Error deleting category: ${error}`);
    }
  }
} 