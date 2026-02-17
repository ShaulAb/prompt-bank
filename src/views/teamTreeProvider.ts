/**
 * Tree data provider for the Team Prompts sidebar view
 *
 * Displays a three-level hierarchy:
 *   Team (name + role badge) -> Category (with count) -> Prompt
 *
 * contextValue encodes the user's role for menu gating in package.json.
 */

import * as vscode from 'vscode';
import type { Prompt } from '../models/prompt';
import type { Team } from '../models/team';
import type { TeamService } from '../services/teamService';

// ────────────────────────────────────────────────────────────────────────────
// Tree Item Types
// ────────────────────────────────────────────────────────────────────────────

/**
 * Tree item representing a team
 */
export class TeamTreeItem extends vscode.TreeItem {
  constructor(public readonly team: Team) {
    super(team.name, vscode.TreeItemCollapsibleState.Expanded);

    const roleBadge = team.role.charAt(0).toUpperCase() + team.role.slice(1);
    this.description = roleBadge;
    this.tooltip = `${team.name} (${roleBadge})\n${team.memberCount} member${team.memberCount !== 1 ? 's' : ''}${team.description ? `\n${team.description}` : ''}`;
    this.contextValue = `team_${team.role}`;
    this.iconPath = new vscode.ThemeIcon('organization');
  }
}

/**
 * Tree item representing a category within a team
 */
export class TeamCategoryTreeItem extends vscode.TreeItem {
  constructor(
    public readonly category: string,
    public readonly promptCount: number,
    public readonly team: Team
  ) {
    super(`${category} (${promptCount})`, vscode.TreeItemCollapsibleState.Expanded);

    this.tooltip = `Category: ${category} - ${promptCount} prompts`;
    this.contextValue = `teamCategory_${team.role}`;
    this.iconPath = new vscode.ThemeIcon('folder');
  }
}

/**
 * Tree item representing a prompt within a team
 */
export class TeamPromptTreeItem extends vscode.TreeItem {
  constructor(
    public readonly prompt: Prompt,
    public readonly team: Team
  ) {
    super(prompt.title, vscode.TreeItemCollapsibleState.None);

    this.tooltip = this.buildTooltip();
    this.contextValue = `teamPrompt_${team.role}`;
    this.iconPath = new vscode.ThemeIcon('file-text');
  }

  private buildTooltip(): string {
    const lines = [
      `Title: ${this.prompt.title}`,
      `Category: ${this.prompt.category}`,
      `Team: ${this.team.name}`,
    ];

    if (this.prompt.description) {
      lines.push(`Description: ${this.prompt.description}`);
    }

    const preview = this.prompt.content?.substring(0, 100) || 'No content';
    const ellipsis = (this.prompt.content?.length || 0) > 100 ? '...' : '';
    lines.push(`Content: ${preview}${ellipsis}`);

    return lines.join('\n');
  }
}

/**
 * Empty state when user has teams but no prompts
 */
export class TeamEmptyStateTreeItem extends vscode.TreeItem {
  constructor(public readonly team: Team) {
    super('No team prompts yet', vscode.TreeItemCollapsibleState.None);
    this.contextValue = 'teamEmpty';
    this.iconPath = new vscode.ThemeIcon('info');
    this.tooltip = 'This team has no prompts yet';
  }
}

export type TeamTreeItemType =
  | TeamTreeItem
  | TeamCategoryTreeItem
  | TeamPromptTreeItem
  | TeamEmptyStateTreeItem;

// ────────────────────────────────────────────────────────────────────────────
// Tree Data Provider
// ────────────────────────────────────────────────────────────────────────────

export class TeamTreeProvider implements vscode.TreeDataProvider<TeamTreeItemType> {
  private _onDidChangeTreeData = new vscode.EventEmitter<
    TeamTreeItemType | undefined | null | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  /** Cache of team prompts keyed by teamId */
  private teamPromptsCache = new Map<string, Prompt[]>();

  constructor(private readonly teamService: TeamService) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  /**
   * Update cached prompts for a team and refresh the view
   */
  setTeamPrompts(teamId: string, prompts: Prompt[]): void {
    this.teamPromptsCache.set(teamId, prompts);
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: TeamTreeItemType): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: TeamTreeItemType): Promise<TeamTreeItemType[]> {
    if (!element) {
      // Root level - return teams
      return this.getTeamItems();
    }

    if (element instanceof TeamTreeItem) {
      // Team level - return categories within this team
      return this.getCategoryItems(element.team);
    }

    if (element instanceof TeamCategoryTreeItem) {
      // Category level - return prompts in this category
      return this.getPromptItems(element.team, element.category);
    }

    return [];
  }

  private getTeamItems(): TeamTreeItemType[] {
    const teams = this.teamService.getTeams();
    if (teams.length === 0) {
      return [];
    }
    return teams.map((t) => new TeamTreeItem(t));
  }

  private getCategoryItems(team: Team): TeamTreeItemType[] {
    const prompts = this.teamPromptsCache.get(team.id) || [];

    if (prompts.length === 0) {
      return [new TeamEmptyStateTreeItem(team)];
    }

    // Group by category
    const categoryMap = new Map<string, number>();
    for (const prompt of prompts) {
      const count = categoryMap.get(prompt.category) || 0;
      categoryMap.set(prompt.category, count + 1);
    }

    return Array.from(categoryMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, count]) => new TeamCategoryTreeItem(name, count, team));
  }

  private getPromptItems(team: Team, category: string): TeamTreeItemType[] {
    const prompts = this.teamPromptsCache.get(team.id) || [];

    return prompts
      .filter((p) => p.category === category)
      .sort((a, b) => a.title.localeCompare(b.title))
      .map((p) => new TeamPromptTreeItem(p, team));
  }
}
