/**
 * Content hashing utilities for conflict detection
 *
 * Uses SHA256 to create stable, collision-resistant hashes of prompt content.
 * This prevents false conflicts from timestamp-only comparisons and catches
 * same-second edits on different devices.
 */

import { createHash } from 'crypto';
import type { Prompt } from '../models/prompt';

/**
 * Compute SHA256 hash of prompt content for conflict detection
 *
 * CRITICAL: Only includes content-relevant fields (title, content, category).
 * Does NOT include metadata like timestamps, usage count, or IDs.
 *
 * Uses canonical JSON representation to ensure consistent hashing:
 * - Fields are trimmed to ignore whitespace differences
 * - Fields are always in the same order
 * - JSON serialization is deterministic
 *
 * @param prompt - Prompt to hash
 * @returns SHA256 hash as hex string (64 characters)
 *
 * @example
 * ```ts
 * const hash1 = computeContentHash(prompt);
 * const hash2 = computeContentHash(modifiedPrompt);
 * const hasChanged = hash1 !== hash2;
 * ```
 */
export const computeContentHash = (prompt: Prompt): string => {
  // Canonical representation - order matters for consistent hashing
  // CRITICAL: Must match web's implementation in promptbank-website/src/lib/utils/content-hash.ts
  const canonical = JSON.stringify({
    title: prompt.title.trim(),
    content: prompt.content.trim(),
    category: (prompt.category || '').trim(), // Handle null/undefined to match web
    // Note: We intentionally exclude:
    // - metadata (created, modified, usageCount) - these change frequently
    // - variables - these are derived from content
    // - id - different on each device
    // - description - optional, not core to prompt identity
  });

  return createHash('sha256').update(canonical, 'utf8').digest('hex');
};

/**
 * Compare two prompts by content hash
 *
 * @param prompt1 - First prompt
 * @param prompt2 - Second prompt
 * @returns true if prompts have identical content
 *
 * @example
 * ```ts
 * if (haveSameContent(localPrompt, remotePrompt)) {
 *   // Content identical, timestamps may differ
 * }
 * ```
 */
export const haveSameContent = (prompt1: Prompt, prompt2: Prompt): boolean => {
  return computeContentHash(prompt1) === computeContentHash(prompt2);
};

/**
 * Verify if a prompt's content matches a known hash
 *
 * Useful for checking if content has changed since last sync
 *
 * @param prompt - Prompt to check
 * @param expectedHash - Expected content hash (from sync state)
 * @returns true if content matches expected hash
 *
 * @example
 * ```ts
 * const syncInfo = await getSyncInfo(promptId);
 * const hasChangedSinceSync = !matchesHash(prompt, syncInfo.lastSyncedContentHash);
 * ```
 */
export const matchesHash = (prompt: Prompt, expectedHash: string): boolean => {
  return computeContentHash(prompt) === expectedHash;
};

/**
 * Batch compute content hashes for multiple prompts
 *
 * More efficient than calling computeContentHash in a loop
 *
 * @param prompts - Array of prompts
 * @returns Map of promptId → contentHash
 *
 * @example
 * ```ts
 * const hashes = computeContentHashes(allPrompts);
 * const hash = hashes.get(promptId);
 * ```
 */
export const computeContentHashes = (prompts: readonly Prompt[]): ReadonlyMap<string, string> => {
  const hashMap = new Map<string, string>();

  for (const prompt of prompts) {
    hashMap.set(prompt.id, computeContentHash(prompt));
  }

  return hashMap;
};
