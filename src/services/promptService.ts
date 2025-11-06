import * as vscode from 'vscode';
import * as path from 'path';
import { Prompt, createPrompt } from '../models/prompt';
import { IStorageProvider, PromptFilter } from '../storage/interfaces';
import { FileStorageProvider } from '../storage/fileStorage';
import { createShareMulti } from './shareService';
import { AuthService } from './authService';

/**
 * Core prompt service that handles business logic
 * Coordinates between VS Code UI and storage layer
 */
export class PromptService {
  private storage: IStorageProvider;
  private isInitialized = false;
  private authService: AuthService | undefined;

  constructor(storage?: IStorageProvider, authService?: AuthService) {
    this.storage = storage || new FileStorageProvider();
    this.authService = authService;
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
   * Get prompt content from editor selection or clipboard
   * Returns an object with content source and the actual text
   */
  private async getPromptContent(): Promise<{
    content: string;
    source: 'selection' | 'clipboard';
  } | null> {
    // First, try to get content from active editor selection
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      const selection = editor.selection;
      const selectedText = editor.document.getText(selection);

      if (selectedText.trim()) {
        return {
          content: selectedText,
          source: 'selection',
        };
      }
    }

    // If no selection, try clipboard
    try {
      const clipboardText = await vscode.env.clipboard.readText();
      if (clipboardText.trim()) {
        return {
          content: clipboardText,
          source: 'clipboard',
        };
      }
    } catch (error) {
      // Clipboard access failed, fall through to show error message
    }

    // Neither source has content
    return null;
  }

  /**
   * Save a new prompt from current editor selection or clipboard
   */
  async savePrompt(): Promise<Prompt | null> {
    await this.ensureInitialized();

    const contentSource = await this.getPromptContent();
    if (!contentSource) {
      vscode.window.showErrorMessage(
        'No text selected or available in clipboard to save as a prompt.'
      );
      return null;
    }

    const selectedText = contentSource.content;

    if (!selectedText.trim()) {
      vscode.window.showErrorMessage('Please select some text to save as a prompt');
      return null;
    }

    // Get prompt details from user
    const title = await vscode.window.showInputBox({
      prompt: 'Enter a title for this prompt',
      placeHolder: 'e.g., "Code Review Template"',
      validateInput: (value: string) => {
        if (!value.trim()) {
          return 'Title is required';
        }
        if (value.length > 100) {
          return 'Title must be less than 100 characters';
        }
        return null;
      },
    });

    if (!title) {
      return null; // User cancelled
    }

    const description = await vscode.window.showInputBox({
      prompt: 'Enter a description (optional)',
      placeHolder: 'Describe what this prompt is used for...',
    });

    const category = await this.selectCategory();
    if (!category) {
      return null; // User cancelled
    }
    const categoryName = category;

    // Create prompt with file context
    const prompt = createPrompt(title.trim(), selectedText, categoryName);
    if (description?.trim()) {
      prompt.description = description.trim();
    }

    // Assign order: place at end of category
    const promptsInCategory = (await this.storage.list({ category: categoryName })) || [];
    const maxOrder = promptsInCategory.reduce(
      (max, p) => (p.order !== undefined ? Math.max(max, p.order) : max),
      -1
    );
    prompt.order = maxOrder + 1;

    // Add file context for future smart suggestions
    const document = vscode.window.activeTextEditor?.document;
    const projectType = document ? this.detectProjectType(document.fileName) : undefined;
    if (projectType && document) {
      prompt.metadata.context = {
        fileExtension: path.extname(document.fileName).slice(1),
        language: document.languageId,
        projectType: projectType,
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
   * Save a prompt directly (used by the WebView editor)
   */
  async savePromptDirectly(prompt: Prompt): Promise<Prompt> {
    await this.ensureInitialized();

    // Assign order: place at end of category
    const promptsInCategory = (await this.storage.list({ category: prompt.category })) || [];
    const maxOrder = promptsInCategory.reduce(
      (max, p) => (p.order !== undefined ? Math.max(max, p.order) : max),
      -1
    );
    prompt.order = maxOrder + 1;

    // Add file context if available
    const document = vscode.window.activeTextEditor?.document;
    if (document) {
      const projectType = this.detectProjectType(document.fileName);
      if (projectType) {
        prompt.metadata.context = {
          fileExtension: path.extname(document.fileName).slice(1),
          language: document.languageId,
          projectType: projectType,
        };
      }
    }

    await this.storage.save(prompt);
    return prompt;
  }

  /**
   * Insert a prompt at current cursor position
   */
  async insertPrompt(): Promise<void> {
    await this.ensureInitialized();

    const prompts = await this.storage.list({
      sortBy: 'modified',
      sortOrder: 'desc',
    });

    if (prompts.length === 0) {
      vscode.window.showInformationMessage('No prompts saved yet. Save some prompts first!');
      return;
    }

    // Create quick pick items
    const items = prompts.map((prompt) => ({
      label: prompt.title,
      description: prompt.category,
      detail: prompt.description || (prompt.content?.substring(0, 100) || 'No content') + '...',
      prompt,
    }));

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select a prompt to insert',
      matchOnDescription: true,
      matchOnDetail: true,
    });

    if (!selected) {
      return; // User cancelled
    }

    const contentToInsert = selected.prompt.content;

    // Copy to clipboard
    await vscode.env.clipboard.writeText(contentToInsert);

    // Update usage statistics
    selected.prompt.metadata.usageCount++;
    selected.prompt.metadata.lastUsed = new Date();
    await this.storage.update(selected.prompt);

    vscode.window.showInformationMessage(`Prompt "${selected.prompt.title}" copied to clipboard!`);
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
      sortOrder: 'asc',
    });

