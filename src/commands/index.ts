import * as vscode from 'vscode';
import { promptService } from '../services/promptService';
import { PromptTreeProvider } from '../views/promptTreeProvider';
import { PromptEditorPanel } from '../webview/PromptEditorPanel';
import { parseShareUrl, fetchShare } from '../services/shareService';
import type { AuthService } from '../services/authService';

/**
 * Register all Prompt Bank commands
 */
export function registerCommands(
  context: vscode.ExtensionContext,
  treeProvider: PromptTreeProvider,
  authService?: AuthService
): void {
  // Register save prompt command
  const savePromptCommand = vscode.commands.registerCommand('promptBank.savePrompt', async () => {
    try {
      await promptService.savePrompt();
    } catch (error) {
      vscode.window.showErrorMessage(`Error saving prompt: ${error}`);
    }
  });

  // Register save prompt from selection command (context menu)
  const savePromptFromSelectionCommand = vscode.commands.registerCommand(
    'promptBank.savePromptFromSelection',
    async () => {
      try {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
          vscode.window.showErrorMessage('No active editor found');
          return;
        }

        // Handle multiple selections - take the first one
        const selection = editor.selection;
        const selectedText = editor.document.getText(selection);

        if (!selectedText.trim()) {
          vscode.window.showErrorMessage('No text selected');
          return;
        }

        // Warn if there are multiple selections
        if (editor.selections.length > 1) {
          vscode.window.showInformationMessage(
            'Multiple selections detected. Using the first selection.'
          );
        }

        // Open the prompt editor panel with the selected text as initial content
        await PromptEditorPanel.showForNewPrompt(
          context,
          selectedText,
          promptService,
          treeProvider
        );
      } catch (error) {
        vscode.window.showErrorMessage(`Error saving prompt from selection: ${error}`);
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
  const listPromptsCommand = vscode.commands.registerCommand('promptBank.listPrompts', async () => {
    try {
      const prompts = await promptService.listPrompts({
        sortBy: 'modified',
        sortOrder: 'desc',
      });

      if (prompts.length === 0) {
        vscode.window.showInformationMessage('No prompts saved yet');
        return;
      }

      // Step 1: choose prompt
      const promptItems = prompts.map((prompt) => ({
        label: prompt.title,
        description: `${prompt.category} • ${prompt.metadata.usageCount} uses`,
        detail: `${prompt.description || prompt.content?.substring(0, 150) || 'No content'}...`,
        prompt,
      }));

      const selectedPromptItem = await vscode.window.showQuickPick(promptItems, {
        placeHolder: `${prompts.length} prompts available`,
        matchOnDescription: true,
        matchOnDetail: true,
        ignoreFocusOut: true,
      });

      if (!selectedPromptItem) {
        return;
      }

      const prompt = selectedPromptItem.prompt;

      // Step 2: choose action
      const actionItems: { label: string; action: 'view' | 'insert' | 'edit' | 'delete' }[] = [
        { label: 'View', action: 'view' },
        { label: 'Copy', action: 'insert' },
        { label: 'Edit', action: 'edit' },
        { label: 'Delete', action: 'delete' },
      ];

      const selectedAction = await vscode.window.showQuickPick(
        actionItems.map((i) => i.label),
        {
          placeHolder: `Choose action for "${prompt.title}"`,
          ignoreFocusOut: true,
        }
      );

      if (!selectedAction) {
        return;
      }

      const action = actionItems.find((a) => a.label === selectedAction)?.action;

      switch (action) {
        case 'view': {
          const details = [
            `Title: ${prompt.title}`,
            `Category: ${prompt.category}`,
            `Created: ${prompt.metadata.created.toLocaleDateString()}`,
            `Used: ${prompt.metadata.usageCount} times`,
            prompt.description ? `Description: ${prompt.description}` : '',
            `Content preview: ${prompt.content?.substring(0, 200) || 'No content'}...`,
          ]
            .filter(Boolean)
            .join('\n');
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
  });

  // Register show stats command (useful for debugging)
  const showStatsCommand = vscode.commands.registerCommand('promptBank.showStats', async () => {
    try {
      const stats = await promptService.getStats();

      const statsMessage = [
        `📊 Prompt Bank Statistics`,
        `Total Prompts: ${stats.totalPrompts}`,
        `Categories: ${stats.categoriesCount}`,
        `Storage Size: ${(stats.totalSize / 1024).toFixed(1)} KB`,
        `Health: ${stats.health}`,
        stats.mostUsed.length > 0
          ? `Most Used: ${stats.mostUsed[0].title} (${stats.mostUsed[0].usageCount} times)`
          : '',
      ]
        .filter(Boolean)
        .join('\n');

      vscode.window.showInformationMessage(statsMessage, { modal: true });
    } catch (error) {
      vscode.window.showErrorMessage(`Error getting stats: ${error}`);
    }
  });

  // Register import prompt command
  const importPromptCommand = vscode.commands.registerCommand(
    'promptBank.importPrompt',
    async () => {
      try {
        const url = await vscode.window.showInputBox({
          prompt: 'Paste a Prompt Bank share link',
          placeHolder: 'https://www.prompt-bank.io/share/<id>',
          ignoreFocusOut: true,
        });
        if (!url) return;

        const parsed = parseShareUrl(url);
        if (!parsed) {
          vscode.window.showErrorMessage('Invalid Prompt Bank share link');
          return;
        }

        const sharedData = await fetchShare(parsed.id);

        if (Array.isArray(sharedData)) {
          // It's a collection of prompts
          const totalPrompts = sharedData.length;
          const uniqueCategories = new Set(sharedData.map((p) => p.category)).size;

          const confirmationMessage = `You are about to import ${uniqueCategories} categories with a total of ${totalPrompts} prompts. Do you want to proceed?`;
          const confirmation = await vscode.window.showInformationMessage(
            confirmationMessage,
            { modal: true },
            'Import'
          );

          if (confirmation !== 'Import') {
            vscode.window.showInformationMessage('Collection import cancelled.');
            return;
          }

          const importedCategoryNames = await promptService.importCollection(sharedData);
          treeProvider.refresh();
          vscode.window.showInformationMessage(
            `Imported collection(s): "${importedCategoryNames.join(', ')}"`
          );
        } else {
          // It's a single prompt
          const saved = await promptService.importPrompt(sharedData);
          treeProvider.refresh();
          vscode.window.showInformationMessage(`Imported prompt "${saved.title}"`);
        }
      } catch (err) {
        vscode.window.showErrorMessage(`Failed to import: ${err}`);
      }
    }
  );

  // Register share collection command
  const shareCollectionCommand = vscode.commands.registerCommand(
    'promptBank.shareCollection',
    async () => {
      try {
        if (!authService) {
          vscode.window.showErrorMessage(
            'Authentication service not available. Please reload the extension.'
          );
          return;
        }
        await promptService.shareCollection(undefined, authService);
      } catch (error) {
        vscode.window.showErrorMessage(`Error sharing collection: ${error}`);
      }
    }
  );

  // Register new prompt command (tree view "+" button)
  const newPromptCommand = vscode.commands.registerCommand('promptBank.newPrompt', async () => {
    try {
      await PromptEditorPanel.showForNewPrompt(context, '', promptService, treeProvider);
    } catch (error) {
      vscode.window.showErrorMessage(`Error creating new prompt: ${error}`);
    }
  });

  // Add all commands to context subscriptions
  context.subscriptions.push(
    savePromptCommand,
    savePromptFromSelectionCommand,
    insertPromptCommand,
    listPromptsCommand,
    showStatsCommand,
    importPromptCommand,
    shareCollectionCommand,
    newPromptCommand
  );
}
