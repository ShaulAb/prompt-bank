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

    if (this.prompt.tags.length > 0) {
      lines.push(`Tags: ${this.prompt.tags.join(', ')}`);
    }

    lines.push(
      `Content: ${this.prompt.content.substring(0, 100)}${this.prompt.content.length > 100 ? '...' : ''}`
    );

    return lines.join('\n');
  }

  private buildDescription(): string {
    const parts: string[] = [];

    if (this.prompt.tags.length > 0) {
      parts.push(`#${this.prompt.tags[0]}`);
    }

    return parts.join(' ');
  }
}

/**
 * Tree item representing an empty state (no prompts/categories)
 */
export class EmptyStateTreeItem extends BaseTreeItem {
  constructor() {
    super(
      'No prompts found. Use the Command Palette (Ctrl+Shift+P) to add your first prompt!',
      vscode.TreeItemCollapsibleState.None
    );
    this.contextValue = 'empty';
    this.iconPath = new vscode.ThemeIcon('info');
    this.tooltip = 'Prompt Bank is empty. Start by adding a prompt from the Command Palette!';
  }
}

/**
 * Union type for all tree items
 */
export type TreeItem = CategoryTreeItem | PromptTreeItem | EmptyStateTreeItem;
