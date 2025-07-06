import * as vscode from 'vscode';
import { PromptService } from '../services/promptService';
import { Prompt, Category } from '../models/prompt';
import { TreeItem, CategoryTreeItem, PromptTreeItem, EmptyStateTreeItem } from './promptTreeItem';

/**
 * Tree data provider for the Prompt Bank sidebar view
 * Supports inline editing for category renaming
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
  private async getCategoryItems(): Promise<CategoryTreeItem[] | [EmptyStateTreeItem]> {
    try {
      const prompts = await this.promptService.listPrompts();
      
      if (prompts.length === 0) {
        // Show empty state item if no prompts exist
        return [new EmptyStateTreeItem()];
      }

      // Group prompts by category
      const categoryMap = new Map<string, number>();
      prompts.forEach(prompt => {
        const count = categoryMap.get(prompt.category) || 0;
        categoryMap.set(prompt.category, count + 1);
      });

      // Build Category objects with order (for now, order is alphabetical or from prompt metadata)
      const categories: Category[] = Array.from(categoryMap.keys())
        .map((name, idx) => {
          // Find a prompt in this category with categoryOrder
          const promptWithOrder = prompts.find(p => p.category === name && (p as any).categoryOrder !== undefined);
          return {
            name,
            order: promptWithOrder ? (promptWithOrder as any).categoryOrder : idx
          };
        })
        .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));

      // Convert to tree items and sort by order
      const categoryItems = categories
        .map(cat => new CategoryTreeItem(cat.name, categoryMap.get(cat.name) || 0, cat.order));

      // Already sorted by order
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
        category
      });

      // Sort by order if present, otherwise by title
      prompts.sort((a, b) => {
        if (a.order !== undefined && b.order !== undefined) {
          return a.order - b.order;
        }
        if (a.order !== undefined) return -1;
        if (b.order !== undefined) return 1;
        return a.title.localeCompare(b.title);
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

  // ============================================================================
  // CATEGORY RENAMING SUPPORT
  // ============================================================================

  /**
   * Show an input box for renaming a category with improved UX
   * This provides a more user-friendly alternative to command palette
   */
  async showRenameCategoryInput(categoryName: string): Promise<void> {
    try {
      // Get existing categories for validation
      const existingPrompts = await this.promptService.listPrompts();
      const existingCategories = [...new Set(existingPrompts.map(p => p.category))];

      const newCategoryName = await vscode.window.showInputBox({
        title: `Rename Category: ${categoryName}`,
        prompt: 'Enter the new category name',
        value: categoryName, // Pre-populate with current name
        valueSelection: [0, categoryName.length], // Select all text for easy replacement
        validateInput: (value: string) => {
          const trimmed = value.trim();
          
          // Check if empty
          if (!trimmed) {
            return 'Category name cannot be empty';
          }
          
          // Check if same as current name
          if (trimmed === categoryName) {
            return null; // Allow keeping the same name (no-op)
          }
          
          // Check if already exists
          if (existingCategories.includes(trimmed)) {
            return `Category "${trimmed}" already exists`;
          }
          
          // Check for invalid characters (optional - add your own rules)
          if (trimmed.includes('/') || trimmed.includes('\\')) {
            return 'Category name cannot contain / or \\ characters';
          }
          
          return null; // Valid
        }
      });

      // User cancelled the input
      if (newCategoryName === undefined) {
        return;
      }

      const trimmedNewName = newCategoryName.trim();
      
      // No change needed
      if (trimmedNewName === categoryName) {
        return;
      }

      // Perform the rename
      await this.promptService.renameCategory(categoryName, trimmedNewName);
      
      // Refresh the tree view
      this.refresh();
      
      // Show success message
      vscode.window.showInformationMessage(
        `Category renamed from "${categoryName}" to "${trimmedNewName}"`
      );

    } catch (error) {
      console.error('Error renaming category:', error);
      vscode.window.showErrorMessage(
        `Failed to rename category: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}

export class PromptDragAndDropController implements vscode.TreeDragAndDropController<TreeItem> {
  public readonly dropMimeTypes = ['application/vnd.code.tree.promptBank.promptsView'];
  public readonly dragMimeTypes = ['application/vnd.code.tree.promptBank.promptsView'];
  public readonly supportedTypes = ['category', 'prompt'];

  constructor(
    private treeProvider: PromptTreeProvider,
    private promptService: import('../services/promptService').PromptService
  ) {}

  public handleDrag?(source: readonly TreeItem[], dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): void | Thenable<void> {
    // Only allow dragging one item at a time for now
    const item = source[0];
    if (!item) return;
    if (item instanceof CategoryTreeItem) {
      dataTransfer.set('application/vnd.code.tree.promptBank.promptsView', new vscode.DataTransferItem(JSON.stringify({ type: 'category', name: item.category })));
    } else if (item instanceof PromptTreeItem) {
      dataTransfer.set('application/vnd.code.tree.promptBank.promptsView', new vscode.DataTransferItem(JSON.stringify({ type: 'prompt', id: item.prompt.id })));
    }
  }
  public async handleDrop(target: TreeItem | undefined, dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): Promise<void> {
    const raw = dataTransfer.get('application/vnd.code.tree.promptBank.promptsView');
    if (!raw) return;
    let dragged;
    try {
      dragged = JSON.parse(await raw.asString());
    } catch {
      return;
    }

    // Category drag & drop
    if (dragged.type === 'category') {
      if (!(target instanceof CategoryTreeItem)) return;
      // Reorder categories: move dragged.name to the position of target.category
      const prompts = await this.promptService.listPrompts();
      // Get unique categories with their current order
      const categoryMap = new Map<string, number>();
      prompts.forEach(p => {
        if (!categoryMap.has(p.category)) {
          categoryMap.set(p.category, p.order ?? 0);
        }
      });
      const categories = Array.from(categoryMap.keys());
      const fromIdx = categories.indexOf(dragged.name);
      const toIdx = categories.indexOf(target.category);
      if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return;
      // Move dragged category to new position
      categories.splice(fromIdx, 1);
      categories.splice(toIdx, 0, dragged.name);
      // Update order for all prompts in each category
      for (let i = 0; i < categories.length; i++) {
        const cat = categories[i];
        const catPrompts = prompts.filter(p => p.category === cat);
        for (const prompt of catPrompts) {
          prompt.order = prompt.order ?? 0; // fallback
          // Store category order in prompt metadata (or add a new property if needed)
          (prompt as any).categoryOrder = i;
          await this.promptService.editPromptById(prompt);
        }
      }
      this.treeProvider.refresh();
      return;
    }

    // Prompt drag & drop
    if (dragged.type === 'prompt') {
      // Only allow drop on CategoryTreeItem or PromptTreeItem
      if (!(target instanceof CategoryTreeItem || target instanceof PromptTreeItem)) return;
      const prompts = await this.promptService.listPrompts();
      const prompt = prompts.find(p => p.id === dragged.id);
      if (!prompt) return;
      let newCategory = prompt.category;
      let newOrder = 0;
      if (target instanceof CategoryTreeItem) {
        newCategory = target.category;
        // Place at end of target category
        const catPrompts = prompts.filter(p => p.category === newCategory);
        newOrder = catPrompts.length;
      } else if (target instanceof PromptTreeItem) {
        newCategory = target.prompt.category;
        // Place before the target prompt in the same category
        const catPrompts = prompts.filter(p => p.category === newCategory && p.id !== prompt.id);
        const targetIdx = catPrompts.findIndex(p => p.id === target.prompt.id);
        if (targetIdx === -1) return;
        catPrompts.splice(targetIdx, 0, prompt);
        // Reassign order for all prompts in the category
        for (let i = 0; i < catPrompts.length; i++) {
          catPrompts[i].order = i;
          await this.promptService.editPromptById(catPrompts[i]);
        }
        this.treeProvider.refresh();
        return;
      }
      // Move prompt to new category at end
      prompt.category = newCategory;
      prompt.order = newOrder;
      await this.promptService.editPromptById(prompt);
      this.treeProvider.refresh();
      return;
    }
  }
} 