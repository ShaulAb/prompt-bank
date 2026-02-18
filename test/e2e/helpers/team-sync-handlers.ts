import { http, HttpResponse } from 'msw';
import type { RemotePrompt } from '../../../src/models/syncState';
import type { TeamRole } from '../../../src/models/team';
import { computeContentHash } from '../../../src/utils/contentHash';
import type { Prompt } from '../../../src/models/prompt';

// In-memory per-team cloud database for team sync testing
const teamCloudPrompts = new Map<string, Map<string, RemotePrompt>>();
let currentTeamCloudId = 1;

// Role tracking per team (teamId -> role)
let mockTeamRoles = new Map<string, TeamRole>();

/**
 * Time offset for creating timestamps in the past (for testing)
 */
export const TEAM_TEST_PAST_TIME_OFFSET_MS = 5000;

function getTeamDb(teamId: string): Map<string, RemotePrompt> {
  if (!teamCloudPrompts.has(teamId)) {
    teamCloudPrompts.set(teamId, new Map());
  }
  return teamCloudPrompts.get(teamId)!;
}

function generateTeamCloudId(): string {
  return `team-cloud-${currentTeamCloudId++}`;
}

/**
 * MSW handlers for team edge functions
 */
export const teamSyncHandlers = [
  // Get team prompts
  http.post('*/functions/v1/get-team-prompts', async ({ request }) => {
    try {
      const body = (await request.json()) as {
        teamId: string;
        includeDeleted?: boolean;
      };
      const { teamId, includeDeleted = false } = body;

      const role = mockTeamRoles.get(teamId);
      if (!role) {
        return HttpResponse.json(
          { error: 'Forbidden', message: 'You are not a member of this team.' },
          { status: 403 }
        );
      }

      const db = getTeamDb(teamId);
      let prompts = Array.from(db.values());

      if (!includeDeleted) {
        prompts = prompts.filter((p) => !p.deleted_at);
      }

      return HttpResponse.json({ prompts });
    } catch (error) {
      return HttpResponse.json(
        { error: 'Failed to fetch team prompts', message: String(error) },
        { status: 500 }
      );
    }
  }),

  // Sync team prompt (create or update with optimistic locking + role check)
  http.post('*/functions/v1/sync-team-prompt', async ({ request }) => {
    try {
      const body = (await request.json()) as {
        teamId: string;
        cloudId?: string;
        expectedVersion?: number;
        contentHash: string;
        local_id: string;
        title: string;
        content: string;
        description?: string | null;
        category: string;
        prompt_order?: number | null;
        category_order?: number | null;
        variables: unknown[];
        sync_metadata: {
          lastModifiedDeviceId: string;
          lastModifiedDeviceName: string;
        };
      };

      const { teamId, cloudId, expectedVersion, contentHash, ...promptData } = body;

      // Role check: editor+ required for writes
      const role = mockTeamRoles.get(teamId);
      if (!role || role === 'viewer') {
        return HttpResponse.json(
          {
            success: false,
            error: 'INSUFFICIENT_ROLE',
            message: 'Insufficient permissions to edit team prompts.',
          },
          { status: 403 }
        );
      }

      const db = getTeamDb(teamId);

      // UPDATE existing prompt
      if (cloudId) {
        const existingPrompt = db.get(cloudId);

        if (!existingPrompt) {
          return HttpResponse.json(
            { error: 'Prompt not found', message: 'Cloud prompt does not exist' },
            { status: 404 }
          );
        }

        // Check if prompt is soft-deleted
        if (existingPrompt.deleted_at) {
          return HttpResponse.json(
            {
              success: false,
              error: 'PROMPT_DELETED',
              message: 'Cannot update a soft-deleted prompt',
              details: {
                cloudId: existingPrompt.cloud_id,
                deletedAt: existingPrompt.deleted_at,
              },
            },
            { status: 409 }
          );
        }

        // Optimistic locking check
        if (expectedVersion !== undefined && existingPrompt.version !== expectedVersion) {
          return HttpResponse.json(
            {
              success: false,
              error: 'VERSION_CONFLICT',
              message: 'Prompt version has changed since last sync',
              details: {
                expectedVersion,
                actualVersion: existingPrompt.version,
                lastModifiedAt: existingPrompt.updated_at,
              },
            },
            { status: 409 }
          );
        }

        // Update prompt
        const updatedPrompt: RemotePrompt = {
          ...existingPrompt,
          ...promptData,
          content_hash: contentHash,
          version: existingPrompt.version + 1,
          updated_at: new Date().toISOString(),
        };

        db.set(cloudId, updatedPrompt);

        return HttpResponse.json({
          cloudId: cloudId,
          version: updatedPrompt.version,
        });
      }

      // CREATE new prompt
      const newCloudId = generateTeamCloudId();
      const newPrompt: RemotePrompt = {
        id: newCloudId,
        user_id: 'test-user@promptbank.test',
        workspace_id: teamId,
        cloud_id: newCloudId,
        content_hash: contentHash,
        version: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        deleted_at: null,
        ...promptData,
      };

      db.set(newCloudId, newPrompt);

      return HttpResponse.json({
        cloudId: newCloudId,
        version: 1,
      });
    } catch (error) {
      return HttpResponse.json(
        { error: 'Failed to sync team prompt', message: String(error) },
        { status: 500 }
      );
    }
  }),
];

