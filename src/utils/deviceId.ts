/**
 * Device identification utilities for sync feature
 *
 * Generates stable device IDs that persist across sessions by storing in VS Code global state.
 * Uses cryptographic hashing to ensure uniqueness per device + user + editor combination.
 */

import { createHash } from 'crypto';
import * as os from 'os';
import * as vscode from 'vscode';
import type { DeviceInfo } from '../models/syncState';

const DEVICE_ID_KEY = 'promptBank.sync.deviceId';
const DEVICE_NAME_KEY = 'promptBank.sync.deviceName';

/**
 * Generate or retrieve stable device ID
 *
 * CRITICAL: Device ID must be stable across sessions to prevent
 * creating new cloud entries on every sync.
 *
 * @param context - VS Code extension context for global state storage
 * @returns Stable 16-character device ID
 */
export const generateDeviceId = (context: vscode.ExtensionContext): string => {
  // Check global state first (stable across sessions)
  const existingId = context.globalState.get<string>(DEVICE_ID_KEY);
  if (existingId) {
    return existingId;
  }

  // Generate new stable device ID from system properties
  const hostname = os.hostname();
  const username = os.userInfo().username;
  const appName = vscode.env.appName; // "Visual Studio Code" or "Cursor"

  // Create SHA256 hash and take first 16 characters
  const deviceId = createHash('sha256')
    .update(`${hostname}:${username}:${appName}`)
    .digest('hex')
    .substring(0, 16);

  // Store in global state for future sessions
  void context.globalState.update(DEVICE_ID_KEY, deviceId);

  return deviceId;
};

/**
 * Get user-friendly device name for conflict resolution UI
 *
 * Auto-detects platform and formats as: "hostname (Platform)"
 * Examples: "MacBook-Pro (Mac)", "DESKTOP-ABC (Windows)", "ubuntu (Linux)"
 *
 * @returns Human-readable device name
 */
export const getDeviceName = (): string => {
  const hostname = os.hostname();
  const platform = os.platform();

  switch (platform) {
    case 'darwin':
      return `${hostname} (Mac)`;
    case 'win32':
      return `${hostname} (Windows)`;
    case 'linux':
      return `${hostname} (Linux)`;
    default:
      return hostname;
  }
};

/**
 * Get or generate custom device name from user preferences
 *
 * Allows users to override auto-detected device name for better
 * conflict resolution (e.g., "Work Laptop" vs "MacBook-Pro (Mac)")
 *
 * @param context - VS Code extension context for global state storage
 * @returns Custom or auto-detected device name
 */
export const getOrCreateDeviceName = async (context: vscode.ExtensionContext): Promise<string> => {
  // Check if user has set a custom device name
  const customName = context.globalState.get<string>(DEVICE_NAME_KEY);
  if (customName) {
    return customName;
  }

  // Use auto-detected name
  const autoName = getDeviceName();
  await context.globalState.update(DEVICE_NAME_KEY, autoName);

  return autoName;
};

/**
 * Set custom device name for this installation
 *
 * @param context - VS Code extension context
 * @param name - Custom device name
 */
export const setDeviceName = async (
  context: vscode.ExtensionContext,
  name: string
): Promise<void> => {
  await context.globalState.update(DEVICE_NAME_KEY, name);
};

/**
 * Get complete device information
 *
 * @param context - VS Code extension context
 * @returns Device info including ID, name, platform, and hostname
 */
export const getDeviceInfo = async (context: vscode.ExtensionContext): Promise<DeviceInfo> => {
  const id = generateDeviceId(context);
  const name = await getOrCreateDeviceName(context);
  const platform = os.platform() as 'win32' | 'darwin' | 'linux';
  const hostname = os.hostname();

  return {
    id,
    name,
    platform,
    hostname,
  };
};

/**
 * Clear device ID and name (useful for testing or reset)
 *
 * @param context - VS Code extension context
 */
export const clearDeviceInfo = async (context: vscode.ExtensionContext): Promise<void> => {
  await context.globalState.update(DEVICE_ID_KEY, undefined);
  await context.globalState.update(DEVICE_NAME_KEY, undefined);
};
