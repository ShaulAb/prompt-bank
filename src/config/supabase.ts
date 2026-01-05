/**
 * Supabase Configuration
 *
 * Single source of truth for Supabase connection settings.
 * All services should import from this module rather than
 * defining their own defaults.
 */

import * as vscode from 'vscode';

/**
 * Default Supabase configuration values
 *
 * These point to the unified prompt-bank-website project
 * which serves both the website and VS Code extension.
 */
export const SUPABASE_DEFAULTS = {
  /** Supabase project URL */
  url: 'https://ejolajleumgrgnmygxmz.supabase.co',

  /**
   * Publishable API key (replaces legacy anon key)
   *
   * Safe to expose in client-side code - security is enforced
   * via Row Level Security (RLS) policies, not key secrecy.
   *
   * @see https://supabase.com/docs/guides/api/api-keys
   */
  publishableKey: 'sb_publishable_4YWhPqX2HleOm9-vCKVSEA_daIYTGwZ',

  /** Base URL for public share links */
  publicShareBase: 'https://prestissimo.ai/share/',
} as const;

/**
 * Get Supabase configuration from VS Code settings with defaults
 *
 * Users can override these values via VS Code settings:
 * - promptBank.supabaseUrl
 * - promptBank.supabaseAnonKey (kept for backward compatibility)
 * - promptBank.publicShareBase
 *
 * @returns Supabase configuration object
 */
export function getSupabaseConfig() {
  const cfg = vscode.workspace.getConfiguration('promptBank');

  return {
    url: cfg.get<string>('supabaseUrl', SUPABASE_DEFAULTS.url),
    // Setting name kept as 'supabaseAnonKey' for backward compatibility
    // with existing user configurations, but now uses publishable key
    publishableKey: cfg.get<string>('supabaseAnonKey', SUPABASE_DEFAULTS.publishableKey),
    publicShareBase: cfg.get<string>('publicShareBase', SUPABASE_DEFAULTS.publicShareBase),
  };
}
