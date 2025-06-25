import * as vscode from 'vscode';
import { PromptService } from '../services/promptService';
import { Prompt } from '../models/prompt';

/**
 * Search commands for finding prompts quickly
 */
export class SearchCommands {
  constructor(private promptService: PromptService) {}

  /**
   * Register all search commands
   */
  registerCommands(context: vscode.ExtensionContext): void {
    const searchCommand = vscode.commands.registerCommand(
      'promptBank.searchPrompts',
      () => this.searchPrompts()
    );

    context.subscriptions.push(searchCommand);
  }

  /**
   * Smart search for prompts across all categories
   */
  private async searchPrompts(): Promise<void> {
    try {
      // Get search term from user
      const searchTerm = await vscode.window.showInputBox({
        prompt: 'Search prompts by title, description, content, or category',
        placeHolder: 'Type your search term...',
        validateInput: (value) => {
          if (!value.trim()) {
            return 'Please enter a search term';
          }
          if (value.length < 2) {
            return 'Search term must be at least 2 characters';
          }
          return null;
        }
      });

      if (!searchTerm) {
        return; // User cancelled
      }

      // Get all prompts and filter them
      const allPrompts = await this.promptService.listPrompts();
      const filteredPrompts = this.filterPrompts(allPrompts, searchTerm.trim());

      if (filteredPrompts.length === 0) {
        vscode.window.showInformationMessage(`No prompts found matching "${searchTerm}"`);
        return;
      }

      // Show results in quick pick
      await this.showSearchResults(filteredPrompts, searchTerm);

    } catch (error) {
      vscode.window.showErrorMessage(`Search failed: ${error}`);
    }
  }

  /**
   * Filter prompts based on search term
   */
  private filterPrompts(prompts: Prompt[], searchTerm: string): Prompt[] {
    const lowerSearchTerm = searchTerm.toLowerCase();

    return prompts.filter(prompt => {
      // Search in title
      if (prompt.title.toLowerCase().includes(lowerSearchTerm)) {
        return true;
      }

      // Search in description
      if (prompt.description?.toLowerCase().includes(lowerSearchTerm)) {
        return true;
      }

      // Search in content
      if (prompt.content.toLowerCase().includes(lowerSearchTerm)) {
        return true;
      }

      // Search in category
      if (prompt.category.toLowerCase().includes(lowerSearchTerm)) {
        return true;
      }

      return false;
    });
  }

  /**
   * Show search results in a quick pick and handle selection
   */
  private async showSearchResults(prompts: Prompt[], searchTerm: string): Promise<void> {
    const items = prompts.map(prompt => ({
      label: prompt.title,
      description: `${prompt.category} • Used ${prompt.metadata.usageCount}x`,
      detail: this.getPromptPreview(prompt, searchTerm),
      prompt
    }));

    // Sort by usage count (most used first), then by title
    items.sort((a, b) => {
      if (b.prompt.metadata.usageCount !== a.prompt.metadata.usageCount) {
        return b.prompt.metadata.usageCount - a.prompt.metadata.usageCount;
      }
      return a.prompt.title.localeCompare(b.prompt.title);
    });

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: `${prompts.length} prompt(s) found for "${searchTerm}" - select one to insert`,
      matchOnDescription: true,
      matchOnDetail: true
    });

    if (!selected) {
      return; // User cancelled
    }

    // Insert the selected prompt
    await this.insertPrompt(selected.prompt);
  }

  /**
   * Get a preview of the prompt with search term highlighted context
   */
  private getPromptPreview(prompt: Prompt, searchTerm: string): string {
    const lowerSearchTerm = searchTerm.toLowerCase();
    
    // Try to find context around the search term in content
    const content = prompt.content;
    const lowerContent = content.toLowerCase();
    const index = lowerContent.indexOf(lowerSearchTerm);
    
    if (index !== -1) {
      // Show context around the match
      const start = Math.max(0, index - 30);
      const end = Math.min(content.length, index + searchTerm.length + 30);
      const preview = content.substring(start, end);
      return `...${preview}...`;
    }

    // If not found in content, show description or first part of content
    if (prompt.description) {
      return prompt.description;
    }

    // Fallback to first 100 characters of content
    return content.length > 100 
      ? content.substring(0, 100) + '...'
      : content;
  }

  /**
   * Insert a prompt at the current cursor position
   */
  private async insertPrompt(prompt: Prompt): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage('No active editor found');
      return;
    }

    try {
      // Insert content at cursor
      await editor.edit((editBuilder: vscode.TextEditorEdit) => {
        editBuilder.insert(editor.selection.active, prompt.content);
      });

      // Update usage statistics
      prompt.metadata.usageCount++;
      prompt.metadata.lastUsed = new Date();
      
      // TODO: Update prompt in storage (for now we skip this step)
      
      vscode.window.showInformationMessage(`Inserted: "${prompt.title}"`);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to insert prompt: ${error}`);
    }
  }
} 