import * as vscode from 'vscode';
import { PromptService } from '../services/promptService';
import { Prompt } from '../models/prompt';
import { TreeItem, CategoryTreeItem, PromptTreeItem } from './promptTreeItem';

/**
 * Tree data provider for the Prompt Bank sidebar view
 */
export class PromptTreeProvider implements vscode.TreeDataProvider<TreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<TreeItem | undefined | null | void> = new vscode.EventEmitter<TreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<TreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

  constructor(private promptService: PromptService) {}

  /**
   * Refresh the tree view
   */
  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  /**
   * Get tree item representation
   */
  getTreeItem(element: TreeItem): vscode.TreeItem {
    return element;
  }

  /**
   * Get children for tree elements
   */
  async getChildren(element?: TreeItem): Promise<TreeItem[]> {
    if (!element) {
      // Root level - return categories
      return this.getCategoryItems();
    }

    if (element instanceof CategoryTreeItem) {
      // Category level - return prompts in this category
      return this.getPromptItems(element.category);
    }

    // Prompt level - no children
    return [];
  }

  /**
   * Get category tree items
   */
  private async getCategoryItems(): Promise<CategoryTreeItem[]> {
    try {
      const prompts = await this.promptService.listPrompts();
      
      if (prompts.length === 0) {
        return [];
      }

      // Group prompts by category
      const categoryMap = new Map<string, number>();
      
      prompts.forEach(prompt => {
        const count = categoryMap.get(prompt.category) || 0;
        categoryMap.set(prompt.category, count + 1);
      });

      // Convert to tree items and sort alphabetically
      const categoryItems = Array.from(categoryMap.entries())
        .map(([category, count]) => new CategoryTreeItem(category, count))
        .sort((a, b) => a.category.localeCompare(b.category));

      return categoryItems;
    } catch (error) {
      console.error('Error getting category items:', error);
      return [];
    }
  }

  /**
   * Get prompt tree items for a specific category
   */
  private async getPromptItems(category: string): Promise<PromptTreeItem[]> {
    try {
      const prompts = await this.promptService.listPrompts({
        category,
        sortBy: 'title',
        sortOrder: 'asc'
      });

      return prompts.map(prompt => new PromptTreeItem(prompt));
    } catch (error) {
      console.error('Error getting prompt items:', error);
      return [];
    }
  }

  /**
   * Get a specific prompt by ID (useful for context menu actions)
   */
  async getPromptById(id: string): Promise<Prompt | undefined> {
    try {
      const prompts = await this.promptService.listPrompts();
      return prompts.find(p => p.id === id);
    } catch (error) {
      console.error('Error getting prompt by ID:', error);
      return undefined;
    }
  }
} 