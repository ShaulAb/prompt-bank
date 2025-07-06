import * as vscode from 'vscode';
import { promptService } from '../services/promptService';
import { PromptTreeProvider } from '../views/promptTreeProvider';
import { PromptEditorPanel } from '../webview/PromptEditorPanel';

/**
 * Register all Prompt Bank commands
 */
export function registerCommands(
  context: vscode.ExtensionContext,
  treeProvider: PromptTreeProvider
): void {
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

        // Step 1: choose prompt
        const promptItems = prompts.map(prompt => ({
          label: prompt.title,
          description: `${prompt.category} • ${prompt.metadata.usageCount} uses`,
          detail: `${prompt.description || prompt.content.substring(0, 150)}...`,
          prompt
        }));

        const selectedPromptItem = await vscode.window.showQuickPick(promptItems, {
          placeHolder: `${prompts.length} prompts available`,
          matchOnDescription: true,
          matchOnDetail: true,
          ignoreFocusOut: true
        });

        if (!selectedPromptItem) {
          return;
        }

        const prompt = selectedPromptItem.prompt;

        // Step 2: choose action
        const actionItems: { label: string; action: 'view' | 'insert' | 'edit' | 'delete'; }[] = [
          { label: 'View', action: 'view' },
          { label: 'Insert', action: 'insert' },
          { label: 'Edit', action: 'edit' },
          { label: 'Delete', action: 'delete' }
        ];

        const selectedAction = await vscode.window.showQuickPick(actionItems.map(i => i.label), {
          placeHolder: `Choose action for "${prompt.title}"`,
          ignoreFocusOut: true
        });

        if (!selectedAction) {
          return;
        }

        const action = actionItems.find(a => a.label === selectedAction)?.action;

        switch (action) {
          case 'view': {
          const details = [
              `Title: ${prompt.title}`,
              `Category: ${prompt.category}`,
              `Created: ${prompt.metadata.created.toLocaleDateString()}`,
              `Used: ${prompt.metadata.usageCount} times`,
              prompt.description ? `Description: ${prompt.description}` : '',
              `Content preview: ${prompt.content.substring(0, 200)}...`
          ].filter(Boolean).join('\n');
          vscode.window.showInformationMessage(details, { modal: true });
            break;
          }
          case 'insert': {
            await promptService.insertPromptById(prompt);
            treeProvider.refresh();
            break;
          }
          case 'edit': {
            await PromptEditorPanel.show(context, prompt, promptService, treeProvider);
            break;
          }
          case 'delete': {
            const confirmation = await vscode.window.showWarningMessage(
              `Delete prompt "${prompt.title}"?`,
              { modal: true },
              'Delete'
            );
            if (confirmation === 'Delete') {
              const success = await promptService.deletePromptById(prompt.id);
              if (success) {
                treeProvider.refresh();
                vscode.window.showInformationMessage(`Deleted prompt: "${prompt.title}"`);
              } else {
                vscode.window.showErrorMessage('Failed to delete prompt');
              }
            }
            break;
          }
        }
      } catch (error) {
        vscode.window.showErrorMessage(`Error listing prompts: ${error}`);
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
    showStatsCommand
  );
} 