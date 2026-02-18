/**
 * Team Service - Extension-level (global) team data manager
 *
 * Manages team membership data and per-team storage instances.
 * This service is NOT workspace-scoped — it lives at the extension level
 * and stores data in VS Code's globalStoragePath.
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import type { Team, TeamRole } from '../models/team';
import { SupabaseClientManager } from './supabaseClient';
import { AuthService } from './authService';
import { FileStorageProvider } from '../storage/fileStorage';
import { SyncStateStorage } from '../storage/syncStateStorage';

/**
 * Per-team storage instances
 */
interface TeamStorageBundle {
  storage: FileStorageProvider;
  syncState: SyncStateStorage;
}

/**
 * TeamService manages team membership and per-team storage.
 *
 * Created once at extension activation using context.globalStoragePath.
 * Shared across all workspaces.
 */
export class TeamService {
  private teams: Team[] = [];
  private teamStorageMap = new Map<string, TeamStorageBundle>();

  constructor(
    private readonly globalStoragePath: string,
    private readonly authService: AuthService
  ) {}

  /**
   * Fetch the user's teams from the backend and cache them
   */
  async refreshTeams(): Promise<Team[]> {
    const token = await this.authService.getValidAccessToken();
    const refreshToken = await this.authService.getRefreshToken();
    if (!token || !refreshToken) {
      this.teams = [];
      return this.teams;
    }

    // Set auth session before calling edge function (client uses persistSession: false)
    await SupabaseClientManager.setSession(token, refreshToken);

    const supabase = SupabaseClientManager.get();

    const { data, error } = await supabase.functions.invoke('get-user-teams', {});

    if (error) {
      const errorContext = (error as { context?: { status?: number } }).context;
      if (errorContext?.status === 401) {
        console.warn('[TeamService] Auth expired during team fetch');
        this.teams = [];
        return this.teams;
      }
      throw new Error(`Failed to fetch teams: ${error.message}`);
    }

    this.teams = ((data as { teams: Team[] }).teams || []).map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      role: t.role as TeamRole,
      memberCount: t.memberCount,
      createdAt: t.createdAt,
    }));

    return this.teams;
  }

  /**
   * Get cached teams (call refreshTeams first for fresh data)
   */
  getTeams(): readonly Team[] {
    return this.teams;
  }

  /**
   * Get a specific team by ID
   */
  getTeam(teamId: string): Team | undefined {
    return this.teams.find((t) => t.id === teamId);
  }

  /**
   * Whether the user has any teams
   */
  hasTeams(): boolean {
    return this.teams.length > 0;
  }

  /**
   * Get or create storage instances for a team
   *
   * Storage is created at: {globalStoragePath}/teams/{teamId}/
   */
  async getTeamStorage(teamId: string): Promise<TeamStorageBundle> {
    if (this.teamStorageMap.has(teamId)) {
      return this.teamStorageMap.get(teamId)!;
    }

    const teamStoragePath = path.join(this.globalStoragePath, 'teams', teamId);

    // Ensure directory exists
    await fs.mkdir(teamStoragePath, { recursive: true });

    const storage = new FileStorageProvider({ storagePath: teamStoragePath });
    await storage.initialize();

    // SyncStateStorage defaults to {root}/.vscode/prompt-bank/ but accepts
    // an explicit storagePath override for non-workspace usage
    const syncState = new SyncStateStorage(teamStoragePath, {
      storagePath: teamStoragePath,
    });

    const bundle: TeamStorageBundle = { storage, syncState };
    this.teamStorageMap.set(teamId, bundle);
    return bundle;
  }

  /**
   * Dispose all team storage instances
   */
  async dispose(): Promise<void> {
    this.teams = [];
    this.teamStorageMap.clear();
  }
}
