import * as vscode from 'vscode';
import { Prompt } from '../models/prompt';
import { PromptService } from '../services/promptService';
import { PromptTreeProvider } from '../views/promptTreeProvider';
import { CategoryTreeItem, PromptTreeItem } from '../views/promptTreeItem';

/**
 * Context menu commands for tree view items
 */
export class ContextMenuCommands {
  constructor(
    private promptService: PromptService,
    private treeProvider: PromptTreeProvider
  ) {}

  /**
   * Register all context menu commands
   */
  registerCommands(context: vscode.ExtensionContext): void {
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

    context.subscriptions.push(
      editPromptCommand,
      copyContentCommand,
      deletePromptCommand,
      renameCategoryCommand
    );
  }

  /**
   * Edit a prompt inline
   */
  private async editPrompt(item: PromptTreeItem): Promise<void> {
    const prompt = item.prompt;

    try {
      // Edit title
      const newTitle = await vscode.window.showInputBox({
        prompt: 'Edit prompt title',
        value: prompt.title,
        validateInput: (value) => {
          if (!value.trim()) {
            return 'Title is required';
          }
          if (value.length > 100) {
            return 'Title must be less than 100 characters';
          }
          return null;
        }
      });

      if (newTitle === undefined) {
        return; // User cancelled
      }

      // Edit description
      const newDescription = await vscode.window.showInputBox({
        prompt: 'Edit prompt description (optional)',
        value: prompt.description || '',
        placeHolder: 'Describe what this prompt is used for...'
      });

      if (newDescription === undefined) {
        return; // User cancelled
      }

      // Edit content
      const newContent = await vscode.window.showInputBox({
        prompt: 'Edit prompt content',
        value: prompt.content,
        validateInput: (value) => {
          if (!value.trim()) {
            return 'Content is required';
          }
          return null;
        }
      });

      if (newContent === undefined) {
        return; // User cancelled
      }

      // Update the prompt
      const trimmedDescription = newDescription.trim();
      const updatedPrompt: Prompt = {
        ...prompt,
        title: newTitle.trim(),
        content: newContent.trim(),
        metadata: {
          ...prompt.metadata,
          modified: new Date()
        },
        ...(trimmedDescription !== '' && { description: trimmedDescription })
      };

      // Save changes using the storage update method
      await this.promptService.updatePromptById(updatedPrompt);

      // Refresh the tree
      this.treeProvider.refresh();

      vscode.window.showInformationMessage(`Updated prompt: "${updatedPrompt.title}"`);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to edit prompt: ${error}`);
    }
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
      // Get all prompts in this category
      const prompts = await this.promptService.listPrompts({ category: oldCategoryName });
      
      if (prompts.length === 0) {
        vscode.window.showWarningMessage(`No prompts found in category "${oldCategoryName}"`);
        return;
      }

             // Update all prompts in this category
       const updatePromises = prompts.map(async (prompt) => {
         const updatedPrompt: Prompt = {
           ...prompt,
           category: newCategoryName.trim(),
           metadata: {
             ...prompt.metadata,
             modified: new Date()
           }
         };
         return this.promptService.updatePromptById(updatedPrompt);
       });

      await Promise.all(updatePromises);

      // Refresh the tree
      this.treeProvider.refresh();

      vscode.window.showInformationMessage(
        `Renamed category "${oldCategoryName}" to "${newCategoryName}" (${prompts.length} prompts updated)`
      );
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to rename category: ${error}`);
    }
  }
} 