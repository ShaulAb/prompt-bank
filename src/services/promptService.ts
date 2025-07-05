import * as vscode from 'vscode';
import * as path from 'path';
import { Prompt, createPrompt } from '../models/prompt';
import { IStorageProvider, PromptFilter } from '../storage/interfaces';
import { FileStorageProvider } from '../storage/fileStorage';

/**
 * Core prompt service that handles business logic
 * Coordinates between VS Code UI and storage layer
 */
export class PromptService {
  private storage: IStorageProvider;
  private isInitialized = false;

  constructor(storage?: IStorageProvider) {
    this.storage = storage || new FileStorageProvider();
  }

  /**
   * Initialize the service
   */
  async initialize(): Promise<void> {
    try {
      await this.storage.initialize();
      this.isInitialized = true;
    } catch (error) {
      throw new Error(`Failed to initialize prompt service: ${error}`);
    }
  }

  /**
   * Save a new prompt from current editor selection
   */
  async savePromptFromSelection(): Promise<Prompt | null> {
    await this.ensureInitialized();

    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage('No active editor found');
      return null;
    }

    const selection = editor.selection;
    const selectedText = editor.document.getText(selection);

    if (!selectedText.trim()) {
      vscode.window.showErrorMessage('Please select some text to save as a prompt');
      return null;
    }

    // Get prompt details from user
    const title = await vscode.window.showInputBox({
      prompt: 'Enter a title for this prompt',
      placeHolder: 'e.g., "Code Review Template"',
      validateInput: (value) => {
        if (!value.trim()) {
          return 'Title is required';
        }
        if (value.length > 100) {
          return 'Title must be less than 100 characters';
        }
        return null;
      }
    });

    if (!title) {
      return null; // User cancelled
    }

    const description = await vscode.window.showInputBox({
      prompt: 'Enter a description (optional)',
      placeHolder: 'Describe what this prompt is used for...'
    });

    const category = await this.selectCategory();
    if (!category) {
      return null; // User cancelled
    }
    const categoryName: string = category;

    // Create prompt with file context
    const prompt = createPrompt(title.trim(), selectedText, categoryName);
    prompt.description = description?.trim();

    // Assign order: place at end of category
    const promptsInCategory = (await this.storage.list({ category: categoryName })) || [];
    const maxOrder = promptsInCategory.reduce((max, p) => p.order !== undefined ? Math.max(max, p.order) : max, -1);
    prompt.order = maxOrder + 1;

    // Add file context for future smart suggestions
    const document = editor.document;
    const projectType = this.detectProjectType(document.fileName);
    if (projectType) {
      prompt.metadata.context = {
        fileExtension: path.extname(document.fileName).slice(1),
        language: document.languageId,
        projectType: projectType!
      };
    }

