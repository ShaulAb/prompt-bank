import * as vscode from 'vscode';
import { registerCommands } from './commands';
import { promptService } from './services/promptService';
import { PromptTreeProvider, PromptDragAndDropController } from './views/promptTreeProvider';
import { TreeCommands } from './commands/treeCommands';
import { ContextMenuCommands } from './commands/contextMenuCommands';
import { registerSyncCommands } from './commands/syncCommands';
import { registerTeamCommands } from './commands/teamCommands';
import { SupabaseClientManager } from './services/supabaseClient';
import { WebViewCache } from './webview/WebViewCache';
import { ServicesContainer, WorkspaceServices } from './services/servicesContainer';
import { TeamTreeProvider } from './views/teamTreeProvider';

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

    // Register workspace-dependent commands only if workspace is available
    if (workspaceRoot && workspaceServices) {
      // Register context menu commands (requires auth service)
      const contextMenuCommands = new ContextMenuCommands(
        promptService,
        treeProvider,
        workspaceServices.auth
      );
      contextMenuCommands.registerCommands(context);

      // Register all other commands (with auth service for share functionality)
      registerCommands(context, treeProvider, workspaceServices.auth);

      // Register sync commands
      const syncCommands = registerSyncCommands(context, promptService, workspaceServices.sync);
      context.subscriptions.push(...syncCommands);
    } else {
      // Register commands without workspace-dependent features
      registerCommands(context, treeProvider);
      vscode.window.showWarningMessage(
        'Prompt Bank: No workspace folder detected. Some features (sync, sharing) will be unavailable.'
      );
    }

    // Refresh tree when prompts change
    context.subscriptions.push(treeView);

    // ── Team Mode (global, not workspace-scoped) ──
    // Initialize team services if user is authenticated
    if (workspaceServices) {
      const { teamService, teamSyncService } = await servicesContainer.initializeTeamServices(
        context,
        workspaceServices.auth
      );

      // Create team tree view
      const teamTreeProvider = new TeamTreeProvider(teamService);
      const teamTreeView = vscode.window.createTreeView('promptBank.teamPromptsView', {
        treeDataProvider: teamTreeProvider,
        showCollapseAll: true,
      });
      context.subscriptions.push(teamTreeView);

      // Register team commands
      const teamCmds = registerTeamCommands(
        context,
        teamService,
        teamSyncService,
        teamTreeProvider
      );
      context.subscriptions.push(...teamCmds);

      // Background: fetch teams and set context for view visibility
      teamService
        .refreshTeams()
        .then(async (teams) => {
          await vscode.commands.executeCommand(
            'setContext',
            'promptBank.hasTeams',
            teams.length > 0
          );

          // Auto-sync team prompts if user has teams
          if (teams.length > 0) {
            try {
              await teamSyncService.syncAllTeams();
              for (const team of teams) {
                const { storage } = await teamService.getTeamStorage(team.id);
                const prompts = await storage.list();
                teamTreeProvider.setTeamPrompts(team.id, prompts);
              }
            } catch (err) {
              console.warn('[Extension] Background team sync failed:', err);
            }
          }
        })
        .catch((err) => {
          console.warn('[Extension] Failed to fetch teams:', err);
          vscode.commands.executeCommand('setContext', 'promptBank.hasTeams', false);
        });
    }

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
