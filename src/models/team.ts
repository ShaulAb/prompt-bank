// ────────────────────────────────────────────────────────────────────────────
// Team Model
// ────────────────────────────────────────────────────────────────────────────

/** Team roles in descending order of privilege */
export type TeamRole = 'owner' | 'admin' | 'editor' | 'viewer';

/** Role hierarchy for permission checks (higher = more privilege) */
const ROLE_RANK: Record<TeamRole, number> = {
  owner: 4,
  admin: 3,
  editor: 2,
  viewer: 1,
};

/**
 * Team data returned from the get-user-teams Edge Function
 */
export interface Team {
  /** Unique team identifier */
  id: string;

  /** Team display name */
  name: string;

  /** Optional team description */
  description: string | null;

  /** Current user's role in this team */
  role: TeamRole;

  /** Number of team members */
  memberCount: number;

  /** When the team was created */
  createdAt: string;
}

/**
 * Check if a role has at least the given minimum privilege level
 */
export function hasMinRole(userRole: TeamRole, minRole: TeamRole): boolean {
  return ROLE_RANK[userRole] >= ROLE_RANK[minRole];
}

/**
 * Check if the user can create or edit prompts in this team (editor+)
 */
export function canEdit(role: TeamRole): boolean {
  return hasMinRole(role, 'editor');
}

/**
 * Check if the user can delete prompts in this team (admin+)
 */
export function canDelete(role: TeamRole): boolean {
  return hasMinRole(role, 'admin');
}
