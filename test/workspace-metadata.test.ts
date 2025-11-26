/**
 * Tests for WorkspaceMetadataService
 *
 * Verifies that workspace identity is correctly managed via metadata file.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { WorkspaceMetadataService } from '../src/services/workspaceMetadataService';
import {
  WORKSPACE_METADATA_SCHEMA_VERSION,
  WORKSPACE_METADATA_FILENAME,
} from '../src/models/workspaceMetadata';
import { isValidWorkspaceId, isLegacyWorkspaceId } from '../src/utils/workspaceId';
import { LEGACY_WORKSPACE_ID } from '../src/models/workspaceMetadata';

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

// Mock device info
vi.mock('../src/utils/deviceId', () => ({
  getDeviceInfo: vi.fn().mockResolvedValue({
    id: 'test-device-id-1234',
    name: 'Test Device (Linux)',
    platform: 'linux',
    hostname: 'test-host',
  }),
}));

describe('WorkspaceMetadataService', () => {
  let tempDir: string;
  let service: WorkspaceMetadataService;
  const mockContext = {
    globalState: {
      get: vi.fn(),
      update: vi.fn().mockResolvedValue(undefined),
    },
  } as any;

  beforeEach(async () => {
    // Create temp directory for each test
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'prompt-bank-test-'));
    service = new WorkspaceMetadataService(tempDir, mockContext);
  });

  afterEach(async () => {
    // Cleanup temp directory
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('getOrCreateWorkspaceId', () => {
    it('should create new workspace ID when no metadata exists', async () => {
      const workspaceId = await service.getOrCreateWorkspaceId();

      // Should be a valid UUID
      expect(workspaceId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
    });

    it('should return same ID on subsequent calls (cached)', async () => {
      const id1 = await service.getOrCreateWorkspaceId();
      const id2 = await service.getOrCreateWorkspaceId();

      expect(id1).toBe(id2);
    });

    it('should return same ID after clearing cache (persisted)', async () => {
      const id1 = await service.getOrCreateWorkspaceId();
      service.clearCache();
      const id2 = await service.getOrCreateWorkspaceId();

      expect(id1).toBe(id2);
    });

    it('should read existing metadata file', async () => {
      // Create metadata file manually
      const metadataDir = path.join(tempDir, '.vscode', 'prompt-bank');
      await fs.mkdir(metadataDir, { recursive: true });

      const existingId = 'c7e95c7b-f44c-4566-a814-b92518a87c07';
      await fs.writeFile(
        path.join(metadataDir, WORKSPACE_METADATA_FILENAME),
        JSON.stringify({
          workspaceId: existingId,
          createdAt: '2025-01-01T00:00:00Z',
          lastDevice: 'Other Device',
          schemaVersion: 1,
        })
      );

      const workspaceId = await service.getOrCreateWorkspaceId();
      expect(workspaceId).toBe(existingId);
    });

    it('should create new ID if metadata file contains invalid JSON', async () => {
      // Create invalid metadata file
      const metadataDir = path.join(tempDir, '.vscode', 'prompt-bank');
      await fs.mkdir(metadataDir, { recursive: true });
      await fs.writeFile(path.join(metadataDir, WORKSPACE_METADATA_FILENAME), '{ invalid json');

      const workspaceId = await service.getOrCreateWorkspaceId();

      // Should create new valid UUID
      expect(workspaceId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
    });

    it('should create new ID if workspaceId is missing from metadata', async () => {
      // Create metadata file without workspaceId
      const metadataDir = path.join(tempDir, '.vscode', 'prompt-bank');
      await fs.mkdir(metadataDir, { recursive: true });
      await fs.writeFile(
        path.join(metadataDir, WORKSPACE_METADATA_FILENAME),
        JSON.stringify({
          createdAt: '2025-01-01T00:00:00Z',
          lastDevice: 'Other Device',
          schemaVersion: 1,
        })
      );

      const workspaceId = await service.getOrCreateWorkspaceId();

      // Should create new valid UUID
      expect(workspaceId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
    });

    it('should create new ID if workspaceId is not a valid UUID', async () => {
      // Create metadata file with invalid workspaceId
      const metadataDir = path.join(tempDir, '.vscode', 'prompt-bank');
      await fs.mkdir(metadataDir, { recursive: true });
      await fs.writeFile(
        path.join(metadataDir, WORKSPACE_METADATA_FILENAME),
        JSON.stringify({
          workspaceId: 'not-a-valid-uuid',
          createdAt: '2025-01-01T00:00:00Z',
          lastDevice: 'Other Device',
          schemaVersion: 1,
        })
      );

      const workspaceId = await service.getOrCreateWorkspaceId();

      // Should create new valid UUID
      expect(workspaceId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
    });
  });

  describe('hasMetadata', () => {
    it('should return false when no metadata exists', async () => {
      const exists = await service.hasMetadata();
      expect(exists).toBe(false);
    });

    it('should return true after creating metadata', async () => {
      await service.getOrCreateWorkspaceId();
      const exists = await service.hasMetadata();
      expect(exists).toBe(true);
    });
  });

  describe('getMetadataPath', () => {
    it('should return correct path', () => {
      const expectedPath = path.join(tempDir, '.vscode', 'prompt-bank', WORKSPACE_METADATA_FILENAME);
      expect(service.getMetadataPath()).toBe(expectedPath);
    });
  });

  describe('metadata file content', () => {
    it('should write valid JSON with all required fields', async () => {
      await service.getOrCreateWorkspaceId();

      const content = await fs.readFile(service.getMetadataPath(), 'utf-8');
      const metadata = JSON.parse(content);

      expect(metadata).toHaveProperty('workspaceId');
      expect(metadata).toHaveProperty('createdAt');
      expect(metadata).toHaveProperty('lastDevice');
      expect(metadata).toHaveProperty('schemaVersion');
      expect(metadata.schemaVersion).toBe(WORKSPACE_METADATA_SCHEMA_VERSION);
    });

    it('should set lastDevice to current device name', async () => {
      await service.getOrCreateWorkspaceId();

      const content = await fs.readFile(service.getMetadataPath(), 'utf-8');
      const metadata = JSON.parse(content);

      expect(metadata.lastDevice).toBe('Test Device (Linux)');
    });

    it('should set valid ISO timestamp for createdAt', async () => {
      const before = new Date().toISOString();
      await service.getOrCreateWorkspaceId();
      const after = new Date().toISOString();

      const content = await fs.readFile(service.getMetadataPath(), 'utf-8');
      const metadata = JSON.parse(content);

      expect(metadata.createdAt >= before).toBe(true);
      expect(metadata.createdAt <= after).toBe(true);
    });

    it('should persist across service instances', async () => {
      const id1 = await service.getOrCreateWorkspaceId();

      // Create new service instance (simulating VS Code restart)
      const newService = new WorkspaceMetadataService(tempDir, mockContext);
      const id2 = await newService.getOrCreateWorkspaceId();

      expect(id1).toBe(id2);
    });
  });

  describe('clearCache', () => {
    it('should clear the cached metadata', async () => {
      // Get initial ID (creates and caches metadata)
      const id1 = await service.getOrCreateWorkspaceId();

      // Manually modify the file
      const metadataDir = path.join(tempDir, '.vscode', 'prompt-bank');
      const newId = '11111111-2222-3333-4444-555555555555';
      await fs.writeFile(
        path.join(metadataDir, WORKSPACE_METADATA_FILENAME),
        JSON.stringify({
          workspaceId: newId,
          createdAt: '2025-01-01T00:00:00Z',
          lastDevice: 'Other Device',
          schemaVersion: 1,
        })
      );

      // Without clearing cache, should return old ID
      const id2 = await service.getOrCreateWorkspaceId();
      expect(id2).toBe(id1);

      // After clearing cache, should read new ID from file
      service.clearCache();
      const id3 = await service.getOrCreateWorkspaceId();
      expect(id3).toBe(newId);
    });
  });

  describe('dispose', () => {
    it('should clear cached metadata', async () => {
      await service.getOrCreateWorkspaceId();
      service.dispose();

      // Create new service to verify cache was cleared
      const newService = new WorkspaceMetadataService(tempDir, mockContext);

      // Modify file to test if it's re-read
      const metadataDir = path.join(tempDir, '.vscode', 'prompt-bank');
      const newId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
      await fs.writeFile(
        path.join(metadataDir, WORKSPACE_METADATA_FILENAME),
        JSON.stringify({
          workspaceId: newId,
          createdAt: '2025-01-01T00:00:00Z',
          lastDevice: 'Other Device',
          schemaVersion: 1,
        })
      );

      const id = await newService.getOrCreateWorkspaceId();
      expect(id).toBe(newId);
    });
  });
});

describe('isValidWorkspaceId', () => {
  describe('valid UUIDs', () => {
    it('should accept lowercase UUID', () => {
      expect(isValidWorkspaceId('c7e95c7b-f44c-4566-a814-b92518a87c07')).toBe(true);
    });

    it('should accept uppercase UUID', () => {
      expect(isValidWorkspaceId('C7E95C7B-F44C-4566-A814-B92518A87C07')).toBe(true);
    });

    it('should accept mixed case UUID', () => {
      expect(isValidWorkspaceId('c7e95c7B-F44c-4566-a814-B92518a87c07')).toBe(true);
    });

    it('should accept all zeros UUID', () => {
      expect(isValidWorkspaceId('00000000-0000-0000-0000-000000000000')).toBe(true);
    });

    it('should accept all F UUID', () => {
      expect(isValidWorkspaceId('ffffffff-ffff-ffff-ffff-ffffffffffff')).toBe(true);
    });
  });

  describe('legacy workspace ID', () => {
    it('should accept legacy workspace ID', () => {
      expect(isValidWorkspaceId(LEGACY_WORKSPACE_ID)).toBe(true);
      expect(isValidWorkspaceId('legacy-pre-workspace-isolation')).toBe(true);
    });
  });

  describe('invalid formats', () => {
    it('should reject empty string', () => {
      expect(isValidWorkspaceId('')).toBe(false);
    });

    it('should reject null/undefined', () => {
      expect(isValidWorkspaceId(null as any)).toBe(false);
      expect(isValidWorkspaceId(undefined as any)).toBe(false);
    });

    it('should reject non-string', () => {
      expect(isValidWorkspaceId(123 as any)).toBe(false);
    });

    it('should reject UUID without hyphens', () => {
      expect(isValidWorkspaceId('c7e95c7bf44c4566a814b92518a87c07')).toBe(false);
    });

    it('should reject UUID with wrong hyphen positions', () => {
      expect(isValidWorkspaceId('c7e95c7b-f44c4566-a814-b92518a87c07')).toBe(false);
    });

    it('should reject too short', () => {
      expect(isValidWorkspaceId('c7e95c7b-f44c-4566-a814')).toBe(false);
    });

    it('should reject too long', () => {
      expect(isValidWorkspaceId('c7e95c7b-f44c-4566-a814-b92518a87c07-extra')).toBe(false);
    });

    it('should reject non-hex characters', () => {
      expect(isValidWorkspaceId('g7e95c7b-f44c-4566-a814-b92518a87c07')).toBe(false);
      expect(isValidWorkspaceId('c7e95c7b-f44c-4566-a814-b92518a87c0z')).toBe(false);
    });

    it('should reject random strings', () => {
      expect(isValidWorkspaceId('not-a-uuid')).toBe(false);
      expect(isValidWorkspaceId('hello world')).toBe(false);
      expect(isValidWorkspaceId('workspace-123')).toBe(false);
    });

    it('should reject underscores instead of hyphens', () => {
      expect(isValidWorkspaceId('c7e95c7b_f44c_4566_a814_b92518a87c07')).toBe(false);
    });
  });
});

describe('isLegacyWorkspaceId', () => {
  it('should return true for legacy workspace ID', () => {
    expect(isLegacyWorkspaceId(LEGACY_WORKSPACE_ID)).toBe(true);
    expect(isLegacyWorkspaceId('legacy-pre-workspace-isolation')).toBe(true);
  });

  it('should return false for valid UUID', () => {
    expect(isLegacyWorkspaceId('c7e95c7b-f44c-4566-a814-b92518a87c07')).toBe(false);
  });

  it('should return false for invalid ID', () => {
    expect(isLegacyWorkspaceId('invalid')).toBe(false);
    expect(isLegacyWorkspaceId('')).toBe(false);
  });
});
