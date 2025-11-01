import * as vscode from 'vscode';
import { registerCommands } from './commands';
import { promptService } from './services/promptService';
import { PromptTreeProvider, PromptDragAndDropController } from './views/promptTreeProvider';
import { TreeCommands } from './commands/treeCommands';
import { ContextMenuCommands } from './commands/contextMenuCommands';
import { registerSyncCommands } from './commands/syncCommands';
import { AuthService } from './services/authService';
import { SyncService } from './services/syncService';
import { SupabaseClientManager } from './services/supabaseClient';
import { WebViewCache } from './webview/WebViewCache';

/**
 * Extension activation function
 * Called when the extension is first activated
 */
export async function activate(context: vscode.ExtensionContext) {
  console.log('Prompt Bank extension is activating...');

  try {
    // Initialize the prompt service
    await promptService.initialize();

    // Get extension details for auth URI construction
    const extensionId = context.extension.id;
    const publisher = extensionId.split('.')[0];
    const extensionName = extensionId.split('.')[1];

    console.log('[Extension] Activation details:', { extensionId, publisher, extensionName });

    // Initialize Supabase client (shared by Auth, Sync, and Share services)
    SupabaseClientManager.initialize();

    // Initialise authentication service
    AuthService.initialize(context, publisher, extensionName);

    // Initialize sync service (requires workspace root)
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
    if (workspaceRoot) {
      SyncService.initialize(context, workspaceRoot);
    }

    // Create and register tree view
    const treeProvider = new PromptTreeProvider(promptService);
    const dndController = new PromptDragAndDropController(treeProvider, promptService);
    const treeView = vscode.window.createTreeView('promptBank.promptsView', {
      treeDataProvider: treeProvider,
      dragAndDropController: dndController,
      showCollapseAll: true,
    });

    // Register tree commands
    const treeCommands = new TreeCommands(treeProvider, promptService);
    treeCommands.registerCommands(context);

    // Register context menu commands
    const contextMenuCommands = new ContextMenuCommands(promptService, treeProvider);
    contextMenuCommands.registerCommands(context);

    // Register all other commands
    registerCommands(context, treeProvider);

    // Register sync commands (if workspace available)
    if (workspaceRoot) {
      const syncCommands = registerSyncCommands(context, promptService);
      context.subscriptions.push(...syncCommands);
    }

    // Refresh tree when prompts change
    context.subscriptions.push(treeView);

    // Show activation message
    vscode.window.showInformationMessage('Prompt Bank is ready! 🚀');

    console.log('Prompt Bank extension activated successfully');
  } catch (error) {
    console.error('Failed to activate Prompt Bank extension:', error);
    vscode.window.showErrorMessage(`Failed to initialize Prompt Bank: ${error}`);
  }
}

/**
 * Extension deactivation function
 * Called when the extension is deactivated
 */
export function deactivate() {
  // Clear WebView cache to free memory
  WebViewCache.clear();
  console.log('Prompt Bank extension deactivated');
}