    if (prompts.length === 0) {
      vscode.window.showInformationMessage('No prompts to delete');
      return;
    }

    // Create quick pick items for deletion
    const items = prompts.map((prompt) => ({
      label: prompt.title,
      description: `${prompt.category} • Used ${prompt.metadata.usageCount} times`,
      detail: prompt.description || (prompt.content?.substring(0, 100) || 'No content') + '...',
      prompt,
    }));

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select a prompt to delete',
      matchOnDescription: true,
      matchOnDetail: true,
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
   * Edit an existing prompt
   * Automatically creates a version snapshot before modifications
   */
  async editPromptById(prompt: Prompt, changeReason?: string): Promise<void> {
    await this.ensureInitialized();

    // Load original from storage to capture state BEFORE modifications
    const original = await this.storage.load(prompt.id);
    if (!original) {
      throw new Error(`Prompt not found: ${prompt.id}`);
    }

    // Create version from ORIGINAL state (before modifications)
    const versionCreated = await this.createVersion(original, 'on-save', changeReason);

    // Copy updated versions array to the modified prompt
    prompt.versions = original.versions;

    // Update modified timestamp
    prompt.metadata.modified = new Date();

    // Ensure order is set if missing
    if (prompt.order === undefined) {
      const promptsInCategory = (await this.storage.list({ category: prompt.category })) || [];
      const maxOrder = promptsInCategory.reduce(
        (max, p) => (p.order !== undefined ? Math.max(max, p.order) : max),
        -1
      );
      prompt.order = maxOrder + 1;
    }

    // Save to storage
    await this.storage.update(prompt);

    // Show version number in success message
    if (versionCreated) {
      const { getDisplayVersionNumber } = await import('../models/prompt');
      const versionNumber = getDisplayVersionNumber(prompt);
      console.log(`[PromptService] Prompt "${prompt.title}" saved as v${versionNumber}`);
    }
  }

  /**
   * Delete a prompt by ID
   */
  async deletePromptById(id: string): Promise<boolean> {
    await this.ensureInitialized();
    return this.storage.delete(id);
  }

  /**
   * Duplicate an existing prompt (creates a new prompt with a fresh ID)
   * Returns the newly created prompt
   */
  async duplicatePrompt(original: Prompt): Promise<Prompt> {
    await this.ensureInitialized();

    // Create a new prompt object using createPrompt to ensure new id & metadata
    const newTitle = `${original.title} (Copy)`;
    const duplicate = createPrompt(
      newTitle,
      original.content,
      original.category,
      original.description
    );

    // Place duplicate at end of its category
    const promptsInCategory = await this.storage.list({ category: original.category });
    const maxOrder = promptsInCategory.reduce(
      (max, p) => (p.order !== undefined ? Math.max(max, p.order) : max),
      -1
    );
    duplicate.order = maxOrder + 1;
    duplicate.metadata.usageCount = 0; // Reset usage count for imported prompts
    duplicate.metadata.created = new Date();
    duplicate.metadata.modified = new Date();

    await this.storage.save(duplicate);
    return duplicate;
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

    const contentToInsert = prompt.content;

    // Copy to clipboard
    await vscode.env.clipboard.writeText(contentToInsert);

    // Update usage statistics
    prompt.metadata.usageCount++;
    prompt.metadata.lastUsed = new Date();
    await this.storage.update(prompt);

    vscode.window.showInformationMessage(`Prompt "${prompt.title}" copied to clipboard!`);
  }

