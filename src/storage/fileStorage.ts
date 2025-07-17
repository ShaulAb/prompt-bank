import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as vscode from 'vscode';
import { Prompt } from '../models/prompt';
import { IStorageProvider, PromptFilter, StorageStats, StorageConfig } from './interfaces';

/**
 * File-based storage provider using JSON files
 * Stores prompts in .vscode/prompt-bank/ directory
 */
export class FileStorageProvider implements IStorageProvider {
  private storagePath: string;
  private isInitialized = false;
  
  constructor(private config?: Partial<StorageConfig>) {
    if (config?.storagePath) {
      this.storagePath = config.storagePath;
    } else {
      // Store in workspace .vscode folder if workspace exists, otherwise in global location
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      
      if (workspaceFolder) {
        this.storagePath = path.join(workspaceFolder.uri.fsPath, '.vscode', 'prompt-bank');
      } else {
        // Use VS Code's global storage path as fallback
        this.storagePath = path.join(os.homedir(), '.vscode-prompt-bank');
      }
    }
  }
  
  async initialize(): Promise<void> {
    try {
      // Create storage directory if it doesn't exist
      await fs.mkdir(this.storagePath, { recursive: true });
      
      // Create prompts.json if it doesn't exist
      const promptsFile = path.join(this.storagePath, 'prompts.json');
      try {
        await fs.access(promptsFile);
      } catch {
        await fs.writeFile(promptsFile, JSON.stringify([], null, 2));
      }
      
      // Create metadata file for future use
      const metadataFile = path.join(this.storagePath, 'metadata.json');
      try {
        await fs.access(metadataFile);
      } catch {
        const metadata = {
          version: '1.0.0',
          created: new Date().toISOString(),
          lastModified: new Date().toISOString()
        };
        await fs.writeFile(metadataFile, JSON.stringify(metadata, null, 2));
      }
      
      this.isInitialized = true;
    } catch (error) {
      throw new Error(`Failed to initialize file storage: ${error}`);
    }
  }
  
  async save(prompt: Prompt): Promise<void> {
    await this.ensureInitialized();
    
    const prompts = await this.loadAllPrompts();
    
    // Check if prompt already exists (update case)
    const existingIndex = prompts.findIndex(p => p.id === prompt.id);
    
    if (existingIndex >= 0) {
      // Update existing prompt
      prompts[existingIndex] = { ...prompt, metadata: { ...prompt.metadata, modified: new Date() } };
    } else {
      // Add new prompt
      prompts.push(prompt);
    }
    
    await this.saveAllPrompts(prompts);
  }
  
  async load(id: string): Promise<Prompt | null> {
    await this.ensureInitialized();
    
    const prompts = await this.loadAllPrompts();
    return prompts.find(p => p.id === id) || null;
  }
  
  async list(filter?: PromptFilter): Promise<Prompt[]> {
    await this.ensureInitialized();
    
    let prompts = await this.loadAllPrompts();
    
    // Apply filters
    if (filter) {
      if (filter.category) {
        prompts = prompts.filter(p => p.category === filter.category);
      }
      
      if (filter.tags && filter.tags.length > 0) {
        prompts = prompts.filter(p => 
          filter.tags!.every(tag => p.tags.includes(tag))
        );
      }
      
      if (filter.search) {
        const searchLower = filter.search.toLowerCase();
        prompts = prompts.filter(p => 
          p.title.toLowerCase().includes(searchLower) ||
          p.content.toLowerCase().includes(searchLower) ||
          (p.description && p.description.toLowerCase().includes(searchLower))
        );
      }
      
      // Sort results
      if (filter.sortBy) {
        const effectiveSortOrder = filter.sortOrder || 'desc'; // Default to 'desc' if not specified
        prompts.sort((a, b) => {
          let aVal: any, bVal: any;
          
          switch (filter.sortBy) {
            case 'created':
              aVal = new Date(a.metadata.created).getTime();
              bVal = new Date(b.metadata.created).getTime();
              break;
            case 'modified':
              aVal = new Date(a.metadata.modified).getTime();
              bVal = new Date(b.metadata.modified).getTime();
              break;
            case 'title':
              aVal = a.title.toLowerCase();
              bVal = b.title.toLowerCase();
              break;
            case 'usageCount':
              aVal = a.metadata.usageCount;
              bVal = b.metadata.usageCount;
              break;
            default:
              return 0;
          }
          
          const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
          return effectiveSortOrder === 'desc' ? -comparison : comparison;
        });
      }
      
      // Apply limit
      if (filter.limit && filter.limit > 0) {
        prompts = prompts.slice(0, filter.limit);
      }
    }
    
    return prompts;
  }
  