/**
 * Test helper utilities for team sync tests
 */
export const teamSyncTestHelpers = {
  /**
   * Set the mock role for a team
   */
  setMockRole(teamId: string, role: TeamRole): void {
    mockTeamRoles.set(teamId, role);
  },

  /**
   * Add a prompt to the team cloud database
   */
  addTeamCloudPrompt(
    teamId: string,
    prompt: Partial<RemotePrompt> & { title: string; content: string; category: string }
  ): RemotePrompt {
    const db = getTeamDb(teamId);
    const cloudId = generateTeamCloudId();

    // Compute content hash from the prompt fields the same way the extension does
    const mockPrompt: Prompt = {
      id: prompt.local_id || cloudId,
      title: prompt.title,
      content: prompt.content,
      category: prompt.category,
      variables: [],
      metadata: { created: new Date(), modified: new Date(), usageCount: 0 },
    };
    const contentHash = prompt.content_hash || computeContentHash(mockPrompt);

    const fullPrompt: RemotePrompt = {
      id: cloudId,
      user_id: 'test-user@promptbank.test',
      workspace_id: teamId,
      cloud_id: cloudId,
      local_id: prompt.local_id || null,
      description: prompt.description || null,
      prompt_order: prompt.prompt_order ?? null,
      category_order: prompt.category_order ?? null,
      variables: prompt.variables || [],
      metadata: prompt.metadata || {
        created: new Date().toISOString(),
        modified: new Date().toISOString(),
        usageCount: 0,
      },
      sync_metadata: prompt.sync_metadata || {
        lastModifiedDeviceId: 'test-device-id',
        lastModifiedDeviceName: 'Test Device',
      },
      content_hash: contentHash,
      version: prompt.version || 1,
      created_at: prompt.created_at || new Date().toISOString(),
      updated_at: prompt.updated_at || new Date().toISOString(),
      deleted_at: prompt.deleted_at ?? null,
      title: prompt.title,
      content: prompt.content,
      category: prompt.category,
    };

    db.set(cloudId, fullPrompt);
    return fullPrompt;
  },

  /**
   * Update an existing team cloud prompt
   */
  updateTeamCloudPrompt(
    teamId: string,
    cloudId: string,
    updates: Partial<RemotePrompt>
  ): RemotePrompt | undefined {
    const db = getTeamDb(teamId);
    const prompt = db.get(cloudId);
    if (!prompt) return undefined;

    const updatedPrompt: RemotePrompt = {
      ...prompt,
      ...updates,
      version: prompt.version + 1,
      updated_at: new Date().toISOString(),
    };

    // Recompute content hash if title/content/category changed
    if (updates.title || updates.content || updates.category) {
      const mockPrompt: Prompt = {
        id: updatedPrompt.local_id || updatedPrompt.cloud_id,
        title: updatedPrompt.title,
        content: updatedPrompt.content,
        category: updatedPrompt.category,
        variables: [],
        metadata: { created: new Date(), modified: new Date(), usageCount: 0 },
      };
      updatedPrompt.content_hash = computeContentHash(mockPrompt);
    }

    db.set(cloudId, updatedPrompt);
    return updatedPrompt;
  },

  /**
   * Soft-delete a team cloud prompt
   */
  deleteTeamCloudPrompt(teamId: string, cloudId: string, deletedAt?: Date): boolean {
    const db = getTeamDb(teamId);
    const prompt = db.get(cloudId);
    if (!prompt) return false;

    prompt.deleted_at = (deletedAt ?? new Date()).toISOString();
    db.set(cloudId, prompt);
    return true;
  },

  /**
   * Soft-delete a team cloud prompt in the past
   */
  deleteTeamCloudPromptInPast(teamId: string, cloudId: string): boolean {
    const pastTime = new Date(Date.now() - TEAM_TEST_PAST_TIME_OFFSET_MS);
    return this.deleteTeamCloudPrompt(teamId, cloudId, pastTime);
  },

  /**
   * Get a team cloud prompt
   */
  getTeamCloudPrompt(teamId: string, cloudId: string): RemotePrompt | undefined {
    return getTeamDb(teamId).get(cloudId);
  },

  /**
   * Get all team cloud prompts
   */
  getAllTeamCloudPrompts(teamId: string, includeDeleted = false): RemotePrompt[] {
    const prompts = Array.from(getTeamDb(teamId).values());
    return includeDeleted ? prompts : prompts.filter((p) => !p.deleted_at);
  },

  /**
   * Clear all team data (reset)
   */
  clearAllTeamData(): void {
    teamCloudPrompts.clear();
    mockTeamRoles.clear();
    currentTeamCloudId = 1;
  },

  /**
   * Simulate version conflict for a team prompt
   */
  simulateVersionConflict(teamId: string, cloudId: string): void {
    const db = getTeamDb(teamId);
    const prompt = db.get(cloudId);
    if (prompt) {
      prompt.version = prompt.version + 1;
      db.set(cloudId, prompt);
    }
  },
};
