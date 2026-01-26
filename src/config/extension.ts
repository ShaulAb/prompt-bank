/**
 * Extension Configuration
 *
 * Provides extension metadata like version and name.
 * Used for User-Agent headers and logging.
 */

import * as vscode from 'vscode';

/** Extension identifiers */
const EXTENSION_PUBLISHER = 'prestissimo';
const EXTENSION_NAME = 'prompt-bank';
const EXTENSION_ID = `${EXTENSION_PUBLISHER}.${EXTENSION_NAME}`;

/**
 * Get the current extension version from package.json
 *
 * Uses VS Code API to read version at runtime, avoiding hardcoded values.
 * Falls back to '0.0.0' if extension is not found (should never happen in production).
 *
 * @returns Semantic version string (e.g., '0.10.0')
 */
export function getExtensionVersion(): string {
  const extension = vscode.extensions.getExtension(EXTENSION_ID);
  return extension?.packageJSON?.version ?? '0.0.0';
}

/**
 * Get the User-Agent string for HTTP requests
 *
 * Format: PromptBank-VSCode/{version}
 * Used for API requests to identify the client.
 *
 * @returns User-Agent string (e.g., 'PromptBank-VSCode/0.10.0')
 */
export function getUserAgent(): string {
  return `PromptBank-VSCode/${getExtensionVersion()}`;
}