  /**
   * Save a prompt that comes from an external share link.
   * Generates a new ID and ensures ordering within its category.
   */
  async importPrompt(original: Prompt): Promise<Prompt> {
    await this.ensureInitialized();

    // Determine a title that avoids duplicates (same title + identical content within the category)
    let newTitle = original.title;
    const promptsInCategory = (await this.storage.list({ category: original.category })) || [];

    const isExactDuplicate = promptsInCategory.some(
      (p) => p.title === original.title && p.content === original.content
    );
    if (isExactDuplicate) {
      // Generate an available suffix: "<title> (imported)", "<title> (imported 2)", etc.
      let attempt = 1;
      let candidateTitle = `${original.title} (imported)`;
      while (promptsInCategory.some((p) => p.title === candidateTitle)) {
        attempt += 1;
        candidateTitle = `${original.title} (imported ${attempt})`;
      }
      newTitle = candidateTitle;
    }

    // Create a new prompt using the (possibly modified) title
    const imported = createPrompt(
      newTitle,
      original.content,
      original.category,
      original.description
    );

    // Place at end of its category
    const maxOrder = promptsInCategory.reduce(
      (max, p) => (p.order !== undefined ? Math.max(max, p.order) : max),
      -1
    );
    imported.order = maxOrder + 1;
    imported.metadata.usageCount = 0; // Reset usage count for imported prompts
    imported.metadata.created = new Date();
    imported.metadata.modified = new Date();

    await this.storage.save(imported);
    return imported;
  }

  /**
   * Import multiple prompts as a new collection
   * Returns the names of the categories that were created
   */
  async importCollection(prompts: Prompt[]): Promise<string[]> {
    await this.ensureInitialized();

    const importedCategories: Set<string> = new Set();
    const categoryNameMap: Map<string, string> = new Map(); // To map original category name to new unique name

    for (const originalPrompt of prompts) {
      let newCategoryName: string;

      // Determine the unique category name for this imported prompt
      const existingCategoryName = categoryNameMap.get(originalPrompt.category);
      if (existingCategoryName) {
        newCategoryName = existingCategoryName;
      } else {
        // If it's the first prompt from this original category, generate a unique name
        let candidateCategoryName = originalPrompt.category;
        let counter = 1;
        // Ensure the new category name is unique within the existing prompt bank
        let categoryExists = (await this.storage.getAllCategories()).includes(
          candidateCategoryName
        );

        while (categoryExists) {
          candidateCategoryName = `${originalPrompt.category} - Imported${counter > 1 ? ` (${counter})` : ''}`;
          categoryExists = (await this.storage.getAllCategories()).includes(candidateCategoryName);
          counter++;
        }
        newCategoryName = candidateCategoryName;
        categoryNameMap.set(originalPrompt.category, newCategoryName);
      }

      const newPrompt = createPrompt(
        originalPrompt.title,
        originalPrompt.content,
        newCategoryName,
        originalPrompt.description
      );

      // Reset usage count and dates for newly imported prompts
      newPrompt.metadata.usageCount = 0;
      newPrompt.metadata.created = new Date();
      newPrompt.metadata.modified = new Date();

      // Preserve original order if present, otherwise storage.save will assign it
      // This is crucial for maintaining relative order within the imported collection
      if (originalPrompt.order !== undefined) {
        newPrompt.order = originalPrompt.order;
      }

      await this.storage.save(newPrompt);
      importedCategories.add(newCategoryName);
    }
    return Array.from(importedCategories);
  }

