import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import { TeamSyncService, type TeamSyncResult } from '../src/services/teamSyncService';
import { AuthService } from '../src/services/authService';
import { TeamService } from '../src/services/teamService';
import { SupabaseClientManager } from '../src/services/supabaseClient';
import { FileStorageProvider } from '../src/storage/fileStorage';
import { SyncStateStorage } from '../src/storage/syncStateStorage';
import { createPrompt } from './helpers/prompt-factory';
import { server, teamSyncTestHelpers } from './e2e/helpers/msw-setup';
import { computeContentHash } from '../src/utils/contentHash';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import type * as vscode from 'vscode';
import type { Team } from '../src/models/team';

describe('TeamSyncService - Integration (Three-Way Merge)', () => {
  let teamSyncService: TeamSyncService;
  let authService: AuthService;
  let teamService: TeamService;
  let testStorageDir: string;
  let context: vscode.ExtensionContext;
  let teamStorage: FileStorageProvider;
  let teamSyncStateStorage: SyncStateStorage;

  const TEST_TEAM_ID = 'test-team-001';
  const TEST_TEAM: Team = {
    id: TEST_TEAM_ID,
    name: 'Test Team',
    description: null,
    role: 'editor',
    memberCount: 3,
    createdAt: new Date().toISOString(),
  };

  beforeAll(() => {
    server.listen({ onUnhandledRequest: 'warn' });
    SupabaseClientManager.initialize();
  });

  beforeEach(async () => {
    teamSyncTestHelpers.clearAllTeamData();
    teamSyncTestHelpers.setMockRole(TEST_TEAM_ID, 'editor');

    testStorageDir = path.join(
      os.tmpdir(),
      `prompt-bank-team-sync-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    );

    const vscode = await import('vscode');
    context = {
      globalState: vscode.globalState,
      workspaceState: vscode.workspaceState,
      secrets: vscode.secrets,
      subscriptions: [],
      extensionUri: vscode.Uri.file(testStorageDir),
      extensionPath: testStorageDir,
      extension: {} as any,
      storageUri: vscode.Uri.file(testStorageDir),
      globalStorageUri: vscode.Uri.file(path.join(testStorageDir, 'global')),
      logUri: vscode.Uri.file(path.join(testStorageDir, 'logs')),
      extensionMode: 3,
      environmentVariableCollection: {} as any,
      storagePath: testStorageDir,
      globalStoragePath: path.join(testStorageDir, 'global'),
      logPath: path.join(testStorageDir, 'logs'),
      asAbsolutePath: (relativePath: string) => path.join(testStorageDir, relativePath),
    } as unknown as vscode.ExtensionContext;

    authService = new AuthService(context, 'test-publisher', 'test-extension');
    vi.spyOn(authService, 'getValidAccessToken').mockResolvedValue('mock-access-token');
    vi.spyOn(authService, 'getRefreshToken').mockResolvedValue('mock-refresh-token');
    vi.spyOn(authService, 'getUserEmail').mockResolvedValue('test-user@promptbank.test');

    // Create team storage in the globalStoragePath
    const teamStoragePath = path.join(testStorageDir, 'global', 'teams', TEST_TEAM_ID);
    await fs.mkdir(teamStoragePath, { recursive: true });

    teamStorage = new FileStorageProvider({ storagePath: teamStoragePath });
    await teamStorage.initialize();

    teamSyncStateStorage = new SyncStateStorage(teamStoragePath, { storagePath: teamStoragePath });

    // Create TeamService with a mock that returns our test team and storage
    teamService = new TeamService(path.join(testStorageDir, 'global'), authService);
    // Mock getTeams to return our test team
    vi.spyOn(teamService, 'getTeams').mockReturnValue([TEST_TEAM]);
    // Mock getTeamStorage to return our pre-created storage
    vi.spyOn(teamService, 'getTeamStorage').mockResolvedValue({
      storage: teamStorage,
      syncState: teamSyncStateStorage,
    });

    teamSyncService = new TeamSyncService(context, authService, teamService);
  });

  afterEach(async () => {
    await fs.rm(testStorageDir, { recursive: true, force: true }).catch(() => {});
    server.resetHandlers();
    vi.clearAllMocks();
  });

  afterAll(() => {
    server.close();
  });

  // Helper to sync a single team and return result
  async function syncTeam(team: Team = TEST_TEAM): Promise<TeamSyncResult> {
    return teamSyncService.syncTeam(team);
  }

  // Helper to list local team prompts
  async function listLocalPrompts() {
    return teamStorage.list();
  }

  // ──────────────────────────────────────────────────────────
  // First Sync / Downloads
  // ──────────────────────────────────────────────────────────

  describe('First Sync', () => {
    it('should download all remote team prompts on first sync', async () => {
      teamSyncTestHelpers.addTeamCloudPrompt(TEST_TEAM_ID, {
        title: 'Team Prompt 1',
        content: 'Content 1',
        category: 'General',
        local_id: 'remote-prompt-1',
      });
      teamSyncTestHelpers.addTeamCloudPrompt(TEST_TEAM_ID, {
        title: 'Team Prompt 2',
        content: 'Content 2',
        category: 'General',
        local_id: 'remote-prompt-2',
      });

      const result = await syncTeam();

      expect(result.downloaded).toBe(2);
      expect(result.uploaded).toBe(0);
      expect(result.errors).toHaveLength(0);

      const local = await listLocalPrompts();
      expect(local).toHaveLength(2);
      expect(local.map((p) => p.title).sort()).toEqual(['Team Prompt 1', 'Team Prompt 2']);
    });

    it('should upload new local prompts when user is editor', async () => {
      const prompt = createPrompt({
        title: 'New Local Prompt',
        content: 'Local content',
        category: 'General',
      });
      await teamStorage.save(prompt);

      const result = await syncTeam();

      expect(result.uploaded).toBe(1);
      expect(result.errors).toHaveLength(0);

      const cloud = teamSyncTestHelpers.getAllTeamCloudPrompts(TEST_TEAM_ID);
      expect(cloud).toHaveLength(1);
      expect(cloud[0].title).toBe('New Local Prompt');
    });
  });

  // ──────────────────────────────────────────────────────────
  // Role Gating
  // ──────────────────────────────────────────────────────────

  describe('Role Gating', () => {
    it('should NOT upload when user is viewer', async () => {
      const viewerTeam: Team = { ...TEST_TEAM, role: 'viewer' };
      teamSyncTestHelpers.setMockRole(TEST_TEAM_ID, 'viewer');

      const prompt = createPrompt({
        title: 'Viewer Prompt',
        content: 'Viewer content',
        category: 'General',
      });
      await teamStorage.save(prompt);

      const result = await teamSyncService.syncTeam(viewerTeam);

      expect(result.uploaded).toBe(0);
      expect(result.errors).toHaveLength(0);

      const cloud = teamSyncTestHelpers.getAllTeamCloudPrompts(TEST_TEAM_ID);
      expect(cloud).toHaveLength(0);
    });

    it('should still download when user is viewer', async () => {
      const viewerTeam: Team = { ...TEST_TEAM, role: 'viewer' };
      teamSyncTestHelpers.setMockRole(TEST_TEAM_ID, 'viewer');

      teamSyncTestHelpers.addTeamCloudPrompt(TEST_TEAM_ID, {
        title: 'Shared Prompt',
        content: 'Shared content',
        category: 'General',
        local_id: 'shared-1',
      });

      const result = await teamSyncService.syncTeam(viewerTeam);

      expect(result.downloaded).toBe(1);
      const local = await listLocalPrompts();
      expect(local).toHaveLength(1);
      expect(local[0].title).toBe('Shared Prompt');
    });
  });

  // ──────────────────────────────────────────────────────────
  // Conflict Resolution (THE FIX — no more last-writer-wins)
  // ──────────────────────────────────────────────────────────

  describe('Conflict Resolution', () => {
    it('should create two copies when both local and remote changed (not last-writer-wins)', async () => {
      // Setup: add a remote prompt and sync it to local
      const remote = teamSyncTestHelpers.addTeamCloudPrompt(TEST_TEAM_ID, {
        title: 'Shared Prompt',
        content: 'Original content',
        category: 'General',
        local_id: 'conflict-prompt-1',
      });

      // First sync — downloads the remote prompt
      await syncTeam();

      let local = await listLocalPrompts();
      expect(local).toHaveLength(1);
      const syncedPrompt = local[0];

      // Now modify BOTH local and remote to create a conflict
      // 1. Modify local
      const modifiedLocal = {
        ...syncedPrompt,
        content: 'Modified locally',
        metadata: { ...syncedPrompt.metadata, modified: new Date() },
      };
      await teamStorage.save(modifiedLocal);

      // 2. Modify remote (different content)
      teamSyncTestHelpers.updateTeamCloudPrompt(TEST_TEAM_ID, remote.cloud_id, {
        content: 'Modified remotely',
        title: 'Shared Prompt',
        category: 'General',
        sync_metadata: {
          lastModifiedDeviceId: 'other-device',
          lastModifiedDeviceName: 'Other Device',
        },
      });

      // Sync again — should detect conflict and create two copies
      const result = await syncTeam();

      expect(result.conflicts).toBe(1);

      // Verify: two conflict copies exist locally (original deleted + 2 new)
      local = await listLocalPrompts();
      expect(local.length).toBe(2);

      // Both copies should have different content
      const contents = local.map((p) => p.content).sort();
      expect(contents).toEqual(['Modified locally', 'Modified remotely']);

      // Both titles should include "(from" suffix indicating conflict copies
      for (const p of local) {
        expect(p.title).toContain('(from');
      }
    });

    it('should not create conflicts when both changed to same content', async () => {
      const remote = teamSyncTestHelpers.addTeamCloudPrompt(TEST_TEAM_ID, {
        title: 'Same Edit',
        content: 'Original content',
        category: 'General',
        local_id: 'same-edit-1',
      });

      await syncTeam();

      let local = await listLocalPrompts();
      const syncedPrompt = local[0];

      // Both edit to the same content
      const sameContent = 'Both devices made the same edit';
      const modifiedLocal = {
        ...syncedPrompt,
        content: sameContent,
        metadata: { ...syncedPrompt.metadata, modified: new Date() },
      };
      await teamStorage.save(modifiedLocal);

      teamSyncTestHelpers.updateTeamCloudPrompt(TEST_TEAM_ID, remote.cloud_id, {
        content: sameContent,
        title: 'Same Edit',
        category: 'General',
      });

      const result = await syncTeam();

      // No conflict because content is identical
      expect(result.conflicts).toBe(0);

      local = await listLocalPrompts();
      expect(local).toHaveLength(1);
    });
  });

  // ──────────────────────────────────────────────────────────
  // Remote Deletion
  // ──────────────────────────────────────────────────────────

  describe('Remote Deletion', () => {
    it('should delete locally when remote is soft-deleted', async () => {
      const remote = teamSyncTestHelpers.addTeamCloudPrompt(TEST_TEAM_ID, {
        title: 'To Delete',
        content: 'Will be deleted',
        category: 'General',
        local_id: 'del-1',
      });

      await syncTeam();
      let local = await listLocalPrompts();
      expect(local).toHaveLength(1);

      // Soft-delete remotely
      teamSyncTestHelpers.deleteTeamCloudPrompt(TEST_TEAM_ID, remote.cloud_id);

      const result = await syncTeam();
      expect(result.deleted).toBe(1);

      local = await listLocalPrompts();
      expect(local).toHaveLength(0);
    });

    it('should preserve local edits when remote deleted but local modified after', async () => {
      const remote = teamSyncTestHelpers.addTeamCloudPrompt(TEST_TEAM_ID, {
        title: 'Delete-Modify',
        content: 'Original',
        category: 'General',
        local_id: 'del-mod-1',
      });

      await syncTeam();
      let local = await listLocalPrompts();
      const syncedPrompt = local[0];

      // Remote deletes in the PAST
      teamSyncTestHelpers.deleteTeamCloudPromptInPast(TEST_TEAM_ID, remote.cloud_id);

      // Local modifies AFTER deletion (by saving with current timestamp)
      const modifiedLocal = {
        ...syncedPrompt,
        content: 'Modified after remote delete',
        metadata: { ...syncedPrompt.metadata, modified: new Date() },
      };
      await teamStorage.save(modifiedLocal);

      const result = await syncTeam();

      // Should re-upload the modified local prompt (preserve work)
      expect(result.uploaded).toBe(1);

      local = await listLocalPrompts();
      expect(local).toHaveLength(1);
      expect(local[0].content).toBe('Modified after remote delete');
    });
  });

  // ──────────────────────────────────────────────────────────
  // Version Conflict Handling
  // ──────────────────────────────────────────────────────────

  describe('Version Conflict Handling', () => {
    it('should handle VERSION_CONFLICT by triggering retry', async () => {
      const remote = teamSyncTestHelpers.addTeamCloudPrompt(TEST_TEAM_ID, {
        title: 'Version Test',
        content: 'Original',
        category: 'General',
        local_id: 'ver-1',
      });

      await syncTeam();

      let local = await listLocalPrompts();
      const syncedPrompt = local[0];

      // Modify locally
      const modified = {
        ...syncedPrompt,
        content: 'Modified locally for version test',
        metadata: { ...syncedPrompt.metadata, modified: new Date() },
      };
      await teamStorage.save(modified);

      // Simulate version conflict (server has higher version)
      teamSyncTestHelpers.simulateVersionConflict(TEST_TEAM_ID, remote.cloud_id);

      // Sync should fail with conflict retry error
      const result = await syncTeam();

      // The error should contain the conflict retry code
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('sync_conflict_retry');
    });
  });

  // ──────────────────────────────────────────────────────────
  // Multi-Sync Scenarios
  // ──────────────────────────────────────────────────────────

  describe('Multi-Sync Scenarios', () => {
    it('should handle subsequent syncs with only-local changes', async () => {
      // First sync: download remote
      teamSyncTestHelpers.addTeamCloudPrompt(TEST_TEAM_ID, {
        title: 'Existing',
        content: 'Already in cloud',
        category: 'General',
        local_id: 'existing-1',
      });

      await syncTeam();

      // Second sync: add a local prompt, should upload it
      const newPrompt = createPrompt({
        title: 'New Local',
        content: 'New local content',
        category: 'General',
      });
      await teamStorage.save(newPrompt);

      const result = await syncTeam();

      expect(result.uploaded).toBe(1);
      expect(result.downloaded).toBe(0);
      expect(result.conflicts).toBe(0);
    });

    it('should handle subsequent syncs with only-remote changes', async () => {
      const remote = teamSyncTestHelpers.addTeamCloudPrompt(TEST_TEAM_ID, {
        title: 'Remote Only',
        content: 'Original',
        category: 'General',
        local_id: 'remote-only-1',
      });

      await syncTeam();

      // Remote changes
      teamSyncTestHelpers.updateTeamCloudPrompt(TEST_TEAM_ID, remote.cloud_id, {
        content: 'Updated remotely',
        title: 'Remote Only',
        category: 'General',
      });

      const result = await syncTeam();

      expect(result.downloaded).toBe(1);
      expect(result.uploaded).toBe(0);
      expect(result.conflicts).toBe(0);

      const local = await listLocalPrompts();
      const updated = local.find((p) => p.title === 'Remote Only');
      expect(updated?.content).toBe('Updated remotely');
    });

    it('should handle no-op sync when nothing changed', async () => {
      teamSyncTestHelpers.addTeamCloudPrompt(TEST_TEAM_ID, {
        title: 'Stable',
        content: 'No changes',
        category: 'General',
        local_id: 'stable-1',
      });

      await syncTeam();
      const result = await syncTeam();

      expect(result.uploaded).toBe(0);
      expect(result.downloaded).toBe(0);
      expect(result.conflicts).toBe(0);
      expect(result.deleted).toBe(0);
    });
  });

  // ──────────────────────────────────────────────────────────
  // syncAllTeams
  // ──────────────────────────────────────────────────────────

  describe('syncAllTeams', () => {
    it('should sync all teams and return results', async () => {
      teamSyncTestHelpers.addTeamCloudPrompt(TEST_TEAM_ID, {
        title: 'Team 1 Prompt',
        content: 'Content',
        category: 'General',
        local_id: 'all-teams-1',
      });

      const results = await teamSyncService.syncAllTeams();

      expect(results).toHaveLength(1);
      expect(results[0].teamId).toBe(TEST_TEAM_ID);
      expect(results[0].downloaded).toBe(1);
    });

    it('should return empty array when no teams', async () => {
      vi.spyOn(teamService, 'getTeams').mockReturnValue([]);

      const results = await teamSyncService.syncAllTeams();
      expect(results).toHaveLength(0);
    });
  });

  // ──────────────────────────────────────────────────────────
  // Admin Role
  // ──────────────────────────────────────────────────────────

  describe('Admin Role', () => {
    it('should upload prompts when user is admin', async () => {
      const adminTeam: Team = { ...TEST_TEAM, role: 'admin' };
      teamSyncTestHelpers.setMockRole(TEST_TEAM_ID, 'admin');

      const prompt = createPrompt({
        title: 'Admin Prompt',
        content: 'Admin content',
        category: 'General',
      });
      await teamStorage.save(prompt);

      const result = await teamSyncService.syncTeam(adminTeam);

      expect(result.uploaded).toBe(1);
      expect(result.errors).toHaveLength(0);
    });

    it('should upload prompts when user is owner', async () => {
      const ownerTeam: Team = { ...TEST_TEAM, role: 'owner' };
      teamSyncTestHelpers.setMockRole(TEST_TEAM_ID, 'owner');

      const prompt = createPrompt({
        title: 'Owner Prompt',
        content: 'Owner content',
        category: 'General',
      });
      await teamStorage.save(prompt);

      const result = await teamSyncService.syncTeam(ownerTeam);

      expect(result.uploaded).toBe(1);
      expect(result.errors).toHaveLength(0);
    });
  });
});
