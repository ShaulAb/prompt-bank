/**
 * Services Container - Dependency Injection Container
 *
 * Manages service instances per workspace, providing proper lifecycle management
 * and dependency injection for all application services.
 *
 * This replaces the singleton pattern with a more testable and maintainable
 * architecture that properly supports multi-root workspaces.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AuthService } from './authService';
import { SupabaseClientManager, Database } from './supabaseClient';
import { SyncService } from './syncService';
import { PromptService } from './promptService';
import { WorkspaceMetadataService } from './workspaceMetadataService';
import { FileStorageProvider } from '../storage/fileStorage';
import { SyncStateStorage } from '../storage/syncStateStorage';

/**
 * Bundle of services for a specific workspace
 */
export interface WorkspaceServices {
  /** Authentication service */
  auth: AuthService;

  /** Supabase client instance (not the manager class) */
  supabase: SupabaseClient<Database>;

  /** Workspace metadata service for workspace identity */
  workspaceMetadata: WorkspaceMetadataService;

  /** Sync service for cloud synchronization */
  sync: SyncService;

  /** Prompt service for local prompt management */
  prompt: PromptService;
}

/**
 * Services Container
 *
 * Manages service lifecycle per workspace:
 * - Creates service instances with proper dependency injection
 * - Maintains one set of services per workspace root
 * - Handles cleanup when workspaces are removed
 * - Provides workspace-aware service access
 */
export class ServicesContainer {
  private readonly services = new Map<string, WorkspaceServices>();

  /**
   * Get or create services for a workspace
   *
   * @param context - VS Code extension context
   * @param workspaceRoot - Absolute path to workspace root
   * @returns Bundle of services for this workspace
   */
  async getOrCreate(
    context: vscode.ExtensionContext,
    workspaceRoot: string
  ): Promise<WorkspaceServices> {
    const normalizedPath = path.normalize(workspaceRoot);

    if (!this.services.has(normalizedPath)) {
      const services = await this.createServicesForWorkspace(context, workspaceRoot);
      this.services.set(normalizedPath, services);
    }

    return this.services.get(normalizedPath)!;
  }

  /**
   * Get services for a workspace (if already created)
   *
   * @param workspaceRoot - Absolute path to workspace root
   * @returns Bundle of services, or undefined if not created yet
   */
  get(workspaceRoot: string): WorkspaceServices | undefined {
    const normalizedPath = path.normalize(workspaceRoot);
    return this.services.get(normalizedPath);
  }

  /**
   * Check if services exist for a workspace
   *
   * @param workspaceRoot - Absolute path to workspace root
   * @returns True if services exist for this workspace
   */
  has(workspaceRoot: string): boolean {
    const normalizedPath = path.normalize(workspaceRoot);
    return this.services.has(normalizedPath);
  }

  /**
   * Dispose services for a specific workspace
   *
   * @param workspaceRoot - Absolute path to workspace root
   */
  async dispose(workspaceRoot: string): Promise<void> {
    const normalizedPath = path.normalize(workspaceRoot);
    const services = this.services.get(normalizedPath);

    if (services) {
      // Dispose in reverse dependency order
      await this.disposeServices(services);
      this.services.delete(normalizedPath);
    }
  }

  /**
   * Dispose all services for all workspaces
   *
   * Should be called during extension deactivation
   */
  async disposeAll(): Promise<void> {
    const allServices = Array.from(this.services.values());

    // Dispose all workspaces in parallel
    await Promise.all(allServices.map((services) => this.disposeServices(services)));

    this.services.clear();
  }

  /**
   * Get all workspace roots that have services
   *
   * @returns Array of workspace root paths
   */
  getWorkspaceRoots(): string[] {
    return Array.from(this.services.keys());
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Private methods
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Create services for a workspace with proper dependency injection
   *
   * @param context - VS Code extension context
   * @param workspaceRoot - Absolute path to workspace root
   * @returns Newly created services bundle
   */
  private async createServicesForWorkspace(
    context: vscode.ExtensionContext,
    workspaceRoot: string
  ): Promise<WorkspaceServices> {
    // Get extension ID for auth service
    const extensionId = context.extension.id;
    const publisher = extensionId.split('.')[0];
    const extensionName = extensionId.split('.')[1];

    // Create services in dependency order
    // 1. Auth service (no dependencies)
    const authService = new AuthService(context, publisher, extensionName);

    // 2. Supabase client (static singleton - no DI needed)
    const supabaseClient = SupabaseClientManager.initialize();

    // 3. Workspace metadata service (for workspace identity)
    const workspaceMetadataService = new WorkspaceMetadataService(workspaceRoot, context);

    // 4. Storage providers
    const storageProvider = new FileStorageProvider({ storagePath: workspaceRoot });
    await storageProvider.initialize();

    const syncStateStorage = new SyncStateStorage(workspaceRoot);

    // 5. Prompt service (depends on storage and auth)
    const promptService = new PromptService(storageProvider, authService);
    await promptService.initialize();

    // 6. Sync service (depends on auth, syncStateStorage, workspaceMetadata)
    const syncService = new SyncService(
      context,
      workspaceRoot,
      authService,
      syncStateStorage,
      workspaceMetadataService
    );

    return {
      auth: authService,
      supabase: supabaseClient,
      workspaceMetadata: workspaceMetadataService,
      sync: syncService,
      prompt: promptService,
    };
  }

  /**
   * Dispose services in proper order
   *
   * Disposes each service individually with error handling to ensure
   * all services are disposed even if one fails.
   *
   * @param services - Services bundle to dispose
   */
  private async disposeServices(services: WorkspaceServices): Promise<void> {
    // Dispose in reverse dependency order
    // (Sync depends on Auth/Supabase/WorkspaceMetadata, so dispose sync first)
    // Use Promise.allSettled to ensure all dispose attempts complete

    const disposeResults = await Promise.allSettled([
      services.sync.dispose().catch((err) => {
        console.error('[ServicesContainer] Error disposing SyncService:', err);
        throw err;
      }),
      services.prompt.dispose().catch((err) => {
        console.error('[ServicesContainer] Error disposing PromptService:', err);
        throw err;
      }),
      // WorkspaceMetadataService.dispose() is synchronous
      Promise.resolve(services.workspaceMetadata.dispose()),
      services.auth.dispose().catch((err) => {
        console.error('[ServicesContainer] Error disposing AuthService:', err);
        throw err;
      }),
    ]);

    // Log any failures but don't throw - disposal should be best-effort
    const failures = disposeResults.filter((result) => result.status === 'rejected');
    if (failures.length > 0) {
      console.warn(`[ServicesContainer] ${failures.length} service(s) failed to dispose properly`);
    }
  }
}
