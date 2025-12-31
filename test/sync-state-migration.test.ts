/**
 * Tests for SyncStateStorage migration logic
 *
 * Verifies that older sync states are correctly migrated to the current schema version,
 * specifically adding workspaceId from workspace-meta.json.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { SyncStateStorage } from '../src/storage/syncStateStorage';

// Mock vscode
vi.mock('vscode', () => ({
  window: {
    showInformationMessage: vi.fn(),
    showWarningMessage: vi.fn(),
  },
  env: {
    appName: 'Code - Test',
  },
}));

describe('SyncStateStorage - Migration', () => {
  let tempDir: string;
  let syncStateStorage: SyncStateStorage;
  let syncStateFile: string;
  let workspaceMetaFile: string;

  beforeEach(async () => {
    // Create unique temp directory for each test
    tempDir = path.join(
      os.tmpdir(),
      `sync-state-migration-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    );
    const promptBankDir = path.join(tempDir, '.vscode', 'prompt-bank');
    await fs.mkdir(promptBankDir, { recursive: true });

    syncStateFile = path.join(promptBankDir, 'sync-state.json');
    workspaceMetaFile = path.join(promptBankDir, 'workspace-meta.json');

    syncStateStorage = new SyncStateStorage(tempDir);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    vi.clearAllMocks();
  });

  describe('Schema Migration v2 → v3', () => {
    it('should migrate sync state without workspaceId by reading from workspace-meta.json', async () => {
      // Arrange: Create old sync state (v2, no workspaceId)
      const oldSyncState = {
        userId: 'test@example.com',
        deviceId: 'device-123',
        deviceName: 'Test Device',
        promptSyncMap: {
          'prompt-1': {
            cloudId: 'cloud-123',
            lastSyncedContentHash: 'hash-abc',
            lastSyncedAt: '2025-01-01T00:00:00.000Z',
            version: 1,
          },
        },
        // Note: no workspaceId, no schemaVersion (v2 format)
      };
      await fs.writeFile(syncStateFile, JSON.stringify(oldSyncState, null, 2));

      // Create workspace-meta.json with workspaceId
      const workspaceMeta = {
        workspaceId: 'ws-uuid-12345678',
        createdAt: '2025-01-01T00:00:00.000Z',
        schemaVersion: 1,
      };
      await fs.writeFile(workspaceMetaFile, JSON.stringify(workspaceMeta, null, 2));

      // Act: Read sync state (should trigger migration)
      const state = await syncStateStorage.getSyncState();

      // Assert: State should have workspaceId from workspace-meta.json
      expect(state).not.toBeNull();
      expect(state!.workspaceId).toBe('ws-uuid-12345678');
      expect(state!.schemaVersion).toBe(3);
      expect(state!.userId).toBe('test@example.com');
      expect(state!.promptSyncMap['prompt-1'].cloudId).toBe('cloud-123');
    });

    it('should persist migrated state to disk', async () => {
      // Arrange: Create old sync state
      const oldSyncState = {
        userId: 'test@example.com',
        deviceId: 'device-123',
        deviceName: 'Test Device',
        promptSyncMap: {},
      };
      await fs.writeFile(syncStateFile, JSON.stringify(oldSyncState, null, 2));

      // Create workspace-meta.json
      const workspaceMeta = { workspaceId: 'persistent-ws-id' };
      await fs.writeFile(workspaceMetaFile, JSON.stringify(workspaceMeta, null, 2));

      // Act: First read triggers migration
      await syncStateStorage.getSyncState();

      // Read file directly to verify persistence
      const fileContent = await fs.readFile(syncStateFile, 'utf8');
      const savedState = JSON.parse(fileContent);

      // Assert: File should contain migrated data
      expect(savedState.workspaceId).toBe('persistent-ws-id');
      expect(savedState.schemaVersion).toBe(3);
    });

    it('should skip migration if workspace-meta.json does not exist', async () => {
      // Arrange: Create old sync state without workspace-meta.json
      const oldSyncState = {
        userId: 'test@example.com',
        deviceId: 'device-123',
        deviceName: 'Test Device',
        promptSyncMap: {},
      };
      await fs.writeFile(syncStateFile, JSON.stringify(oldSyncState, null, 2));
      // Note: NO workspace-meta.json created

      // Act: Read sync state
      const state = await syncStateStorage.getSyncState();

      // Assert: State should be returned without workspaceId (no migration possible)
      expect(state).not.toBeNull();
      expect(state!.workspaceId).toBeUndefined();
      expect(state!.userId).toBe('test@example.com');
    });

    it('should not re-migrate already migrated state', async () => {
      // Arrange: Create already migrated sync state (v3 with workspaceId)
      const migratedSyncState = {
        userId: 'test@example.com',
        deviceId: 'device-123',
        deviceName: 'Test Device',
        workspaceId: 'existing-ws-id',
        schemaVersion: 3,
        promptSyncMap: {},
      };
      await fs.writeFile(syncStateFile, JSON.stringify(migratedSyncState, null, 2));

      // Create workspace-meta.json with DIFFERENT workspaceId
      const workspaceMeta = { workspaceId: 'different-ws-id' };
      await fs.writeFile(workspaceMetaFile, JSON.stringify(workspaceMeta, null, 2));

      // Act: Read sync state
      const state = await syncStateStorage.getSyncState();

      // Assert: Should keep existing workspaceId, not overwrite
      expect(state!.workspaceId).toBe('existing-ws-id');
      expect(state!.schemaVersion).toBe(3);
    });

    it('should preserve all prompt sync info during migration', async () => {
      // Arrange: Create old sync state with multiple prompts
      const oldSyncState = {
        userId: 'test@example.com',
        deviceId: 'device-123',
        deviceName: 'Test Device',
        promptSyncMap: {
          'prompt-1': {
            cloudId: 'cloud-1',
            lastSyncedContentHash: 'hash-1',
            lastSyncedAt: '2025-01-01T00:00:00.000Z',
            version: 1,
          },
          'prompt-2': {
            cloudId: 'cloud-2',
            lastSyncedContentHash: 'hash-2',
            lastSyncedAt: '2025-01-02T00:00:00.000Z',
            version: 2,
            isDeleted: true,
            deletedAt: '2025-01-03T00:00:00.000Z',
          },
        },
      };
      await fs.writeFile(syncStateFile, JSON.stringify(oldSyncState, null, 2));

      // Create workspace-meta.json
      const workspaceMeta = { workspaceId: 'test-ws-id' };
      await fs.writeFile(workspaceMetaFile, JSON.stringify(workspaceMeta, null, 2));

      // Act: Read sync state
      const state = await syncStateStorage.getSyncState();

      // Assert: All prompt sync info should be preserved
      expect(Object.keys(state!.promptSyncMap)).toHaveLength(2);
      expect(state!.promptSyncMap['prompt-1'].cloudId).toBe('cloud-1');
      expect(state!.promptSyncMap['prompt-1'].lastSyncedContentHash).toBe('hash-1');
      expect(state!.promptSyncMap['prompt-2'].cloudId).toBe('cloud-2');
      expect(state!.promptSyncMap['prompt-2'].isDeleted).toBe(true);
    });
  });
});
