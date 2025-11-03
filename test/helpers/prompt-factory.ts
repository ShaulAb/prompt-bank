/**
 * Test helper factory for creating prompts with ergonomic object syntax
 *
 * This provides a more developer-friendly interface for tests while
 * maintaining compatibility with the actual createPrompt() function.
 */

import { createPrompt as baseCreatePrompt } from '../../src/models/prompt';
import type { Prompt } from '../../src/models/prompt';

/**
 * Prompt creation options for tests
 */
export interface PromptOptions {
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
 * ```
 */
export function createPrompt(options: PromptOptions): Prompt {
  return baseCreatePrompt(
    options.title,
    options.content,
    options.category || 'General',
    options.description
  );
}
