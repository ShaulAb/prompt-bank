/**
 * Team commands for team prompt management
 *
 * Commands for syncing, viewing, and managing team prompts.
 * All operate on the global TeamService/TeamSyncService (not workspace-scoped).
 */

import * as vscode from 'vscode';
import type { TeamService } from '../services/teamService';
import type { TeamSyncService } from '../services/teamSyncService';
import type { TeamTreeProvider, TeamPromptTreeItem, TeamTreeItem } from '../views/teamTreeProvider';
import { canEdit, canDelete } from '../models/team';
import { createPrompt } from '../models/prompt';

/**
 * Register all team-related commands
 */
export function registerTeamCommands(
  _context: vscode.ExtensionContext,
  teamService: TeamService,
  teamSyncService: TeamSyncService,
  teamTreeProvider: TeamTreeProvider
): vscode.Disposable[] {
  return [
    // Sync all team prompts
    vscode.commands.registerCommand('promptBank.syncTeamPrompts', async () => {
      await syncTeamPromptsCommand(teamService, teamSyncService, teamTreeProvider);
    }),

    // Refresh team tree view
    vscode.commands.registerCommand('promptBank.refreshTeamTreeView', async () => {
      await refreshTeamTreeCommand(teamService, teamSyncService, teamTreeProvider);
    }),

    // Create a new prompt in a team
    vscode.commands.registerCommand('promptBank.newTeamPrompt', async (item?: TeamTreeItem) => {
      await newTeamPromptCommand(teamService, teamSyncService, teamTreeProvider, item);
    }),

    // Edit a team prompt
    vscode.commands.registerCommand(
      'promptBank.editTeamPromptFromTree',
      async (item: TeamPromptTreeItem) => {
        await editTeamPromptCommand(teamService, teamSyncService, teamTreeProvider, item);
      }
    ),

    // Delete a team prompt
    vscode.commands.registerCommand(
      'promptBank.deleteTeamPromptFromTree',
      async (item: TeamPromptTreeItem) => {
        await deleteTeamPromptCommand(teamService, teamSyncService, teamTreeProvider, item);
      }
    ),

    // Copy team prompt content to clipboard
    vscode.commands.registerCommand(
      'promptBank.copyTeamPromptFromTree',
      async (item: TeamPromptTreeItem) => {
        await vscode.env.clipboard.writeText(item.prompt.content);
        vscode.window.showInformationMessage(`Copied "${item.prompt.title}" to clipboard`);
      }
    ),

    // Fork team prompt to personal library
    vscode.commands.registerCommand(
      'promptBank.copyTeamPromptToPersonal',
      async (item: TeamPromptTreeItem) => {
        await copyToPersonalCommand(item);
      }
    ),
  ];
}

/**
 * Sync team prompts with progress indicator
 */
