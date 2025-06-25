import * as vscode from 'vscode';
import { promptService } from '../services/promptService';

/**
 * Register all Prompt Bank commands
 */
export function registerCommands(context: vscode.ExtensionContext): void {
  // Register save prompt command
  const savePromptCommand = vscode.commands.registerCommand(
    'promptBank.savePrompt',
    async () => {
      try {
        await promptService.savePromptFromSelection();
      } catch (error) {
        vscode.window.showErrorMessage(`Error saving prompt: ${error}`);
      }
    }
  );

  // Register insert prompt command
  const insertPromptCommand = vscode.commands.registerCommand(
    'promptBank.insertPrompt',
    async () => {
      try {
        await promptService.insertPrompt();
      } catch (error) {
        vscode.window.showErrorMessage(`Error inserting prompt: ${error}`);
      }
    }
  );

  // Register list prompts command
  const listPromptsCommand = vscode.commands.registerCommand(
    'promptBank.listPrompts',
    async () => {
      try {
        const prompts = await promptService.listPrompts({
          sortBy: 'modified',
          sortOrder: 'desc'
        });

        if (prompts.length === 0) {
          vscode.window.showInformationMessage('No prompts saved yet');
          return;
        }

        // Show prompts in a quick pick for preview
        const items = prompts.map(prompt => ({
          label: prompt.title,
          description: `${prompt.category} • ${prompt.metadata.usageCount} uses`,
          detail: `${prompt.description || prompt.content.substring(0, 150)}...`,
          prompt
        }));

        const selected = await vscode.window.showQuickPick(items, {
          placeHolder: `${prompts.length} prompts available`,
          matchOnDescription: true,
          matchOnDetail: true,
          ignoreFocusOut: true
        });

        if (selected) {
          // Show prompt details in a information message
          const details = [
            `Title: ${selected.prompt.title}`,
            `Category: ${selected.prompt.category}`,
            `Created: ${selected.prompt.metadata.created.toLocaleDateString()}`,
            `Used: ${selected.prompt.metadata.usageCount} times`,
            selected.prompt.description ? `Description: ${selected.prompt.description}` : '',
            `Content preview: ${selected.prompt.content.substring(0, 200)}...`
          ].filter(Boolean).join('\n');

          vscode.window.showInformationMessage(details, { modal: true });
        }
      } catch (error) {
        vscode.window.showErrorMessage(`Error listing prompts: ${error}`);
      }
    }
  );

  // Register delete prompt command
  const deletePromptCommand = vscode.commands.registerCommand(
    'promptBank.deletePrompt',
    async () => {
      try {
        await promptService.deletePrompt();
      } catch (error) {
        vscode.window.showErrorMessage(`Error deleting prompt: ${error}`);
      }
    }
  );

  // Register show stats command (useful for debugging)
  const showStatsCommand = vscode.commands.registerCommand(
    'promptBank.showStats',
    async () => {
      try {
        const stats = await promptService.getStats();
        
        const statsMessage = [
          `📊 Prompt Bank Statistics`,
          `Total Prompts: ${stats.totalPrompts}`,
          `Categories: ${stats.categoriesCount}`,
          `Storage Size: ${(stats.totalSize / 1024).toFixed(1)} KB`,
          `Health: ${stats.health}`,
          stats.mostUsed.length > 0 ? `Most Used: ${stats.mostUsed[0].title} (${stats.mostUsed[0].usageCount} times)` : ''
        ].filter(Boolean).join('\n');

        vscode.window.showInformationMessage(statsMessage, { modal: true });
      } catch (error) {
        vscode.window.showErrorMessage(`Error getting stats: ${error}`);
      }
    }
  );

  // Add all commands to context subscriptions
  context.subscriptions.push(
    savePromptCommand,
    insertPromptCommand,
    listPromptsCommand,
    deletePromptCommand,
    showStatsCommand
  );
} 