    try {
      await this.storage.save(prompt);
      vscode.window.showInformationMessage(`Prompt "${title}" saved successfully!`);
      return prompt;
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to save prompt: ${error}`);
      return null;
    }
  }

  /**
   * Insert a prompt at current cursor position
   */
  async insertPrompt(): Promise<void> {
    await this.ensureInitialized();

    const prompts = await this.storage.list({
      sortBy: 'modified',
      sortOrder: 'desc'
    });

    if (prompts.length === 0) {
      vscode.window.showInformationMessage('No prompts saved yet. Save some prompts first!');
      return;
    }

    // Create quick pick items
    const items = prompts.map(prompt => ({
      label: prompt.title,
      description: prompt.category,
      detail: prompt.description || prompt.content.substring(0, 100) + '...',
      prompt
    }));

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select a prompt to insert',
      matchOnDescription: true,
      matchOnDetail: true
    });

    if (!selected) {
      return; // User cancelled
    }

    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage('No active editor found');
      return;
    }

    // TODO: Phase 3 - Handle template variables
    const contentToInsert = selected.prompt.content;

    // Insert at current cursor position
    await editor.edit((editBuilder: vscode.TextEditorEdit) => {
      editBuilder.insert(editor.selection.active, contentToInsert);
    });

    // Update usage statistics
    selected.prompt.metadata.usageCount++;
    selected.prompt.metadata.lastUsed = new Date();
    await this.storage.update(selected.prompt);

    vscode.window.showInformationMessage(`Inserted prompt: "${selected.prompt.title}"`);
  }

  /**
   * List all prompts with optional filtering
   */
  async listPrompts(filter?: PromptFilter): Promise<Prompt[]> {
    await this.ensureInitialized();
    return this.storage.list(filter);
  }

  /**
   * Delete a prompt
   */
  async deletePrompt(): Promise<void> {
    await this.ensureInitialized();

    const prompts = await this.storage.list({
      sortBy: 'title',
      sortOrder: 'asc'
    });

    if (prompts.length === 0) {
      vscode.window.showInformationMessage('No prompts to delete');
      return;
    }

    // Create quick pick items for deletion
    const items = prompts.map(prompt => ({
      label: prompt.title,
      description: `${prompt.category} • Used ${prompt.metadata.usageCount} times`,
      detail: prompt.description || prompt.content.substring(0, 100) + '...',
      prompt
    }));

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select a prompt to delete',
      matchOnDescription: true,
      matchOnDetail: true
    });

    if (!selected) {
      return; // User cancelled
    }

    // Confirm deletion
    const confirmation = await vscode.window.showWarningMessage(
      `Are you sure you want to delete "${selected.prompt.title}"?`,
      { modal: true },
      'Delete'
    );

    if (confirmation === 'Delete') {
      try {
        const success = await this.storage.delete(selected.prompt.id);
        if (success) {
          vscode.window.showInformationMessage(`Deleted prompt: "${selected.prompt.title}"`);
        } else {
          vscode.window.showErrorMessage('Failed to delete prompt');
        }
      } catch (error) {
        vscode.window.showErrorMessage(`Error deleting prompt: ${error}`);
      }
    }
  }

  /**
   * Update an existing prompt
   */
  async updatePromptById(prompt: Prompt): Promise<void> {
    await this.ensureInitialized();
    // Ensure order is set if missing
    if (prompt.order === undefined) {
      const promptsInCategory = (await this.storage.list({ category: prompt.category })) || [];
      const maxOrder = promptsInCategory.reduce((max, p) => p.order !== undefined ? Math.max(max, p.order) : max, -1);
      prompt.order = maxOrder + 1;
    }
    await this.storage.update(prompt);
  }

  /**
   * Delete a prompt by ID
   */
  async deletePromptById(id: string): Promise<boolean> {
    await this.ensureInitialized();
    return this.storage.delete(id);
  }

  /**
   * Get storage statistics
   */
  async getStats() {
    await this.ensureInitialized();
    return this.storage.getStats();
  }

  // Add centralized insertion method
  async insertPromptById(prompt: Prompt): Promise<void> {
    await this.ensureInitialized();
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage('No active editor found');
      return;
    }
    // Insert prompt content at cursor
    await editor.edit(editBuilder => {
      editBuilder.insert(editor.selection.active, prompt.content);
    });
    // Update usage statistics
    prompt.metadata.usageCount++;
    prompt.metadata.lastUsed = new Date();
    await this.storage.update(prompt);
    vscode.window.showInformationMessage(`Inserted prompt: "${prompt.title}"`);
  }

  // Private helper methods

  private async ensureInitialized(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }
  }

  private async selectCategory(): Promise<string | null> {
    // Get existing categories from saved prompts
    const prompts = await this.storage.list();
    const existingCategories = [...new Set(prompts.map(p => p.category))];

    const predefinedCategories = [
      'General',
      'Architecture',
      'UI/UX',
      'Testing',
    ];

    // Combine and deduplicate categories
    const allCategories = [...new Set([...predefinedCategories, ...existingCategories])];

    const items = [
      ...allCategories.map(cat => ({ label: cat, description: 'Existing category' })),
      { label: '$(plus) Create New Category', description: 'Create a new category' }
    ];

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select or create a category',
      matchOnDescription: false
    });

    if (!selected) {
      return null; // User cancelled
    }

    if (selected.label.startsWith('$(plus)')) {
      // Create new category
      const newCategory = await vscode.window.showInputBox({
        prompt: 'Enter new category name',
        placeHolder: 'e.g., "API Documentation"',
        validateInput: (value: string) => {
          if (!value.trim()) {
            return 'Category name is required';
          }
          if (value.length > 50) {
            return 'Category name must be less than 50 characters';
          }
          return null;
        }
      });
      return newCategory?.trim() || null;
    }

    return selected.label;
  }

  private detectProjectType(fileName: string): string | undefined {
    // Simple project type detection based on file patterns
    if (fileName.includes('package.json')) return 'Node.js';
    if (fileName.includes('Cargo.toml')) return 'Rust';
    if (fileName.includes('requirements.txt') || fileName.includes('pyproject.toml')) return 'Python';
    if (fileName.includes('pom.xml') || fileName.includes('build.gradle')) return 'Java';
    if (fileName.includes('Gemfile')) return 'Ruby';
    
    return undefined;
  }

  /**
   * Rename all prompts in a category in one atomic operation
   */
  async renameCategory(oldName: string, newName: string): Promise<number> {
    await this.ensureInitialized();
    // Load all prompts in the old category
    const prompts = await this.storage.list({ category: oldName });
    if (prompts.length === 0) {
      return 0;
    }
    // Update category and modified timestamp in memory
    prompts.forEach(prompt => {
      prompt.category = newName;
      prompt.metadata.modified = new Date();
    });
    // Persist each updated prompt sequentially to avoid race conditions
    for (const prompt of prompts) {
      await this.storage.update(prompt);
    }
    return prompts.length;
  }
}

// Export singleton instance
export const promptService = new PromptService(); 