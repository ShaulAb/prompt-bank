/**
 * Workspace ID validation utilities
 *
 * Validates workspace IDs used for sync isolation.
 * Accepts both:
 * - Standard UUIDs (v4): for new workspaces
 * - Legacy marker: for prompts created before workspace isolation
 */

import { LEGACY_WORKSPACE_ID } from '../models/workspaceMetadata';

/**
 * UUID validation regex
 * Matches standard UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validate workspace ID format
 *
 * Accepts:
 * - Standard UUID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
 * - Legacy marker: 'legacy-pre-workspace-isolation'
 *
 * @param workspaceId - Workspace ID to validate
 * @returns True if valid format
 *
 * @example
 * isValidWorkspaceId('c7e95c7b-f44c-4566-a814-b92518a87c07') // true
 * isValidWorkspaceId('legacy-pre-workspace-isolation') // true
 * isValidWorkspaceId('invalid') // false
 */
export function isValidWorkspaceId(workspaceId: string): boolean {
  if (!workspaceId || typeof workspaceId !== 'string') {
    return false;
  }

  // Accept legacy workspace ID for pre-v0.8.0 prompts
  if (workspaceId === LEGACY_WORKSPACE_ID) {
    return true;
  }

  // Accept standard UUID format
  return UUID_REGEX.test(workspaceId);
}

/**
 * Check if workspace ID is the legacy marker
 *
 * @param workspaceId - Workspace ID to check
 * @returns True if this is the legacy workspace ID
 */
export function isLegacyWorkspaceId(workspaceId: string): boolean {
  return workspaceId === LEGACY_WORKSPACE_ID;
}
