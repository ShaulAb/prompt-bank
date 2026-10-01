/**
 * RBAC unit tests for team role hierarchy and permission checks.
 *
 * Tests the pure functions in models/team.ts (hasMinRole, canEdit, canDelete)
 * and verifies TeamTransport.getWritePermission() maps roles correctly.
 */

import { describe, it, expect } from 'vitest';
import {
  hasMinRole,
  canEdit,
  canDelete,
  type TeamRole,
} from '../src/models/team';
import { TeamTransport } from '../src/services/sync/teamTransport';

// ──────────────────────────────────────────────────────────
// hasMinRole — role hierarchy checks
// ──────────────────────────────────────────────────────────

describe('hasMinRole', () => {
  const roles: TeamRole[] = ['viewer', 'editor', 'admin', 'owner'];

  it('should grant every role its own level', () => {
    for (const role of roles) {
      expect(hasMinRole(role, role)).toBe(true);
    }
  });

  it('should grant higher roles access to lower thresholds', () => {
    expect(hasMinRole('owner', 'viewer')).toBe(true);
    expect(hasMinRole('owner', 'editor')).toBe(true);
    expect(hasMinRole('owner', 'admin')).toBe(true);
    expect(hasMinRole('admin', 'viewer')).toBe(true);
    expect(hasMinRole('admin', 'editor')).toBe(true);
    expect(hasMinRole('editor', 'viewer')).toBe(true);
  });

  it('should deny lower roles access to higher thresholds', () => {
    expect(hasMinRole('viewer', 'editor')).toBe(false);
    expect(hasMinRole('viewer', 'admin')).toBe(false);
    expect(hasMinRole('viewer', 'owner')).toBe(false);
    expect(hasMinRole('editor', 'admin')).toBe(false);
    expect(hasMinRole('editor', 'owner')).toBe(false);
    expect(hasMinRole('admin', 'owner')).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────
// canEdit — editor+ required
// ──────────────────────────────────────────────────────────

describe('canEdit', () => {
  it('should allow editor, admin, and owner', () => {
    expect(canEdit('editor')).toBe(true);
    expect(canEdit('admin')).toBe(true);
    expect(canEdit('owner')).toBe(true);
  });

  it('should deny viewer', () => {
    expect(canEdit('viewer')).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────
// canDelete — admin+ required
// ──────────────────────────────────────────────────────────

describe('canDelete', () => {
  it('should allow admin and owner', () => {
    expect(canDelete('admin')).toBe(true);
    expect(canDelete('owner')).toBe(true);
  });

  it('should deny viewer and editor', () => {
    expect(canDelete('viewer')).toBe(false);
    expect(canDelete('editor')).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────
// TeamTransport.getWritePermission — role → sync permission mapping
// ──────────────────────────────────────────────────────────

describe('TeamTransport.getWritePermission', () => {
  function getPerms(role: TeamRole) {
    const transport = new TeamTransport(
      {} as any, // context — not used by getWritePermission
      {} as any, // authService — not used by getWritePermission
      'team-1',
      role
    );
    return transport.getWritePermission();
  }

  it('viewer: cannot upload, cannot delete', () => {
    const perms = getPerms('viewer');
    expect(perms.canUpload).toBe(false);
    expect(perms.canDelete).toBe(false);
  });

  it('editor: can upload, cannot delete', () => {
    const perms = getPerms('editor');
    expect(perms.canUpload).toBe(true);
    expect(perms.canDelete).toBe(false);
  });

  it('admin: can upload, can delete', () => {
    const perms = getPerms('admin');
    expect(perms.canUpload).toBe(true);
    expect(perms.canDelete).toBe(true);
  });

  it('owner: can upload, can delete', () => {
    const perms = getPerms('owner');
    expect(perms.canUpload).toBe(true);
    expect(perms.canDelete).toBe(true);
  });
});
