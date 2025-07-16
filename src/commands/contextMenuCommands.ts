import * as vscode from 'vscode';
import { Prompt } from '../models/prompt';
import { PromptService } from '../services/promptService';
import { PromptTreeProvider } from '../views/promptTreeProvider';
import { CategoryTreeItem, PromptTreeItem } from '../views/promptTreeItem';
import { PromptEditorPanel } from '../webview/PromptEditorPanel';
import { AuthService } from '../services/authService';
import { createShare, createShareMulti } from '../services/shareService';

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

    const duplicatePromptCommand = vscode.commands.registerCommand(
      'promptBank.duplicatePromptFromTree',
      (item: PromptTreeItem) => this.duplicatePrompt(item)
    );

    const deletePromptCommand = vscode.commands.registerCommand(
      'promptBank.deletePromptFromTree',
      (item: PromptTreeItem) => this.deletePrompt(item)
    );

    const sharePromptCommand = vscode.commands.registerCommand(
      'promptBank.sharePromptFromTree',
      (item: PromptTreeItem) => this.sharePrompt(item)
    );

    const renameCategoryCommand = vscode.commands.registerCommand(
      'promptBank.renameCategory',
      (item: CategoryTreeItem) => this.renameCategory(item)
    );

    const deleteCategoryCommand = vscode.commands.registerCommand(
      'promptBank.deleteCategory',
      (item: CategoryTreeItem) => this.deleteCategory(item)
    );

    const shareCollectionCommand = vscode.commands.registerCommand(
      'promptBank.shareCollectionFromTree',
      (item: CategoryTreeItem) => this.shareCollection(item)
    );

    context.subscriptions.push(
      editPromptCommand,
      copyContentCommand,
      duplicatePromptCommand,
      deletePromptCommand,
      renameCategoryCommand,
      deleteCategoryCommand,
      sharePromptCommand,
      shareCollectionCommand
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
   * Duplicate a prompt
   */
  private async duplicatePrompt(item: PromptTreeItem): Promise<void> {
    const prompt = item.prompt;

    try {
      const duplicate = await this.promptService.duplicatePrompt(prompt);
      this.treeProvider.refresh();
      vscode.window.showInformationMessage(`Duplicated prompt as "${duplicate.title}"`);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to duplicate prompt: ${error}`);
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
   * Share a single prompt and copy link to clipboard
   */
  private async sharePrompt(item: PromptTreeItem): Promise<void> {
    const prompt = item.prompt;

    try {
      // Ensure user signed in
      const accessToken = await AuthService.get().getValidAccessToken();
      if (!accessToken) {
        vscode.window.showErrorMessage('You must be signed in with GitHub to share prompts.');
        return;
      }

      const result = await createShare(prompt, accessToken);
      await vscode.env.clipboard.writeText(result.url);
      vscode.window.showInformationMessage('Share link copied to clipboard! Expires in 24h.');
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to share prompt: ${error}`);
    }
  }

  /**
   * Share an entire collection of prompts from the context menu
   */
  private async shareCollection(item: CategoryTreeItem): Promise<void> {
    const categoryName = item.category;
    try {
      // Call the centralized promptService method with the specific category
      await this.promptService.shareCollection(categoryName);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to share collection: ${error}`);
    }
  }

  /**
   * Rename a category using the improved tree provider method
   */
  private async renameCategory(item: CategoryTreeItem): Promise<void> {
    // Delegate to the tree provider's improved rename method
    await this.treeProvider.showRenameCategoryInput(item.category);
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