import { http, HttpResponse } from 'msw';
import type { RemotePrompt, UserQuota } from '../../../src/models/syncState';

// In-memory cloud database for sync testing
const cloudPrompts = new Map<string, RemotePrompt>();
let currentCloudId = 1;

/**
 * Time offset (in milliseconds) used to create timestamps in the past for testing.
 * This ensures that operations like "deletion before modification" work correctly
 * when savePromptDirectly() automatically sets the current time as the modification timestamp.
 */
export const TEST_PAST_TIME_OFFSET_MS = 5000;

// Quota tracking
let userQuota: UserQuota = {
  promptCount: 0,
  promptLimit: 1000,
  storageBytes: 0,
  storageLimit: 10485760, // 10 MB
  percentageUsed: 0,
};

/**
 * Generate a unique cloud ID
 */
function generateCloudId(): string {
  return `cloud-${currentCloudId++}`;
}

/**
 * Calculate storage size for a prompt
 */
function calculateStorageSize(prompt: Partial<RemotePrompt>): number {
  return Buffer.byteLength(JSON.stringify(prompt), 'utf8');
}

/**
 * Update quota based on current cloud prompts
 */
function updateQuota(): void {
  const activePrompts = Array.from(cloudPrompts.values()).filter((p) => !p.deleted_at);
  userQuota.promptCount = activePrompts.length;
  userQuota.storageBytes = activePrompts.reduce((total, p) => total + calculateStorageSize(p), 0);
  userQuota.percentageUsed = Math.round((userQuota.storageBytes / userQuota.storageLimit) * 100);
}

/**
 * MSW handlers for Supabase Edge Functions
 */
export const syncHandlers = [
  // Get user prompts (with optional filtering)
  http.post('*/functions/v1/get-user-prompts', async ({ request }) => {
    try {
      const body = (await request.json()) as { since?: string; includeDeleted?: boolean };
      const { since, includeDeleted = false } = body;

      let prompts = Array.from(cloudPrompts.values());

      // Filter by date if provided
      if (since) {
        const sinceDate = new Date(since);
        prompts = prompts.filter((p) => new Date(p.updated_at) > sinceDate);
      }

      // Filter deleted prompts unless explicitly requested
      if (!includeDeleted) {
        prompts = prompts.filter((p) => !p.deleted_at);
      }

      return HttpResponse.json({ prompts });
    } catch (error) {
      return HttpResponse.json(
        { error: 'Failed to fetch prompts', message: String(error) },
        { status: 500 }
      );
    }
  }),

  // Sync prompt (create or update with optimistic locking)
  http.post('*/functions/v1/sync-prompt', async ({ request }) => {
    try {
      const body = (await request.json()) as {
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
        metadata: {
          created: string;
          modified: string;
          usageCount: number;
          lastUsed?: string;
          context?: unknown;
        };
        sync_metadata: {
          lastModifiedDeviceId: string;
          lastModifiedDeviceName: string;
        };
      };

      const { cloudId, expectedVersion, contentHash, ...promptData } = body;

      // UPDATE existing prompt
      if (cloudId) {
        const existingPrompt = cloudPrompts.get(cloudId);

        if (!existingPrompt) {
          return HttpResponse.json(
            { error: 'Prompt not found', message: 'Cloud prompt does not exist' },
            { status: 404 }
          );
        }

        // Check if prompt is soft-deleted (409 conflict with specific error code)
        if (existingPrompt.deleted_at) {
          return HttpResponse.json(
            {
              success: false,
              error: 'PROMPT_DELETED',
              message: 'Cannot update a soft-deleted prompt',
              details: {
                cloudId: existingPrompt.cloud_id,
                deletedAt: existingPrompt.deleted_at,
                deletedByDevice: existingPrompt.deleted_by_device_id,
              },
            },
            { status: 409 }
          );
        }

        // Optimistic locking check (version mismatch)
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

        cloudPrompts.set(cloudId, updatedPrompt);
        updateQuota();

        return HttpResponse.json({
          cloudId: cloudId,
          version: updatedPrompt.version,
        });
      }

      // CREATE new prompt
      const newCloudId = generateCloudId();
      const newPrompt: RemotePrompt = {
        cloud_id: newCloudId,
        content_hash: contentHash,
        version: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        deleted_at: null,
        ...promptData,
      };

      cloudPrompts.set(newCloudId, newPrompt);
      updateQuota();

      return HttpResponse.json({
        cloudId: newCloudId,
        version: 1,
      });
    } catch (error) {
      return HttpResponse.json(
        { error: 'Failed to sync prompt', message: String(error) },
        { status: 500 }
      );
    }
  }),

  // Delete prompt (soft-delete)
  http.post('*/functions/v1/delete-prompt', async ({ request }) => {
    try {
      const body = (await request.json()) as { cloudId: string; deviceId: string };
      const { cloudId } = body;

      const prompt = cloudPrompts.get(cloudId);
      if (!prompt) {
        return HttpResponse.json(
          { error: 'Prompt not found', message: 'Cloud prompt does not exist' },
          { status: 404 }
        );
      }

      // Soft-delete by setting deleted_at timestamp
      prompt.deleted_at = new Date().toISOString();
      cloudPrompts.set(cloudId, prompt);
      updateQuota();

      return HttpResponse.json({ success: true });
    } catch (error) {
      return HttpResponse.json(
        { error: 'Failed to delete prompt', message: String(error) },
        { status: 500 }
      );
    }
  }),

  // Restore deleted prompt
  http.post('*/functions/v1/restore-prompt', async ({ request }) => {
    try {
      const body = (await request.json()) as { cloudId: string };
      const { cloudId } = body;

      const prompt = cloudPrompts.get(cloudId);
      if (!prompt) {
        return HttpResponse.json(
          { error: 'Prompt not found', message: 'Cloud prompt does not exist' },
          { status: 404 }
        );
      }

      // Restore by clearing deleted_at
      prompt.deleted_at = null;
      prompt.updated_at = new Date().toISOString();
      cloudPrompts.set(cloudId, prompt);
      updateQuota();

      return HttpResponse.json({ success: true });
    } catch (error) {
      return HttpResponse.json(
        { error: 'Failed to restore prompt', message: String(error) },
        { status: 500 }
      );
    }
  }),

  // Get user quota
  http.post('*/functions/v1/get-user-quota', async () => {
    try {
      return HttpResponse.json(userQuota);
    } catch (error) {
      return HttpResponse.json(
        { error: 'Failed to fetch quota', message: String(error) },
        { status: 500 }
      );
    }
  }),
];

