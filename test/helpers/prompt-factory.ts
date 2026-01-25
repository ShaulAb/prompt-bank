/**
 * Test helper factory for creating prompts with ergonomic object syntax
 *
 * This provides a more developer-friendly interface for tests while
 * maintaining compatibility with the actual createPrompt() function.
 */

import { createPrompt as baseCreatePrompt, DEFAULT_CATEGORY } from '../../src/models/prompt';
import type { Prompt } from '../../src/models/prompt';

/**
 * Prompt creation options for tests
 */
export interface PromptOptions {
  id?: string;
  title: string;
  content: string;
  category?: string;
  description?: string;
}

/**
 * Create a prompt using object syntax for better test ergonomics
 *
 * @example
 * ```ts
 * const prompt = createPrompt({ title: 'Test', content: 'Content', category: 'Cat' });
 * const promptWithId = createPrompt({ id: 'custom-id', title: 'Test', content: 'Content' });
 * ```
 */
export function createPrompt(options: PromptOptions): Prompt {
  const prompt = baseCreatePrompt(
    options.title,
    options.content,
    options.category || DEFAULT_CATEGORY,
    options.description
  );

  // Override ID if provided (useful for conflict resolution tests)
  if (options.id) {
    prompt.id = options.id;
  }

  return prompt;
}
