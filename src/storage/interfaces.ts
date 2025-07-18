import { Prompt } from '../models/prompt';

/**
 * Abstract storage interface for future-proof data persistence
 * Allows easy migration from JSON files → workspace storage → cloud sync
 */
export interface IStorageProvider {
  /**
   * Initialize the storage provider
   */
  initialize(): Promise<void>;

  /**
   * Save a prompt to storage
   */
  save(prompt: Prompt): Promise<void>;

  /**
   * Load a specific prompt by ID
   */
  load(id: string): Promise<Prompt | null>;

  /**
   * List all prompts with optional filtering
   */
  list(filter?: PromptFilter): Promise<Prompt[]>;

  /**
   * Delete a prompt by ID
   */
  delete(id: string): Promise<boolean>;

  /**
   * Update an existing prompt
   */
  update(prompt: Prompt): Promise<void>;

  /**
   * Check if storage is available and writable
   */
  isAvailable(): Promise<boolean>;

  /**
   * Get storage statistics
   */
  getStats(): Promise<StorageStats>;

  /**
   * Get all categories
   */
  getAllCategories(): Promise<string[]>;
}

/**
 * Filter options for listing prompts
 */
export interface PromptFilter {
  /** Filter by category */
  category?: string;



  /** Search in title and content */
  search?: string;

  /** Limit number of results */
  limit?: number;

  /** Sort order */
  sortBy?: 'created' | 'modified' | 'title' | 'usageCount';

  /** Sort direction */
  sortOrder?: 'asc' | 'desc';
}

/**
 * Storage statistics for monitoring and debugging
 */
export interface StorageStats {
  /** Total number of prompts */
  totalPrompts: number;

  /** Total storage size in bytes */
  totalSize: number;

  /** Number of categories */
  categoriesCount: number;

  /** Most used prompts */
  mostUsed: Array<{ id: string; title: string; usageCount: number }>;

  /** Storage health status */
  health: 'healthy' | 'warning' | 'error';

  /** Last backup timestamp (for future cloud sync) */
  lastBackup?: Date;
}

/**
 * Storage configuration options
 */
export interface StorageConfig {
  /** Storage location path */
  storagePath: string;

  /** Enable automatic backups */
  autoBackup: boolean;

  /** Backup interval in minutes */
  backupInterval: number;

  /** Maximum number of backups to keep */
  maxBackups: number;

  /** Enable compression for storage */
  enableCompression: boolean;
}

/**
 * Storage events for monitoring and analytics
 */
export interface StorageEvents {
  onPromptSaved: (prompt: Prompt) => void;
  onPromptDeleted: (id: string) => void;
  onPromptUsed: (prompt: Prompt) => void;
  onStorageError: (error: Error) => void;
}