async function syncTeamPromptsCommand(
  teamService: TeamService,
  teamSyncService: TeamSyncService,
  teamTreeProvider: TeamTreeProvider
): Promise<void> {
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Syncing team prompts...',
      cancellable: false,
    },
    async () => {
      try {
        // Refresh team membership first
        await teamService.refreshTeams();

        // Sync all teams
        const results = await teamSyncService.syncAllTeams();

        // Update tree view with synced prompts
        for (const team of teamService.getTeams()) {
          const { storage } = await teamService.getTeamStorage(team.id);
          const prompts = await storage.list();
          teamTreeProvider.setTeamPrompts(team.id, prompts);
        }

        // Update context for view visibility
        await vscode.commands.executeCommand(
          'setContext',
          'promptBank.hasTeams',
          teamService.hasTeams()
        );

        // Report results
        const totalDown = results.reduce((s, r) => s + r.downloaded, 0);
        const totalUp = results.reduce((s, r) => s + r.uploaded, 0);
        const totalErrors = results.reduce((s, r) => s + r.errors.length, 0);

        if (totalErrors > 0) {
          vscode.window.showWarningMessage(
            `Team sync completed with ${totalErrors} error(s). Downloaded: ${totalDown}, Uploaded: ${totalUp}`
          );
        } else {
          vscode.window.showInformationMessage(
            `Team prompts synced. Downloaded: ${totalDown}, Uploaded: ${totalUp}`
          );
        }
      } catch (error) {
        vscode.window.showErrorMessage(
          `Team sync failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );
}

/**
 * Refresh team tree (re-fetch teams + prompts)
 */
async function refreshTeamTreeCommand(
  teamService: TeamService,
  teamSyncService: TeamSyncService,
  teamTreeProvider: TeamTreeProvider
): Promise<void> {
  await syncTeamPromptsCommand(teamService, teamSyncService, teamTreeProvider);
}

/**
 * Create a new prompt in a team via quick input
 */
async function newTeamPromptCommand(
  teamService: TeamService,
  teamSyncService: TeamSyncService,
  teamTreeProvider: TeamTreeProvider,
  teamItem?: TeamTreeItem
): Promise<void> {
  let team = teamItem?.team;

  // If no team specified, let user pick one
  if (!team) {
    const teams = teamService.getTeams().filter((t) => canEdit(t.role));
    if (teams.length === 0) {
      vscode.window.showWarningMessage('You need editor or higher role to create team prompts.');
      return;
    }

    const picked = await vscode.window.showQuickPick(
      teams.map((t) => ({ label: t.name, description: t.role, team: t })),
      { placeHolder: 'Select a team to create the prompt in' }
    );
    if (!picked) {
      return;
    }
    team = picked.team;
  }

  if (!canEdit(team.role)) {
    vscode.window.showWarningMessage(
      `You need editor or higher role in "${team.name}" to create prompts.`
    );
    return;
  }

  // Collect prompt data via input boxes
  const title = await vscode.window.showInputBox({
    prompt: 'Prompt title',
    placeHolder: 'Enter a title for the team prompt',
    validateInput: (v) => (v.trim() ? null : 'Title is required'),
  });
  if (!title) {
    return;
  }

  const category = await vscode.window.showInputBox({
    prompt: 'Category',
    value: 'General',
    placeHolder: 'Enter a category for the prompt',
  });
  if (category === undefined) {
    return;
  }

  const description = await vscode.window.showInputBox({
    prompt: 'Description (optional)',
    placeHolder: 'Brief description of this prompt',
  });
  if (description === undefined) {
    return;
  }

  const content = await vscode.window.showInputBox({
    prompt: 'Prompt content',
    placeHolder: 'Enter the prompt content',
    validateInput: (v) => (v.trim() ? null : 'Content is required'),
  });
  if (!content) {
    return;
  }

  try {
    const prompt = createPrompt(
      title.trim(),
      content.trim(),
      category.trim() || 'General',
      description?.trim() || undefined
    );
    prompt.teamId = team.id;

    const { storage } = await teamService.getTeamStorage(team.id);
    await storage.save(prompt);

    // Sync to upload the new prompt
    await teamSyncService.syncTeam(team);

    // Refresh tree
    const prompts = await storage.list();
    teamTreeProvider.setTeamPrompts(team.id, prompts);

    vscode.window.showInformationMessage(`Created "${title}" in team "${team.name}"`);
  } catch (error) {
    vscode.window.showErrorMessage(
      `Failed to create team prompt: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Edit a team prompt via quick input
 */
async function editTeamPromptCommand(
  teamService: TeamService,
  teamSyncService: TeamSyncService,
  teamTreeProvider: TeamTreeProvider,
  item: TeamPromptTreeItem
): Promise<void> {
  if (!canEdit(item.team.role)) {
    vscode.window.showWarningMessage(
      `You need editor or higher role in "${item.team.name}" to edit prompts.`
    );
    return;
  }

  // Edit fields via input boxes (pre-filled with current values)
  const title = await vscode.window.showInputBox({
    prompt: 'Prompt title',
    value: item.prompt.title,
    validateInput: (v) => (v.trim() ? null : 'Title is required'),
  });
  if (!title) {
    return;
  }

  const content = await vscode.window.showInputBox({
    prompt: 'Prompt content',
    value: item.prompt.content,
    validateInput: (v) => (v.trim() ? null : 'Content is required'),
  });
  if (!content) {
    return;
  }

  const category = await vscode.window.showInputBox({
    prompt: 'Category',
    value: item.prompt.category,
  });
  if (category === undefined) {
    return;
  }

  const description = await vscode.window.showInputBox({
    prompt: 'Description (optional)',
    value: item.prompt.description || '',
  });
  if (description === undefined) {
    return;
  }

  try {
    const trimmedDescription = description.trim();
    const updated = {
      ...item.prompt,
      title: title.trim(),
      content: content.trim(),
      category: category.trim() || 'General',
      metadata: {
        ...item.prompt.metadata,
        modified: new Date(),
      },
    };
    if (trimmedDescription) {
      updated.description = trimmedDescription;
    } else {
      delete updated.description;
    }

    const { storage } = await teamService.getTeamStorage(item.team.id);
    await storage.save(updated);

    // Sync to upload changes
    await teamSyncService.syncTeam(item.team);

    // Refresh tree
    const prompts = await storage.list();
    teamTreeProvider.setTeamPrompts(item.team.id, prompts);

    vscode.window.showInformationMessage(`Updated "${title}" in team "${item.team.name}"`);
  } catch (error) {
    vscode.window.showErrorMessage(
      `Failed to update team prompt: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Delete a team prompt
 */
async function deleteTeamPromptCommand(
  teamService: TeamService,
  teamSyncService: TeamSyncService,
  teamTreeProvider: TeamTreeProvider,
  item: TeamPromptTreeItem
): Promise<void> {
  if (!canDelete(item.team.role)) {
    vscode.window.showWarningMessage(
      `You need admin or higher role in "${item.team.name}" to delete prompts.`
    );
    return;
  }

  const confirm = await vscode.window.showWarningMessage(
    `Delete "${item.prompt.title}" from team "${item.team.name}"?`,
    { modal: true },
    'Delete'
  );

  if (confirm !== 'Delete') {
    return;
  }

  try {
    const { storage, syncState } = await teamService.getTeamStorage(item.team.id);
    await storage.delete(item.prompt.id);

    // Mark as deleted in sync state so the engine won't re-download it
    await syncState.markPromptAsDeleted(item.prompt.id);

    // Re-sync to update sync state
    await teamSyncService.syncTeam(item.team);

    // Update tree
    const prompts = await storage.list();
    teamTreeProvider.setTeamPrompts(item.team.id, prompts);

    vscode.window.showInformationMessage(`Deleted "${item.prompt.title}" from ${item.team.name}`);
  } catch (error) {
    vscode.window.showErrorMessage(
      `Failed to delete prompt: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Copy a team prompt to the personal library
 */
async function copyToPersonalCommand(item: TeamPromptTreeItem): Promise<void> {
  try {
    // Use the personal prompt creation command with pre-filled data
    await vscode.commands.executeCommand('promptBank.newPrompt', {
      prefill: {
        title: `${item.prompt.title} (copy)`,
        content: item.prompt.content,
        category: item.prompt.category,
        description: item.prompt.description,
      },
    });

    vscode.window.showInformationMessage(`"${item.prompt.title}" copied to your personal library`);
  } catch (error) {
    vscode.window.showErrorMessage(
      `Failed to copy prompt: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