  /**
   * Share a collection of prompts.
   *
   * @param categoryToShare - Optional category name to share. If not provided, shows quick pick.
   * @param authService - Optional auth service for authentication. Uses injected service if not provided.
   */
  async shareCollection(categoryToShare?: string, authService?: AuthService): Promise<void> {
    await this.ensureInitialized();

    let promptsToShare: Prompt[] = [];
    let selectedCategoryLabel: string;

    if (categoryToShare) {
      promptsToShare = await this.storage.list({ category: categoryToShare });
      selectedCategoryLabel = categoryToShare;
    } else {
      const allCategories = await this.storage.getAllCategories();
      if (allCategories.length === 0) {
        vscode.window.showInformationMessage('No categories to share');
        return;
      }

      const quickPickItems: vscode.QuickPickItem[] = allCategories.map((category) => ({
        label: category,
        description: 'Category',
      }));

      quickPickItems.unshift({
        label: 'All Categories',
        description: 'Share all prompts across all categories',
        alwaysShow: true,
      });

      const selectedItem = await vscode.window.showQuickPick(quickPickItems, {
        placeHolder: 'Select categories to share',
        ignoreFocusOut: true,
      });

      if (!selectedItem) {
        vscode.window.showInformationMessage('Share collection cancelled.');
        return;
      }

      selectedCategoryLabel = selectedItem.label;

      if (selectedItem.label === 'All Categories') {
        promptsToShare = await this.storage.list({});
      } else {
        promptsToShare = await this.storage.list({ category: selectedItem.label as string });
      }
    }

    if (promptsToShare.length === 0) {
      vscode.window.showInformationMessage(`No prompts found in ${selectedCategoryLabel}.`);
      return;
    }

    const auth = authService || this.authService;
    if (!auth) {
      throw new Error('AuthService not provided. This method requires dependency injection.');
    }
    const accessToken = await auth.getValidAccessToken();
    if (!accessToken) {
      vscode.window.showErrorMessage('You must be logged in to share collections.');
      return;
    }
    const shareResult = await createShareMulti(promptsToShare, accessToken, auth);
    vscode.env.clipboard.writeText(shareResult.url);
    vscode.window.showInformationMessage(
      'Collection share link copied to clipboard! Expires in 24h.'
    );
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Version Management
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Get device information for version attribution
   * Uses sync state if available, otherwise generates from machine info
   */
  private async getDeviceInfo(): Promise<{ deviceId: string; deviceName: string }> {
    const os = await import('os');

    // Use VS Code's stable machine ID
    const deviceId = vscode.env.machineId;

    // Generate human-readable device name
    const hostname = os.hostname();
    const platform = os.platform();
    const deviceName = `${hostname} (${platform})`;

    return { deviceId, deviceName };
  }

  /**
   * Determine if a new version should be created based on strategy
   */
  private shouldCreateVersion(prompt: Prompt, strategy: string): boolean {
    const config = vscode.workspace.getConfiguration('promptBank.versioning');

    switch (strategy) {
      case 'on-save':
        // Always create version on explicit save
        return true;

      case 'time-debounce': {
        const debounceMinutes = config.get<number>('debounceMinutes', 5);
        const { getCurrentVersion } = require('../models/prompt');
        const lastVersion = getCurrentVersion(prompt);

        if (!lastVersion) {
          return true;
        }

        const minutesSinceLastVersion =
          (Date.now() - lastVersion.timestamp.getTime()) / (1000 * 60);

        return minutesSinceLastVersion >= debounceMinutes;
      }

      case 'manual':
        // User must explicitly request version creation
        return false;

      default:
        return true;
    }
  }

  /**
   * Prune old versions to prevent storage bloat
   * Keeps most recent N versions based on config
   */
  private async pruneVersions(prompt: Prompt): Promise<void> {
    const config = vscode.workspace.getConfiguration('promptBank.versioning');
    const maxVersions = config.get<number>('maxVersions', 10);

    if (prompt.versions.length <= maxVersions) {
      return; // No pruning needed
    }

    // Sort by timestamp (oldest first)
    prompt.versions.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    // Keep only the most recent N versions
    const removedCount = prompt.versions.length - maxVersions;
    prompt.versions = prompt.versions.slice(-maxVersions);

    console.log(
      `[PromptService] Pruned ${removedCount} old versions for prompt "${prompt.title}". ` +
        `Kept ${maxVersions} most recent.`
    );
  }

  /**
   * Create a new version snapshot (called before modifying prompt)
   * Returns true if version was created, false if skipped
   */
  async createVersion(
    prompt: Prompt,
    strategy: 'on-save' | 'time-debounce' | 'manual' = 'on-save',
    changeReason?: string
  ): Promise<boolean> {
    const config = vscode.workspace.getConfiguration('promptBank.versioning');
    const enabled = config.get<boolean>('enabled', true);

    if (!enabled) {
      return false;
    }

    // Check if we should create a version based on strategy
    const shouldCreate = this.shouldCreateVersion(prompt, strategy);
    if (!shouldCreate) {
      return false;
    }

    // Get device info
    const deviceInfo = await this.getDeviceInfo();

    // Import at runtime to avoid circular dependencies
    const { generateUUID } = await import('../models/prompt');

    // Create version snapshot of CURRENT state
    const newVersion: import('../models/prompt').PromptVersion = {
      versionId: generateUUID(),
      timestamp: new Date(),
      deviceId: deviceInfo.deviceId,
      deviceName: deviceInfo.deviceName,
      content: prompt.content,
      title: prompt.title,
      category: prompt.category,
    };

    // Add optional properties
    if (prompt.description !== undefined) {
      newVersion.description = prompt.description;
    }
    if (changeReason !== undefined) {
      newVersion.changeReason = changeReason;
    }

    // Add to version history
    prompt.versions.push(newVersion);

    // Apply pruning
    await this.pruneVersions(prompt);

    console.log(
      `[PromptService] Created version for prompt "${prompt.title}" ` +
        `(v${prompt.versions.length}) on device ${deviceInfo.deviceName}`
    );

    return true;
  }

  /**
   * Get version history for a prompt
   */
  async getVersionHistory(promptId: string): Promise<import('../models/prompt').PromptVersion[]> {
    await this.ensureInitialized();

    const prompt = await this.storage.load(promptId);
    if (!prompt) {
      throw new Error(`Prompt not found: ${promptId}`);
    }

    // Return sorted by timestamp (newest first for display)
    return [...prompt.versions].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Restore a specific version (creates new version with restored content)
   */
  async restoreVersion(promptId: string, versionId: string): Promise<Prompt> {
    await this.ensureInitialized();

    const prompt = await this.storage.load(promptId);
    if (!prompt) {
      throw new Error(`Prompt not found: ${promptId}`);
    }

    const versionToRestore = prompt.versions.find((v) => v.versionId === versionId);
    if (!versionToRestore) {
      throw new Error(`Version not found: ${versionId}`);
    }

    const { getVersionNumber, getDisplayVersionNumber } = await import('../models/prompt');
    const versionNumber = getVersionNumber(prompt, versionId);

    // Confirm restoration
    const confirmation = await vscode.window.showWarningMessage(
      `Restore version ${versionNumber} from ${versionToRestore.timestamp.toLocaleString()}?\n\n` +
        `This will create a new version with the restored content.`,
      { modal: true },
      'Restore'
    );

    if (confirmation !== 'Restore') {
      return prompt;
    }

    // Create version snapshot BEFORE restoration (captures current state being replaced)
    await this.createVersion(prompt, 'on-save', `Before restoring v${versionNumber}`);

    // Restore content from version (this modifies the current content)
    prompt.content = versionToRestore.content;
    prompt.title = versionToRestore.title;
    prompt.category = versionToRestore.category;
    prompt.metadata.modified = new Date();

    // Handle optional description
    if (versionToRestore.description !== undefined) {
      prompt.description = versionToRestore.description;
    } else {
      delete prompt.description;
    }

    await this.storage.update(prompt);

    const newVersionNumber = getDisplayVersionNumber(prompt);
    vscode.window.showInformationMessage(
      `Restored version ${versionNumber} as v${newVersionNumber}`
    );

    return prompt;
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
    const existingCategories = [...new Set(prompts.map((p) => p.category))];

    const predefinedCategories = ['General', 'Architecture', 'UI/UX', 'Testing'];

    // Combine and deduplicate categories
    const allCategories = [...new Set([...predefinedCategories, ...existingCategories])];

    const items = [
      ...allCategories.map((cat) => ({ label: cat, description: 'Existing category' })),
      { label: '$(plus) Create New Category', description: 'Create a new category' },
    ];

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select or create a category',
      matchOnDescription: false,
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
        },
      });
      return newCategory?.trim() || null;
    }

    return selected.label;
  }

  private detectProjectType(fileName: string): string | undefined {
    // Simple project type detection based on file patterns
    if (fileName.includes('package.json')) return 'Node.js';
    if (fileName.includes('Cargo.toml')) return 'Rust';
    if (fileName.includes('requirements.txt') || fileName.includes('pyproject.toml'))
      return 'Python';
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
    prompts.forEach((prompt) => {
      prompt.category = newName;
      prompt.metadata.modified = new Date();
    });
    // Persist each updated prompt sequentially to avoid race conditions
    for (const prompt of prompts) {
      await this.storage.update(prompt);
    }
    return prompts.length;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Lifecycle Management
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Dispose of this service and clean up resources
   *
   * Should be called when the workspace is closed or the extension is deactivated.
   * Clears initialization state but does NOT delete data from storage.
   */
  async dispose(): Promise<void> {
    // Clear initialization flag
    this.isInitialized = false;

    // Note: We don't dispose the storage provider since it's injected
    // and may be shared across multiple services
  }
}

// Export singleton instance
export const promptService = new PromptService();
