import * as vscode from 'vscode';
import { registerCommands } from './commands';
import { promptService } from './services/promptService';
import { PromptTreeProvider, PromptDragAndDropController } from './views/promptTreeProvider';
import { TreeCommands } from './commands/treeCommands';
import { ContextMenuCommands } from './commands/contextMenuCommands';
import { registerSyncCommands } from './commands/syncCommands';
import { SupabaseClientManager } from './services/supabaseClient';
import { WebViewCache } from './webview/WebViewCache';
import { ServicesContainer, WorkspaceServices } from './services/servicesContainer';

// Global services container instance
// Manages services per workspace with proper lifecycle
let servicesContainer: ServicesContainer | undefined;

/**
 * Extension activation function
 * Called when the extension is first activated
 */
export async function activate(context: vscode.ExtensionContext) {
  console.log('Prompt Bank extension is activating...');

  try {
    // Create services container
    servicesContainer = new ServicesContainer();

    // Initialize the prompt service (legacy singleton for TreeProvider - TODO: migrate in future)
    await promptService.initialize();

    // Get extension details for logging
    const extensionId = context.extension.id;
    console.log('[Extension] Activation details:', { extensionId });

    // Initialize Supabase client (shared singleton - required for all services)
    SupabaseClientManager.initialize();

    // Get workspace root and initialize workspace-scoped services
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    let workspaceServices: WorkspaceServices | undefined;

    if (workspaceRoot) {
      workspaceServices = await servicesContainer.getOrCreate(context, workspaceRoot);
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

    // Register context menu commands (with auth service from container)
    const contextMenuCommands = new ContextMenuCommands(
      promptService,
      treeProvider,
      workspaceServices?.auth!
    );
    contextMenuCommands.registerCommands(context);

    // Register all other commands (with optional auth service for share functionality)
    registerCommands(context, treeProvider, workspaceServices?.auth);

    // Register sync commands (if workspace available, pass services from container)
    if (workspaceRoot && workspaceServices) {
      const syncCommands = registerSyncCommands(context, promptService, workspaceServices.sync);
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
export async function deactivate() {
  // Dispose services container (cleans up all workspace services)
  if (servicesContainer) {
    await servicesContainer.disposeAll();
    servicesContainer = undefined;
  }

  // Clear WebView cache to free memory
  WebViewCache.clear();
  console.log('Prompt Bank extension deactivated');
}

/**
 * Get the services container instance
 *
 * @returns Services container, or undefined if not initialized
 */
export function getServicesContainer(): ServicesContainer | undefined {
  return servicesContainer;
}
