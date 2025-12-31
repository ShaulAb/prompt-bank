import * as vscode from 'vscode';
import { Prompt } from '../models/prompt';

/**
 * Base tree item for the prompt tree view
 */
export abstract class BaseTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(label, collapsibleState);
  }
}

/**
 * Tree item representing a category
 */
export class CategoryTreeItem extends BaseTreeItem {
  constructor(
    public readonly category: string,
    public readonly promptCount: number,
    public readonly order: number
  ) {
    super(`${category} (${promptCount})`, vscode.TreeItemCollapsibleState.Expanded);

    this.tooltip = `Category: ${category} - ${promptCount} prompts`;
    this.contextValue = 'promptBankCategory';
    this.iconPath = new vscode.ThemeIcon('folder');
  }
}

/**
 * Tree item representing a prompt
 */
export class PromptTreeItem extends BaseTreeItem {
  constructor(public readonly prompt: Prompt) {
    super(prompt.title, vscode.TreeItemCollapsibleState.None);

    this.tooltip = this.buildTooltip();
    this.description = this.buildDescription();
    this.contextValue = 'promptBankPrompt';
    this.iconPath = new vscode.ThemeIcon('file-text');
    // Inline actions are contributed via package.json (group "inline").
  }

  private buildTooltip(): string {
    const lines = [
      `Title: ${this.prompt.title}`,
      `Category: ${this.prompt.category}`,
      `Used: ${this.prompt.metadata.usageCount} times`,
    ];

    if (this.prompt.description) {
      lines.push(`Description: ${this.prompt.description}`);
    }

    lines.push(
      `Content: ${this.prompt.content?.substring(0, 100) || 'No content'}${(this.prompt.content?.length || 0) > 100 ? '...' : ''}`
    );

    return lines.join('\n');
  }

  private buildDescription(): string {
    const parts: string[] = [];

    return parts.join(' ');
  }
}

/**
 * Tree item representing an empty state (no prompts/categories)
 * Clickable - opens the prompt editor when selected
 */
export class EmptyStateTreeItem extends BaseTreeItem {
  constructor() {
    super('Click here to create your first prompt!', vscode.TreeItemCollapsibleState.None);
    this.contextValue = 'empty';
    this.iconPath = new vscode.ThemeIcon('add');
    this.tooltip = 'Click to create a new prompt';
    this.command = {
      command: 'promptBank.newPrompt',
      title: 'Create New Prompt',
    };
  }
}

/**
 * Union type for all tree items
 */
export type TreeItem = CategoryTreeItem | PromptTreeItem | EmptyStateTreeItem;