/**
 * Test helper utilities for sync tests
 */
export const syncTestHelpers = {
  /**
   * Add a prompt to the cloud database
   */
  addCloudPrompt(prompt: Omit<RemotePrompt, 'id' | 'user_id' | 'cloud_id' | 'version' | 'created_at' | 'updated_at'>): RemotePrompt {
    const cloudId = generateCloudId();
    const fullPrompt: RemotePrompt = {
      id: cloudId, // Database record ID (same as cloud_id for simplicity in tests)
      user_id: 'test-user@promptbank.test', // Mock user ID
      cloud_id: cloudId,
      version: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...prompt,
    };
    cloudPrompts.set(cloudId, fullPrompt);
    updateQuota();
    return fullPrompt;
  },

  /**
   * Update an existing cloud prompt
   */
  updateCloudPrompt(cloudId: string, updates: Partial<RemotePrompt>): RemotePrompt | undefined {
    const prompt = cloudPrompts.get(cloudId);
    if (!prompt) {
      return undefined;
    }

    const updatedPrompt: RemotePrompt = {
      ...prompt,
      ...updates,
      version: prompt.version + 1,
      updated_at: new Date().toISOString(),
    };
    cloudPrompts.set(cloudId, updatedPrompt);
    updateQuota();
    return updatedPrompt;
  },

  /**
   * Soft-delete a cloud prompt
   * @param cloudId - The cloud ID of the prompt to delete
   * @param deletedAt - Optional deletion timestamp (defaults to now)
   */
  deleteCloudPrompt(cloudId: string, deletedAt?: Date): boolean {
    const prompt = cloudPrompts.get(cloudId);
    if (!prompt) {
      return false;
    }
    prompt.deleted_at = (deletedAt ?? new Date()).toISOString();
    cloudPrompts.set(cloudId, prompt);
    updateQuota();
    return true;
  },

  /**
   * Soft-delete a cloud prompt with a timestamp in the past.
   * Use this when testing DELETE-MODIFY conflicts where local modifications
   * (made via savePromptDirectly) should be detected as "after" the deletion.
   * @param cloudId - The cloud ID of the prompt to delete
   */
  deleteCloudPromptInPast(cloudId: string): boolean {
    const pastDeletionTime = new Date(Date.now() - TEST_PAST_TIME_OFFSET_MS);
    return this.deleteCloudPrompt(cloudId, pastDeletionTime);
  },

  /**
   * Get a cloud prompt by ID
   */
  getCloudPrompt(cloudId: string): RemotePrompt | undefined {
    return cloudPrompts.get(cloudId);
  },

  /**
   * Get all cloud prompts (including deleted if requested)
   */
  getAllCloudPrompts(includeDeleted = false): RemotePrompt[] {
    const prompts = Array.from(cloudPrompts.values());
    return includeDeleted ? prompts : prompts.filter((p) => !p.deleted_at);
  },

  /**
   * Clear all cloud prompts (reset database)
   */
  clearCloudDatabase(): void {
    cloudPrompts.clear();
    currentCloudId = 1;
    updateQuota();
  },

  /**
   * Set custom quota limits for testing
   */
  setQuota(quota: Partial<UserQuota>): void {
    userQuota = { ...userQuota, ...quota };
  },

  /**
   * Reset quota to defaults
   */
  resetQuota(): void {
    userQuota = {
      promptCount: 0,
      promptLimit: 1000,
      storageBytes: 0,
      storageLimit: 10485760,
      percentageUsed: 0,
    };
    updateQuota();
  },

  /**
   * Simulate version conflict for optimistic locking tests
   * This marks the prompt to always fail version checks
   */
  simulateVersionConflict(cloudId: string): void {
    const prompt = cloudPrompts.get(cloudId);
    if (prompt) {
      // Increment version to cause mismatch
      prompt.version = prompt.version + 1;
      cloudPrompts.set(cloudId, prompt);
    }
  },

  /**
   * Get current cloud database size for debugging
   */
  getCloudDatabaseSize(): number {
    return cloudPrompts.size;
  },
};
