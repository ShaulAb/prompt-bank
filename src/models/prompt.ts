import { randomUUID } from 'crypto';

/**
 * Version snapshot of a prompt at a specific point in time
 * Used for version history and restoration
 */
export interface PromptVersion {
  /** Unique version identifier (UUID) - unique across all devices */
  versionId: string;

  /** When this version was created (authoritative ordering) */
  timestamp: Date;

  /** Device that created this version (stable machine ID) */
  deviceId: string;

  /** Device name for display (e.g., "MacBook Pro (darwin)") */
  deviceName: string;

  /** Snapshot of prompt state at this version */
  content: string;
  title: string;
  description?: string;
  category: string;

  /** Optional user-provided reason for change */
  changeReason?: string;
}

/**
 * Core prompt model with extensible structure for future features
 */
export interface Prompt {
  /** Unique identifier for the prompt */
  id: string;

  /** Human-readable title for the prompt */
  title: string;

  /** The actual prompt content */
  content: string;

  /** Optional description explaining the prompt's purpose */
  description?: string;

  /** Category for organization (e.g., "Code Review", "Documentation") */
  category: string;

  /** Order of the prompt within its category (for drag & drop) */
  order?: number;

  /** Order of the category this prompt belongs to (for category drag & drop) */
  categoryOrder?: number;

  /** Template variables found in the content (e.g., {{filename}}) */
  variables: TemplateVariable[];

  /** Metadata for analytics and future features */
  metadata: PromptMetadata;

  /** Version history (sorted by timestamp, oldest first) */
  versions: PromptVersion[];
}

/**
 * Template variable definition
 */
export interface TemplateVariable {
  /** Variable name (without braces) */
  name: string;

  /** Variable type for validation and UI hints */
  type: 'text' | 'filename' | 'selection' | 'language' | 'custom';

  /** Optional default value */
  defaultValue?: string;

  /** Human-readable description */
  description?: string;
}

/**
 * Prompt metadata for tracking and future features
 */
export interface PromptMetadata {
  /** When the prompt was created */
  created: Date;

  /** When the prompt was last modified */
  modified: Date;

  /** How many times the prompt has been used */
  usageCount: number;

  /** Last time the prompt was used */
  lastUsed?: Date;

  /** File context where prompt was created (future: smart suggestions) */
  context?: FileContext;
}

/**
 * File context for intelligent prompt suggestions
 */
export interface FileContext {
  /** File extension (e.g., "ts", "py", "md") */
  fileExtension: string;

  /** Programming language detected */
  language: string;

  /** Project type if detectable */
  projectType?: string | undefined;
}

/**
 * Create a new prompt with default values
 */
export function createPrompt(
  title: string,
  content: string,
  category: string = 'General',
  description?: string // Add description as an optional parameter
): Prompt {
  const newPrompt: Prompt = {
    id: generateId(),
    title,
    content,
    category,
    variables: extractVariables(content),
    metadata: {
      created: new Date(),
      modified: new Date(),
      usageCount: 0,
    },
    versions: [], // Initialize with empty version history
  };

  if (description !== undefined) {
    newPrompt.description = description;
  }

  return newPrompt;
}

/**
 * Get the current (most recent) version of a prompt
 * Returns undefined if no versions exist
 */
export function getCurrentVersion(prompt: Prompt): PromptVersion | undefined {
  if (prompt.versions.length === 0) {
    return undefined;
  }
  return prompt.versions[prompt.versions.length - 1];
}

/**
 * Get the display version number for a specific version ID
 * Version numbers are 1-indexed (v1, v2, v3, ...)
 * Returns 0 if version not found
 */
export function getVersionNumber(prompt: Prompt, versionId: string): number {
  const index = prompt.versions.findIndex((v) => v.versionId === versionId);
  return index === -1 ? 0 : index + 1;
}

/**
 * Get the current display version number (total version count)
 * Returns 0 if no versions exist
 */
export function getDisplayVersionNumber(prompt: Prompt): number {
  return prompt.versions.length;
}

/**
 * Generate a UUID v4 using Node.js crypto module
 * Available in Node.js 14.17.0+ and 15.6.0+
 */
export function generateUUID(): string {
  return randomUUID();
}

/**
 * Extract template variables from prompt content
 */
export function extractVariables(content: string): TemplateVariable[] {
  const variableRegex = /\{\{(\w+)\}\}/g;
  const variables: TemplateVariable[] = [];
  const found = new Set<string>();

  let match;
  while ((match = variableRegex.exec(content)) !== null) {
    const varName = match[1];
    if (!found.has(varName)) {
      found.add(varName);
      variables.push({
        name: varName,
        type: getVariableType(varName),
        description: getVariableDescription(varName),
      });
    }
  }

  return variables;
}

/**
 * Determine variable type based on common naming patterns
 */
function getVariableType(name: string): TemplateVariable['type'] {
  const lowerName = name.toLowerCase();

  if (lowerName.includes('file') || lowerName.includes('name')) {
    return 'filename';
  }
  if (lowerName.includes('select') || lowerName.includes('text')) {
    return 'selection';
  }
  if (lowerName.includes('lang')) {
    return 'language';
  }

  return 'text';
}

/**
 * Get human-readable description for common variables
 */
function getVariableDescription(name: string): string {
  const descriptions: Record<string, string> = {
    filename: 'Current file name',
    selectedText: 'Currently selected text',
    language: 'Current file language',
    projectName: 'Current project name',
  };

  return descriptions[name] || `Variable: ${name}`;
}

/**
 * Generate a unique ID for prompts
 */
function generateId(): string {
  return `prompt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Category model for drag & drop reordering
 */
export interface Category {
  /** Category name */
  name: string;
  /** Order of the category (for drag & drop) */
  order: number;
}
