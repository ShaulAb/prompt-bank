import { describe, it, expect } from 'vitest';
import {
  createPrompt,
  getCurrentVersion,
  getVersionNumber,
  getDisplayVersionNumber,
  generateUUID,
} from '../../src/models/prompt';
import type { PromptVersion } from '../../src/models/prompt';

describe('Helper Functions', () => {
  describe('getCurrentVersion', () => {
    it('should get current version', () => {
      // Create prompt with no versions
      const promptNoVersions = createPrompt('Test', 'Content', 'General');
      expect(getCurrentVersion(promptNoVersions)).toBeUndefined();

      // Create prompt with versions
      const prompt = createPrompt('Test', 'Content', 'General');
      const version1: PromptVersion = {
        versionId: generateUUID(),
        timestamp: new Date('2025-01-01T10:00:00Z'),
        deviceId: 'device-1',
        deviceName: 'Device 1',
        content: 'Version 1',
        title: 'Test',
        category: 'General',
      };

      const version2: PromptVersion = {
        versionId: generateUUID(),
        timestamp: new Date('2025-01-01T11:00:00Z'),
        deviceId: 'device-1',
        deviceName: 'Device 1',
        content: 'Version 2',
        title: 'Test',
        category: 'General',
      };

      const version3: PromptVersion = {
        versionId: generateUUID(),
        timestamp: new Date('2025-01-01T12:00:00Z'),
        deviceId: 'device-1',
        deviceName: 'Device 1',
        content: 'Version 3',
        title: 'Test',
        category: 'General',
      };

      // Add versions
      prompt.versions = [version1, version2, version3];

      // Should return most recent version (last in array)
      const current = getCurrentVersion(prompt);
      expect(current).toBeDefined();
      expect(current?.versionId).toBe(version3.versionId);
      expect(current?.content).toBe('Version 3');
    });

    it('should return undefined for empty versions array', () => {
      const prompt = createPrompt('Test', 'Content', 'General');
      prompt.versions = [];

      expect(getCurrentVersion(prompt)).toBeUndefined();
    });
  });

  describe('getDisplayVersionNumber', () => {
    it('should calculate display version number', () => {
      // No versions
      const promptNoVersions = createPrompt('Test', 'Content', 'General');
      expect(getDisplayVersionNumber(promptNoVersions)).toBe(0);

      // With versions
      const prompt = createPrompt('Test', 'Content', 'General');

      // Add 1 version
      prompt.versions = [
        {
          versionId: generateUUID(),
          timestamp: new Date(),
          deviceId: 'device-1',
          deviceName: 'Device 1',
          content: 'V1',
          title: 'Test',
          category: 'General',
        },
      ];
      expect(getDisplayVersionNumber(prompt)).toBe(1);

      // Add 2 more versions
      prompt.versions.push(
        {
          versionId: generateUUID(),
          timestamp: new Date(),
          deviceId: 'device-1',
          deviceName: 'Device 1',
          content: 'V2',
          title: 'Test',
          category: 'General',
        },
        {
          versionId: generateUUID(),
          timestamp: new Date(),
          deviceId: 'device-1',
          deviceName: 'Device 1',
          content: 'V3',
          title: 'Test',
          category: 'General',
        }
      );
      expect(getDisplayVersionNumber(prompt)).toBe(3);
    });

    it('should return versions.length for any number of versions', () => {
      const prompt = createPrompt('Test', 'Content', 'General');

      // Generate 10 versions
      for (let i = 1; i <= 10; i++) {
        prompt.versions.push({
          versionId: generateUUID(),
          timestamp: new Date(),
          deviceId: 'device-1',
          deviceName: 'Device 1',
          content: `Version ${i}`,
          title: 'Test',
          category: 'General',
        });

        expect(getDisplayVersionNumber(prompt)).toBe(i);
      }
    });
  });

  describe('getVersionNumber', () => {
    it('should get version number for specific version ID', () => {
      const prompt = createPrompt('Test', 'Content', 'General');

      const v1Id = generateUUID();
      const v2Id = generateUUID();
      const v3Id = generateUUID();

      prompt.versions = [
        {
          versionId: v1Id,
          timestamp: new Date('2025-01-01T10:00:00Z'),
          deviceId: 'device-1',
          deviceName: 'Device 1',
          content: 'V1',
          title: 'Test',
          category: 'General',
        },
        {
          versionId: v2Id,
          timestamp: new Date('2025-01-01T11:00:00Z'),
          deviceId: 'device-1',
          deviceName: 'Device 1',
          content: 'V2',
          title: 'Test',
          category: 'General',
        },
        {
          versionId: v3Id,
          timestamp: new Date('2025-01-01T12:00:00Z'),
          deviceId: 'device-1',
          deviceName: 'Device 1',
          content: 'V3',
          title: 'Test',
          category: 'General',
        },
      ];

      // Version numbers are 1-indexed
      expect(getVersionNumber(prompt, v1Id)).toBe(1);
      expect(getVersionNumber(prompt, v2Id)).toBe(2);
      expect(getVersionNumber(prompt, v3Id)).toBe(3);

      // Non-existent version ID returns 0
      expect(getVersionNumber(prompt, 'non-existent-id')).toBe(0);
    });

    it('should return 0 for non-existent version ID', () => {
      const prompt = createPrompt('Test', 'Content', 'General');
      prompt.versions = [
        {
          versionId: generateUUID(),
          timestamp: new Date(),
          deviceId: 'device-1',
          deviceName: 'Device 1',
          content: 'V1',
          title: 'Test',
          category: 'General',
        },
      ];

      expect(getVersionNumber(prompt, 'invalid-uuid')).toBe(0);
      expect(getVersionNumber(prompt, generateUUID())).toBe(0);
    });
  });

  describe('generateUUID', () => {
    it('should generate valid UUID v4', () => {
      const uuid = generateUUID();

      // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
      // where y is one of [8, 9, a, b]
      const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

      expect(uuid).toMatch(uuidV4Regex);
    });

    it('should generate unique UUIDs', () => {
      const uuids = new Set<string>();

      // Generate 100 UUIDs
      for (let i = 0; i < 100; i++) {
        uuids.add(generateUUID());
      }

      // All should be unique
      expect(uuids.size).toBe(100);
    });

    it('should have correct version bit (4) and variant bits (10xx)', () => {
      const uuid = generateUUID();
      const parts = uuid.split('-');

      // Version field (M in xxxxxxxx-xxxx-Mxxx-Nxxx-xxxxxxxxxxxx)
      expect(parts[2][0]).toBe('4');

      // Variant field (N in xxxxxxxx-xxxx-Mxxx-Nxxx-xxxxxxxxxxxx)
      const variantChar = parts[3][0].toLowerCase();
      expect(['8', '9', 'a', 'b']).toContain(variantChar);
    });
  });
});
