/**
 * Supabase client singleton
 *
 * Provides a single, shared Supabase client instance for the entire extension.
 * Used by AuthService, SyncService, and ShareService.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as vscode from 'vscode';

/**
 * Database schema types for type-safe queries
 * Matches the user_prompts table and Edge Functions in Supabase
 */
export interface Database {
  public: {
    Tables: {
      // Add table types here as needed
    };
    Functions: {
      // Edge Functions type definitions
      'sync-prompt': {
        Args: Record<string, unknown>;
        Returns: { cloudId: string; version: number };
      };
      'get-user-prompts': {
        Args: { since?: string };
        Returns: { prompts: unknown[] };
      };
      'get-user-quota': {
        Args: Record<string, never>;
        Returns: {
          promptCount: number;
          promptLimit: number;
          storageBytes: number;
          storageLimit: number;
          percentageUsed: number;
        };
      };
    };
  };
}

/**
 * Supabase client singleton manager
 */
class SupabaseClientManager {
  private static instance: SupabaseClient<Database> | undefined;

  /**
   * Initialize the Supabase client singleton
   *
   * Should be called once during extension activation
   *
   * @returns Initialized Supabase client
   */
  public static initialize(): SupabaseClient<Database> {
    if (!SupabaseClientManager.instance) {
      const cfg = vscode.workspace.getConfiguration('promptBank');
      const supabaseUrl = cfg.get<string>(
        'supabaseUrl',
        'https://xlqtowactrzmslpkzliq.supabase.co'
      );
      const supabaseAnonKey = cfg.get<string>(
        'supabaseAnonKey',
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhscXRvd2FjdHJ6bXNscGt6bGlxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTIyMDAzMzQsImV4cCI6MjA2Nzc3NjMzNH0.cUVLqlGGWfaxDs49AQ57rHxruj52MphG9jV1e0F1UYo'
      );

      SupabaseClientManager.instance = createClient<Database>(supabaseUrl, supabaseAnonKey, {
        auth: {
          // Disable auto-refresh since we handle tokens manually in AuthService
          autoRefreshToken: false,
          // Don't persist session in browser storage (we use VS Code secrets)
          persistSession: false,
        },
      });
    }

    return SupabaseClientManager.instance;
  }

  /**
   * Get the Supabase client instance
   *
   * @throws Error if client not initialized
   * @returns Supabase client instance
   */
  public static get(): SupabaseClient<Database> {
    if (!SupabaseClientManager.instance) {
      throw new Error(
        'Supabase client not initialized. Call SupabaseClientManager.initialize() first.'
      );
    }
    return SupabaseClientManager.instance;
  }

  /**
   * Set the auth session for API calls
   *
   * Called by AuthService after successful authentication.
   * Sets the session which will be used for authenticated requests.
   *
   * @param accessToken - JWT access token from Supabase auth
   * @param refreshToken - Refresh token from Supabase auth
   */
  public static async setSession(accessToken: string, refreshToken: string): Promise<void> {
    const client = SupabaseClientManager.get();
    await client.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
  }

  /**
   * Clear the auth session (on sign out)
   */
  public static async clearSession(): Promise<void> {
    const client = SupabaseClientManager.get();
    await client.auth.signOut();
  }
}

export { SupabaseClientManager };