  async delete(id: string): Promise<boolean> {
    await this.ensureInitialized();
    
    const prompts = await this.loadAllPrompts();
    const initialLength = prompts.length;
    
    const filteredPrompts = prompts.filter(p => p.id !== id);
    
    if (filteredPrompts.length < initialLength) {
      await this.saveAllPrompts(filteredPrompts);
      return true;
    }
    
    return false;
  }
  
  async update(prompt: Prompt): Promise<void> {
    // Update is the same as save for file storage
    await this.save(prompt);
  }
  
  async isAvailable(): Promise<boolean> {
    try {
      await this.ensureInitialized();
      // Try to write a test file
      const testFile = path.join(this.storagePath, '.test');
      await fs.writeFile(testFile, 'test');
      await fs.unlink(testFile);
      return true;
    } catch {
      return false;
    }
  }
  
  async getStats(): Promise<StorageStats> {
    await this.ensureInitialized();
    
    const prompts = await this.loadAllPrompts();
    const categories = new Set(prompts.map(p => p.category));
    
    // Calculate total storage size
    const promptsFile = path.join(this.storagePath, 'prompts.json');
    const stats = await fs.stat(promptsFile);
    
    // Get most used prompts
    const mostUsed = prompts
      .sort((a, b) => b.metadata.usageCount - a.metadata.usageCount)
      .slice(0, 5)
      .map(p => ({
        id: p.id,
        title: p.title,
        usageCount: p.metadata.usageCount
      }));
    
    return {
      totalPrompts: prompts.length,
      totalSize: stats.size,
      categoriesCount: categories.size,
      mostUsed,
      health: 'healthy' // Could add more sophisticated health checks
    };
  }
  
  /**
   * Get the storage path for debugging
   */
  getStoragePath(): string {
    return this.storagePath;
  }
  
  // Private helper methods
  
  private async ensureInitialized(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }
  }
  
  public async loadAllPrompts(): Promise<Prompt[]> {
    const promptsFile = path.join(this.storagePath, 'prompts.json');
    
    try {
      const data = await fs.readFile(promptsFile, 'utf-8');
      const prompts = JSON.parse(data);
      
      // Convert date strings back to Date objects
      return prompts.map((p: any) => ({
        ...p,
        metadata: {
          ...p.metadata,
          created: new Date(p.metadata.created),
          modified: new Date(p.metadata.modified),
          lastUsed: p.metadata.lastUsed ? new Date(p.metadata.lastUsed) : undefined
        }
      }));
    } catch (error) {
      // Log error for debugging in development
      if (process.env.NODE_ENV === 'development') {
        console.error('Error loading prompts:', error);
      }
      return [];
    }
  }
  
  private async saveAllPrompts(prompts: Prompt[]): Promise<void> {
    const promptsFile = path.join(this.storagePath, 'prompts.json');
    
    try {
      await fs.writeFile(promptsFile, JSON.stringify(prompts, null, 2));
      
      // Update metadata
      const metadataFile = path.join(this.storagePath, 'metadata.json');
      const metadata = {
        version: '1.0.0',
        created: new Date().toISOString(),
        lastModified: new Date().toISOString(),
        totalPrompts: prompts.length
      };
      await fs.writeFile(metadataFile, JSON.stringify(metadata, null, 2));
    } catch (error) {
      throw new Error(`Failed to save prompts: ${error}`);
    }
  }
} 