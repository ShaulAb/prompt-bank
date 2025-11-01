# Personal Prompt Sync Feature - Implementation Plan

## Overview
Implement a simplified personal sync feature that allows users to sync prompts across devices using Google OAuth and Supabase. Focus on simplicity and pragmatism - prompts are just small text files.

**UPDATED TIMELINE**: 8-9 days (was 6-7 days)
**Reason**: Added critical design decisions and safety mechanisms to prevent data loss, race conditions, and infinite loops.

---

## Phase 0: Design Decisions (Day 0 - CRITICAL)

**Purpose**: Make architectural decisions upfront to prevent mid-implementation refactoring and data loss bugs.

### Decision 1: Sync State Storage ✅ DECIDED
**Problem**: Embedding `syncMetadata` in Prompt objects causes infinite loops (updating sync metadata triggers `modified` timestamp update, which triggers another sync check).

**Options:**
- A) Embed `syncMetadata` in Prompt objects (simpler, but causes infinite loops)
- B) Separate `sync-state.json` file (cleaner, no side effects)

**CHOICE: B - Separate sync-state.json file**

**Rationale**:
- Keeps prompt objects clean and unmodified by sync operations
- No risk of triggering modification timestamps
- Easier to debug sync issues (all sync state in one file)
- Follows separation of concerns principle

**Implementation**:
```typescript
// File: src/models/syncState.ts (NEW)
interface SyncState {
  userId: string;                    // From Google OAuth
  deviceId: string;                  // Stable device identifier
  deviceName: string;                // User-friendly device name
  lastSyncedAt?: Date;               // Last successful sync
  promptSyncMap: Record<string, PromptSyncInfo>;
}

interface PromptSyncInfo {
  cloudId: string;                   // UUID in cloud storage
  lastSyncedContentHash: string;     // SHA256 of (title+content+category)
  lastSyncedAt: Date;                // When this prompt was last synced
}

// File: src/storage/syncStateStorage.ts (NEW)
class SyncStateStorage {
  private readonly syncStateFile = '.vscode/prompt-bank/sync-state.json';

  async getSyncState(): Promise<SyncState | null> { /* ... */ }
  async updateSyncState(state: Partial<SyncState>): Promise<void> { /* ... */ }
  async getPromptSyncInfo(promptId: string): Promise<PromptSyncInfo | null> { /* ... */ }
  async setPromptSyncInfo(promptId: string, info: PromptSyncInfo): Promise<void> { /* ... */ }
}
```

---

### Decision 2: Deletion Handling ✅ DECIDED
**Problem**: When user deletes a prompt on Device A, what happens on Device B after sync?

**Options:**
- A) Ignore deletions - deleted prompts reappear on next sync (simple, MVP)
- B) Sync deletions with tombstones (complex, requires tracking deleted IDs)

**CHOICE: A - Ignore deletions for MVP**

**Rationale**:
- Deletions are less common than edits
- "Resurrection" of deleted prompts is annoying but not data-losing
- Keeps MVP simple and focused
- Can add tombstone deletion in v0.8.0 based on user feedback

**Documentation**:
- Add to README: "Note: Deleted prompts may reappear after syncing if they still exist on other devices. To permanently delete, remove from all devices."
- Log issue for future enhancement: "Sync prompt deletions across devices"

---

### Decision 3: First Sync Conflict Detection ✅ DECIDED
**Problem**: Device A has "API Template" v1, Device B has "API Template" v2 (different content). First sync → one version silently lost?

**Options:**
- A) Last-write-wins by timestamp (risk: silent data loss if content differs)
- B) Check content hash - create duplicates if content differs even on first sync

**CHOICE: B - Content-hash conflict detection on first sync**

**Rationale**:
- Data safety is paramount - never silently lose user data
- First sync is rare (once per device)
- Users prefer seeing duplicates to losing work
- Content hash comparison is cheap (prompts are small)

**Implementation**:
```typescript
// In computeSyncPlan()
if (!lastSync) {
  // First sync - but still check for content conflicts
  const localHash = computeContentHash(local);
  const remoteHash = computeContentHash(remote);

  if (localHash !== remoteHash) {
    // Same ID, different content → conflict even on first sync
    plan.conflicts.push({ local, remote });
  } else if (local.metadata.modified > remote.updated_at) {
    plan.toUpload.push(local);  // Local is newer
  }
  // else: remote is newer, will download in next loop
}
```

---

### Decision 4: Edge Function Design ✅ DECIDED
**Problem**: Single-prompt endpoint (simple, N round-trips) vs. batch endpoint (complex, 1 round-trip)?

**Options:**
- A) Single-prompt endpoint: `POST /sync-prompt` (simple, called N times)
- B) Batch transaction endpoint: `POST /sync-batch` (complex, single call)

**CHOICE: A - Single-prompt endpoint for MVP**

**Rationale**:
- Prompts are tiny (~2KB average)
- 100 prompts × 2KB = 200KB total → negligible bandwidth
- Sequential sync completes in ~2-3 seconds for 100 prompts
- Simpler error handling (retry individual prompts on failure)
- Edge functions have 60-second timeout (plenty for sequential)

**Trade-off Acknowledged**:
- If users have 500+ prompts, may revisit batch endpoint
- For MVP (targeting <200 prompts), single-prompt is sufficient

---

### Decision 5: Optimistic Locking ✅ DECIDED
**Problem**: Device A and Device B simultaneously upload to same prompt → race condition, last-write-wins, no conflict detection.

**Options:**
- A) No locking - accept race condition risk (simple, rare edge case)
- B) Optimistic locking with version column (industry standard)

**CHOICE: B - Optimistic locking with version column**

**Rationale**:
- Industry-standard approach (used by Notion, Figma, etc.)
- Prevents silent data loss in race conditions
- Minimal complexity (one SQL column + WHERE clause)
- Performance cost is negligible (single integer comparison)

**Implementation**:
```sql
-- Migration: Add version column
ALTER TABLE user_prompts ADD COLUMN version INTEGER DEFAULT 1;

-- Trigger to auto-increment version
CREATE OR REPLACE FUNCTION increment_version()
RETURNS TRIGGER AS $$
BEGIN
  NEW.version = OLD.version + 1;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER user_prompts_version_trigger
BEFORE UPDATE ON user_prompts
FOR EACH ROW EXECUTE FUNCTION increment_version();
```

```typescript
// Edge function checks version before update
const { cloudId, expectedVersion, ...promptData } = req.body;

if (cloudId) {
  const { data } = await supabase
    .from('user_prompts')
    .update(promptData)
    .eq('cloud_id', cloudId)
    .eq('version', expectedVersion)  // Optimistic lock check
    .select('version')
    .single();

  if (!data) {
    // Version mismatch → conflict detected
    return { success: false, error: 'conflict' };
  }
}
```

---

### Decision 6: Content Hash Algorithm ✅ DECIDED
**Problem**: Need to detect content changes reliably. Which hash algorithm?

**Options:**
- A) MD5 (fast, but cryptographically weak)
- B) SHA256 (standard, secure)

**CHOICE: B - SHA256**

**Rationale**:
- SHA256 is Node.js built-in (no dependencies)
- Performance difference is negligible for small prompts
- Industry standard for content hashing
- Future-proof (MD5 is deprecated)

**Implementation**:
```typescript
import { createHash } from 'crypto';

function computeContentHash(prompt: Prompt): string {
  const canonical = JSON.stringify({
    title: prompt.title.trim(),
    content: prompt.content.trim(),
    category: prompt.category.trim()
  });
  return createHash('sha256').update(canonical).digest('hex');
}
```

---

## Phase 1: Core Sync Implementation (Days 1-4) [UPDATED: was Days 1-3]

### 1.1 Data Model Extension [UPDATED]
**File**: `src/models/syncState.ts` (NEW)

- [ ] Create `SyncState` interface:
  ```typescript
  export interface SyncState {
    userId: string;                    // From Google OAuth
    deviceId: string;                  // Stable device identifier
    deviceName: string;                // User-friendly device name
    lastSyncedAt?: Date;               // Last successful sync
    promptSyncMap: Record<string, PromptSyncInfo>;  // Map: promptId → sync info
  }

  export interface PromptSyncInfo {
    cloudId: string;                   // UUID in cloud storage
    lastSyncedContentHash: string;     // SHA256 of (title+content+category)
    lastSyncedAt: Date;                // When this prompt was last synced
  }
  ```

**File**: `src/storage/syncStateStorage.ts` (NEW)

- [ ] Create `SyncStateStorage` class:
  ```typescript
  export class SyncStateStorage {
    private readonly syncStateFile: string;  // .vscode/prompt-bank/sync-state.json

    constructor(workspaceRoot: string) {
      this.syncStateFile = path.join(workspaceRoot, '.vscode/prompt-bank/sync-state.json');
    }

    async getSyncState(): Promise<SyncState | null>;
    async updateSyncState(state: Partial<SyncState>): Promise<void>;
    async getPromptSyncInfo(promptId: string): Promise<PromptSyncInfo | null>;
    async setPromptSyncInfo(promptId: string, info: PromptSyncInfo): Promise<void>;
    async removePromptSyncInfo(promptId: string): Promise<void>;
    async clearAllSyncState(): Promise<void>;  // For sign-out
  }
  ```

- [ ] Add utility functions for device ID generation:
  ```typescript
  // File: src/utils/deviceId.ts (NEW)
  import { createHash } from 'crypto';
  import * as os from 'os';
  import * as vscode from 'vscode';

  export function generateDeviceId(context: vscode.ExtensionContext): string {
    // Check global state first (stable across sessions)
    const existingId = context.globalState.get<string>('deviceId');
    if (existingId) {
      return existingId;
    }

    // Generate new stable device ID
    const hostname = os.hostname();
    const username = os.userInfo().username;
    const appName = vscode.env.appName;  // "Visual Studio Code" or "Cursor"

    const deviceId = createHash('sha256')
      .update(`${hostname}:${username}:${appName}`)
      .digest('hex')
      .substring(0, 16);  // First 16 chars

    // Store in global state for reuse
    context.globalState.update('deviceId', deviceId);
    return deviceId;
  }

  export function getDeviceName(): string {
    const hostname = os.hostname();
    const platform = os.platform();

    // Auto-detect friendly name
    if (platform === 'darwin') {
      return `${hostname} (Mac)`;
    } else if (platform === 'win32') {
      return `${hostname} (Windows)`;
    } else {
      return `${hostname} (Linux)`;
    }
  }
  ```

- [ ] Add content hash utility:
  ```typescript
  // File: src/utils/contentHash.ts (NEW)
  import { createHash } from 'crypto';
  import { Prompt } from '../models/prompt';

  export function computeContentHash(prompt: Prompt): string {
    // Canonical representation for hashing
    const canonical = JSON.stringify({
      title: prompt.title.trim(),
      content: prompt.content.trim(),
      category: prompt.category.trim()
    });

    return createHash('sha256')
      .update(canonical)
      .digest('hex');
  }
  ```

**CRITICAL CHANGE**: Do NOT modify `Prompt` interface. Sync state is completely separate from prompt objects to avoid infinite loops.

**Leverage existing**: The codebase already has well-structured models with metadata tracking - we keep prompts clean and add separate sync state tracking.

### 1.2 Sync Service Creation [UPDATED]
**New File**: `src/services/syncService.ts`

- [ ] Create `SyncService` class following existing service patterns (singleton like `AuthService`)

- [ ] Implement core sync methods:

  **Main sync function with pre-flight checks:**
  ```typescript
  async performSync(promptId?: string): Promise<SyncResult> {
    // 1. Authentication check
    const user = await this.authService.getUser();
    if (!user) {
      throw new Error('Please sign in to sync');
    }

    // 2. Fetch remote prompts
    const remotePrompts = await this.fetchRemotePrompts(user.email);

    // 3. Get local prompts
    const localPrompts = promptId
      ? [await this.promptService.getPrompt(promptId)]
      : await this.promptService.getAllPrompts();

    // 4. Compute sync plan (three-way merge)
    const syncState = await this.syncStateStorage.getSyncState();
    const syncPlan = this.computeSyncPlan(
      localPrompts,
      remotePrompts,
      syncState?.lastSyncedAt,
      syncState?.promptSyncMap || {}
    );

    // 5. PRE-FLIGHT QUOTA CHECK (CRITICAL - prevents partial sync failures)
    await this.checkQuotaBeforeSync(syncPlan);

    // 6. Execute sync plan
    const result = await this.executeSyncPlan(syncPlan);

    // 7. Update sync state
    await this.syncStateStorage.updateSyncState({
      lastSyncedAt: new Date(),
      userId: user.email
    });

    return result;
  }
  ```

  **Pre-flight quota check (prevents partial failures):**
  ```typescript
  private async checkQuotaBeforeSync(plan: SyncPlan): Promise<void> {
    const quota = await this.fetchUserQuota();

    const promptsToUpload = plan.toUpload.length;
    if (quota.promptCount + promptsToUpload > quota.promptLimit) {
      const overage = promptsToUpload - (quota.promptLimit - quota.promptCount);
      throw new Error(
        `Cannot sync: would exceed limit by ${overage} prompts. ` +
        `Delete ${overage} prompts and try again.`
      );
    }

    const uploadSize = this.calculateUploadSize(plan.toUpload);
    if (quota.storageBytes + uploadSize > quota.storageLimit) {
      const overageMB = ((quota.storageBytes + uploadSize - quota.storageLimit) / 1048576).toFixed(1);
      throw new Error(
        `Cannot sync: would exceed 10 MB storage limit by ${overageMB} MB. ` +
        `Delete some prompts and try again.`
      );
    }
  }
  ```

  **Three-way merge with content-hash conflict detection:**
  ```typescript
  private computeSyncPlan(
    local: Prompt[],
    remote: RemotePrompt[],
    lastSync: Date | undefined,
    promptSyncMap: Record<string, PromptSyncInfo>
  ): SyncPlan {
    const plan: SyncPlan = {
      toUpload: [],
      toDownload: [],
      conflicts: []
    };

    // Build lookup maps
    const localMap = new Map(local.map(p => [p.id, p]));
    const remoteMap = new Map<string, RemotePrompt>();

    // Map remote prompts by cloudId (from sync state)
    for (const remoteProm of remote) {
      remoteMap.set(remoteProm.cloud_id, remoteProm);
    }

    // Process local prompts
    for (const prompt of local) {
      const syncInfo = promptSyncMap[prompt.id];
      const cloudId = syncInfo?.cloudId;
      const remotePrompt = cloudId ? remoteMap.get(cloudId) : null;

      if (!remotePrompt) {
        // New local prompt - upload
        plan.toUpload.push(prompt);
      } else {
        // Prompt exists both locally and remotely
        const localModified = prompt.metadata.modified;
        const remoteModified = new Date(remotePrompt.updated_at);

        // Compute content hashes
        const localHash = computeContentHash(prompt);
        const remoteHash = remotePrompt.content_hash;  // Stored in DB
        const lastSyncHash = syncInfo?.lastSyncedContentHash;

        if (!lastSync) {
          // FIRST SYNC - Check content hash for conflicts
          if (localHash !== remoteHash) {
            // Same prompt ID, different content → conflict
            plan.conflicts.push({ local: prompt, remote: remotePrompt });
          } else if (localModified > remoteModified) {
            plan.toUpload.push(prompt);  // Local is newer
          }
          // else: remote is newer, will download below
        } else {
          // SUBSEQUENT SYNCS - Three-way merge
          const localChangedSinceSync = (localHash !== lastSyncHash);
          const remoteChangedSinceSync = (remoteHash !== lastSyncHash);

          if (localChangedSinceSync && remoteChangedSinceSync) {
            // CONFLICT - both modified since last sync
            if (localHash !== remoteHash) {
              // Content actually differs (not just timestamp)
              plan.conflicts.push({ local: prompt, remote: remotePrompt });
            }
            // else: timestamps changed but content identical, no action
          } else if (localChangedSinceSync) {
            // Local is newer
            plan.toUpload.push(prompt);
          } else if (remoteChangedSinceSync) {
            // Remote is newer
            plan.toDownload.push(remotePrompt);
          }
          // else: no changes, skip
        }
      }
    }

    // Find new remote prompts not in local
    for (const remotePrompt of remote) {
      const localPromptId = this.findLocalPromptId(remotePrompt.cloud_id, promptSyncMap);
      if (!localPromptId || !localMap.has(localPromptId)) {
        plan.toDownload.push(remotePrompt);
      }
    }

    return plan;
  }
  ```

  **Conflict resolution (prevents nested suffixes):**
  ```typescript
  private async resolveConflict(
    local: Prompt,
    remote: RemotePrompt
  ): Promise<Prompt[]> {
    // Strip existing conflict suffixes to prevent nesting
    const suffixPattern = / \(from .+ - \w{3} \d{1,2}\)$/;
    const baseTitle = local.title.replace(suffixPattern, '');

    const localDeviceName = this.syncStateStorage.getSyncState()?.deviceName || 'Unknown';
    const remoteDeviceName = remote.sync_metadata.lastModifiedDeviceName || 'Unknown';

    const formatDate = (date: Date) => {
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return `${months[date.getMonth()]} ${date.getDate()}`;
    };

    // Create two separate prompts with NEW IDs for both
    const localCopy: Prompt = {
      ...local,
      id: this.generateNewId(),  // NEW ID (don't reuse original)
      title: `${baseTitle} (from ${localDeviceName} - ${formatDate(local.metadata.modified)})`
    };

    const remoteCopy: Prompt = {
      ...this.convertRemoteToLocal(remote),
      id: this.generateNewId(),  // NEW ID (don't reuse remote's ID)
      title: `${baseTitle} (from ${remoteDeviceName} - ${formatDate(new Date(remote.updated_at))})`
    };

    return [localCopy, remoteCopy];
  }
  ```

  **Execute sync plan (sequential with error handling):**
  ```typescript
  private async executeSyncPlan(plan: SyncPlan): Promise<SyncResult> {
    const result: SyncResult = {
      stats: { uploaded: 0, downloaded: 0, conflicts: 0, duration: 0 }
    };

    const startTime = Date.now();

    try {
      // 1. Handle conflicts first (create local duplicates)
      for (const conflict of plan.conflicts) {
        const [localCopy, remoteCopy] = await this.resolveConflict(
          conflict.local,
          conflict.remote
        );

        await this.promptService.savePromptDirectly(localCopy);
        await this.promptService.savePromptDirectly(remoteCopy);

        // Update sync state for both copies
        const localHash = computeContentHash(localCopy);
        const remoteHash = computeContentHash(remoteCopy);

        await this.syncStateStorage.setPromptSyncInfo(localCopy.id, {
          cloudId: conflict.local.syncMetadata?.cloudId || '',
          lastSyncedContentHash: localHash,
          lastSyncedAt: new Date()
        });

        await this.syncStateStorage.setPromptSyncInfo(remoteCopy.id, {
          cloudId: conflict.remote.cloud_id,
          lastSyncedContentHash: remoteHash,
          lastSyncedAt: new Date()
        });

        result.stats.conflicts++;
      }

      // 2. Upload prompts
      for (const prompt of plan.toUpload) {
        const cloudId = await this.uploadPrompt(prompt);
        const contentHash = computeContentHash(prompt);

        // Update sync state
        await this.syncStateStorage.setPromptSyncInfo(prompt.id, {
          cloudId: cloudId,
          lastSyncedContentHash: contentHash,
          lastSyncedAt: new Date()
        });

        result.stats.uploaded++;
      }

      // 3. Download prompts
      for (const remotePrompt of plan.toDownload) {
        const localPrompt = this.convertRemoteToLocal(remotePrompt);
        await this.promptService.savePromptDirectly(localPrompt);

        const contentHash = computeContentHash(localPrompt);
        await this.syncStateStorage.setPromptSyncInfo(localPrompt.id, {
          cloudId: remotePrompt.cloud_id,
          lastSyncedContentHash: contentHash,
          lastSyncedAt: new Date()
        });

        result.stats.downloaded++;
      }

      result.stats.duration = Date.now() - startTime;
      return result;

    } catch (error: any) {
      // User-friendly error messages
      if (error.message.includes('network') || error.message.includes('fetch')) {
        throw new Error('Unable to sync - check your internet connection');
      } else if (error.message.includes('auth') || error.message.includes('unauthorized')) {
        throw new Error('Authentication expired - please sign in again');
      } else if (error.message.includes('quota') || error.message.includes('limit')) {
        throw error;  // Already user-friendly from checkQuotaBeforeSync
      } else if (error.message.includes('conflict')) {
        throw new Error('Sync conflict detected - please try again');
      }
      throw error;
    }
  }
  ```

  **Sync status computation (cached in memory):**
  ```typescript
  private syncStatusCache = new Map<string, SyncStatus>();

  getSyncStatus(promptId: string): 'synced' | 'out-of-sync' | 'conflict' {
    // Return cached status (computed during last sync)
    return this.syncStatusCache.get(promptId) || 'synced';
  }

  // Update cache during sync operations
  private updateSyncStatusCache(promptId: string, status: SyncStatus): void {
    this.syncStatusCache.set(promptId, status);
  }
  ```

**Leverage existing**:
- Reuse `AuthService.getValidAccessToken()` for authentication
- Follow same patterns as `ShareService` for Supabase calls
- Use `node-fetch` (already in dependencies)

**CRITICAL ADDITIONS**:
- ✅ Pre-flight quota check prevents partial sync failures
- ✅ Content-hash conflict detection catches same-second edits and first-sync conflicts
- ✅ Conflict naming strips existing suffixes to prevent nesting
- ✅ Both conflicted prompts get NEW IDs (no reuse)
- ✅ Sync status cached in memory (no repeated computation on tree refresh)

### 1.3 Supabase Backend [UPDATED]
**Migration File**: Create Supabase migration

- [ ] Create `user_prompts` table with optimistic locking and content hash:
  ```sql
  CREATE TABLE user_prompts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id TEXT NOT NULL,
    cloud_id TEXT NOT NULL UNIQUE,
    local_id TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL,
    prompt_order INTEGER,
    category_order INTEGER,
    variables JSONB,
    metadata JSONB NOT NULL,
    sync_metadata JSONB NOT NULL,

    -- NEW: Optimistic locking
    version INTEGER DEFAULT 1 NOT NULL,

    -- NEW: Content hash for conflict detection
    content_hash TEXT NOT NULL,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE INDEX idx_user_prompts_user_id ON user_prompts(user_id);
  CREATE INDEX idx_user_prompts_updated_at ON user_prompts(updated_at);
  CREATE INDEX idx_user_prompts_cloud_id ON user_prompts(cloud_id);
  ```

- [ ] Add trigger to auto-increment version on update (optimistic locking):
  ```sql
  CREATE OR REPLACE FUNCTION increment_version()
  RETURNS TRIGGER AS $$
  BEGIN
    NEW.version = OLD.version + 1;
    NEW.updated_at = NOW();
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;

  CREATE TRIGGER user_prompts_version_trigger
  BEFORE UPDATE ON user_prompts
  FOR EACH ROW EXECUTE FUNCTION increment_version();
  ```

- [ ] Enable Row Level Security (RLS):
  ```sql
  ALTER TABLE user_prompts ENABLE ROW LEVEL SECURITY;

  -- Users can only access their own prompts
  CREATE POLICY user_prompts_select_policy ON user_prompts
    FOR SELECT
    USING (user_id = auth.jwt() ->> 'email');

  CREATE POLICY user_prompts_insert_policy ON user_prompts
    FOR INSERT
    WITH CHECK (user_id = auth.jwt() ->> 'email');

  CREATE POLICY user_prompts_update_policy ON user_prompts
    FOR UPDATE
    USING (user_id = auth.jwt() ->> 'email')
    WITH CHECK (user_id = auth.jwt() ->> 'email');

  CREATE POLICY user_prompts_delete_policy ON user_prompts
    FOR DELETE
    USING (user_id = auth.jwt() ->> 'email');
  ```

- [ ] Create quota tracking table:
  ```sql
  CREATE TABLE user_storage_quotas (
    user_id TEXT PRIMARY KEY,
    prompt_count INTEGER DEFAULT 0,
    storage_bytes BIGINT DEFAULT 0,
    last_updated TIMESTAMPTZ DEFAULT NOW()
  );

  -- Initialize quota row for new users
  CREATE OR REPLACE FUNCTION initialize_user_quota()
  RETURNS TRIGGER AS $$
  BEGIN
    INSERT INTO user_storage_quotas (user_id, prompt_count, storage_bytes)
    VALUES (NEW.user_id, 0, 0)
    ON CONFLICT (user_id) DO NOTHING;
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;

  CREATE TRIGGER user_quota_init_trigger
  AFTER INSERT ON user_prompts
  FOR EACH ROW EXECUTE FUNCTION initialize_user_quota();
  ```

- [ ] Add trigger for quota enforcement (1,000 prompts / 10 MB limit):
  ```sql
  CREATE OR REPLACE FUNCTION update_user_quota()
  RETURNS TRIGGER AS $$
  BEGIN
    IF TG_OP = 'INSERT' THEN
      UPDATE user_storage_quotas
      SET
        prompt_count = prompt_count + 1,
        storage_bytes = storage_bytes + length(NEW.content::text),
        last_updated = NOW()
      WHERE user_id = NEW.user_id;

      -- Enforce limits
      IF (SELECT prompt_count FROM user_storage_quotas WHERE user_id = NEW.user_id) > 1000 THEN
        RAISE EXCEPTION 'Prompt limit exceeded (max 1000 prompts)';
      END IF;

      IF (SELECT storage_bytes FROM user_storage_quotas WHERE user_id = NEW.user_id) > 10485760 THEN
        RAISE EXCEPTION 'Storage limit exceeded (max 10 MB)';
      END IF;

    ELSIF TG_OP = 'UPDATE' THEN
      UPDATE user_storage_quotas
      SET
        storage_bytes = storage_bytes - length(OLD.content::text) + length(NEW.content::text),
        last_updated = NOW()
      WHERE user_id = NEW.user_id;

      -- Check storage limit on update
      IF (SELECT storage_bytes FROM user_storage_quotas WHERE user_id = NEW.user_id) > 10485760 THEN
        RAISE EXCEPTION 'Storage limit exceeded (max 10 MB)';
      END IF;

    ELSIF TG_OP = 'DELETE' THEN
      UPDATE user_storage_quotas
      SET
        prompt_count = prompt_count - 1,
        storage_bytes = storage_bytes - length(OLD.content::text),
        last_updated = NOW()
      WHERE user_id = OLD.user_id;
    END IF;

    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;

  CREATE TRIGGER user_quota_trigger
  AFTER INSERT OR UPDATE OR DELETE ON user_prompts
  FOR EACH ROW EXECUTE FUNCTION update_user_quota();
  ```

- [ ] Create edge function: `sync-prompt`
  ```typescript
  // supabase/functions/sync-prompt/index.ts
  import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

  Deno.serve(async (req) => {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { cloudId, expectedVersion, contentHash, ...promptData } = await req.json();

    try {
      if (cloudId) {
        // UPDATE existing prompt with optimistic locking
        const { data, error } = await supabase
          .from('user_prompts')
          .update({
            ...promptData,
            content_hash: contentHash,
            updated_at: new Date().toISOString()
          })
          .eq('cloud_id', cloudId)
          .eq('version', expectedVersion)  // Optimistic lock check
          .select('cloud_id, version')
          .single();

        if (error) {
          // Version mismatch = conflict
          if (error.code === 'PGRST116') {  // No rows returned
            const current = await supabase
              .from('user_prompts')
              .select('version')
              .eq('cloud_id', cloudId)
              .single();

            return new Response(JSON.stringify({
              success: false,
              error: 'conflict',
              expectedVersion: expectedVersion,
              currentVersion: current.data?.version
            }), { status: 409 });
          }

          throw error;
        }

        return new Response(JSON.stringify({
          success: true,
          cloudId: data.cloud_id,
          version: data.version
        }), { headers: { 'Content-Type': 'application/json' } });

      } else {
        // INSERT new prompt
        const { data, error } = await supabase
          .from('user_prompts')
          .insert({
            ...promptData,
            content_hash: contentHash,
            version: 1
          })
          .select('cloud_id, version')
          .single();

        if (error) throw error;

        return new Response(JSON.stringify({
          success: true,
          cloudId: data.cloud_id,
          version: data.version
        }), { headers: { 'Content-Type': 'application/json' } });
      }
    } catch (error: any) {
      return new Response(JSON.stringify({
        success: false,
        error: error.message
      }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
  });
  ```

- [ ] Create edge function: `get-user-prompts`
  ```typescript
  // supabase/functions/get-user-prompts/index.ts
  import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

  Deno.serve(async (req) => {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const url = new URL(req.url);
    const since = url.searchParams.get('since');

    let query = supabase
      .from('user_prompts')
      .select('*');

    if (since) {
      query = query.gt('updated_at', since);
    }

    const { data, error } = await query;

    if (error) {
      return new Response(JSON.stringify({
        error: error.message
      }), { status: 500 });
    }

    return new Response(JSON.stringify({
      prompts: data,
      total: data.length,
      lastUpdated: new Date().toISOString()
    }), { headers: { 'Content-Type': 'application/json' } });
  });
  ```

- [ ] Create edge function: `get-user-quota`
  ```typescript
  // supabase/functions/get-user-quota/index.ts
  import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

  Deno.serve(async (req) => {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: user } = await supabase.auth.getUser(req.headers.get('Authorization')?.replace('Bearer ', '')!);

    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const { data, error } = await supabase
      .from('user_storage_quotas')
      .select('*')
      .eq('user_id', user.user.email)
      .single();

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }

    return new Response(JSON.stringify({
      promptCount: data.prompt_count,
      promptLimit: 1000,
      storageBytes: data.storage_bytes,
      storageLimit: 10485760,  // 10 MB
      percentageUsed: Math.round((data.storage_bytes / 10485760) * 100)
    }), { headers: { 'Content-Type': 'application/json' } });
  });
  ```

**Leverage existing**: The extension already has Supabase configured and OAuth working. We just add new tables and edge functions.

**CRITICAL ADDITIONS**:
- ✅ `version` column for optimistic locking (prevents race conditions)
- ✅ `content_hash` column for conflict detection (catches same-second edits)
- ✅ Quota enforcement triggers (atomic all-or-nothing sync)
- ✅ Edge functions check version before updates (conflict detection)
- ✅ Separate RLS policies for SELECT/INSERT/UPDATE/DELETE (fine-grained security)

### 1.4 Storage Layer Updates [REMOVED - NOT NEEDED]
**CRITICAL CHANGE**: Do NOT modify `FileStorageProvider` or `prompts.json`

**Rationale**:
- Sync state is completely separate (stored in `sync-state.json`)
- `FileStorageProvider` remains unchanged - it only manages `prompts.json`
- No risk of infinite loops from modifying prompt objects
- Clean separation of concerns

**What we're NOT doing** (from original plan):
- ~~Store `lastSyncedAt` in metadata.json~~ → Store in `sync-state.json` instead
- ~~Extend CRUD operations to handle `syncMetadata`~~ → Prompts remain unchanged
- ~~Add method to update sync metadata without triggering full save~~ → Not needed, sync state is separate

**Leverage existing**: `FileStorageProvider` already has robust JSON file management with atomic writes. We reuse this pattern for `SyncStateStorage` but keep them separate.

## Phase 2: UI Integration (Days 4-5)

### 2.1 Sync Button (Top-Level)
**File**: `package.json`

- [ ] Add command: `promptBank.syncAll`
- [ ] Add to tree view toolbar (next to refresh):
  ```json
  {
    "command": "promptBank.syncAll",
    "title": "Sync All Prompts",
    "icon": "$(sync)",
    "group": "navigation@1"
  }
  ```

**File**: `src/commands/syncCommands.ts` (new)

- [ ] Implement `syncAll` command:
  - Show "Syncing..." progress notification
  - Call `SyncService.performSync()`
  - Show success/error notification
  - Refresh tree view

### 2.2 Per-Prompt Sync Icons
**File**: `src/views/promptTreeItem.ts`

- [ ] Extend `PromptTreeItem` to show sync icons:
  - Add `iconPath` logic based on sync status
  - ⚠️ Yellow cloud for 'out-of-sync'
  - ❌ Red cloud for 'conflict'
  - No icon for 'synced'

**File**: `src/views/promptTreeProvider.ts`

- [ ] Add periodic sync status check (when tree refreshes)
- [ ] Call `SyncService.getSyncStatus()` for each prompt

**File**: `package.json`

- [ ] Add command: `promptBank.syncPrompt`
- [ ] Add to prompt context menu:
  ```json
  {
    "command": "promptBank.syncPrompt",
    "when": "view == promptBank.promptsView && viewItem == promptBankPrompt",
    "group": "1_modification@0"
  }
  ```

**Leverage existing**: The tree view already supports icons, drag-and-drop, and context menus. We just add sync icons and commands.

### 2.3 Sync Status Indicator
**File**: `src/views/promptTreeProvider.ts`

- [ ] Add status bar item showing:
  - "Last synced: X minutes ago"
  - Click to sync all
- [ ] Update after each sync operation

## Phase 3: Testing & Polish (Day 6)

### 3.1 Unit Tests
**New File**: `test/syncService.test.ts`

- [ ] Test `computeSyncPlan()` with various scenarios:
  - New local prompts
  - New remote prompts
  - Out-of-sync (local newer)
  - Out-of-sync (remote newer)
  - Conflicts (both modified)
- [ ] Test device ID generation (stability)
- [ ] Test conflict resolution (duplicate creation)

**Leverage existing**: Testing infrastructure with Vitest is already set up and working (67 tests passing).

### 3.2 Integration Testing [UPDATED]
**Manual Test Checklist**:

**Basic Sync Scenarios:**
- [ ] First-time sync (upload all local prompts)
- [ ] Sync on second device (download prompts)
- [ ] Bidirectional sync (create on A, sync on B)
- [ ] Conflict creation (edit same prompt on both devices offline)

**Critical Bug Prevention Tests:**
- [ ] **First sync with different content** (same title, different content → should create duplicates, not silently lose data)
- [ ] **Same-second edits** (edit on both devices within same second → content-hash should detect conflict)
- [ ] **Quota pre-flight check** (try to sync more than limit → should fail before uploading anything)
- [ ] **Simultaneous sync from two devices** (spam sync button on both → optimistic locking should catch race)
- [ ] **Rapid successive syncs** (spam sync button → should handle gracefully, no infinite loops)
- [ ] **Conflicted prompt gets edited again** (conflict suffix should be stripped, not nested)

**Error Handling:**
- [ ] Network failure handling
- [ ] Auth expiry handling
- [ ] Quota limit enforcement (at database level)

**Edge Cases:**
- [ ] Sync with empty local library
- [ ] Sync with empty remote library
- [ ] Sync with 100+ prompts (performance)
- [ ] Delete prompt on one device, sync on other (should reappear - document limitation)

### 3.3 Error Handling
**File**: `src/services/syncService.ts`

- [ ] Add user-friendly error messages:
  - Network: "Unable to sync - check your internet connection"
  - Auth: "Authentication expired - please sign in again"
  - Quota: "Storage quota exceeded - delete some prompts"
- [ ] Add logging for debugging

## Phase 4: Documentation (Day 7)

### 4.1 User Documentation
- [ ] Update README.md with sync feature section
- [ ] Add screenshots of sync icons
- [ ] Document first-time setup flow

### 4.2 Developer Documentation
- [ ] Update CONTRIBUTING.md with sync service patterns
- [ ] Document Supabase table schema
- [ ] Add inline code comments

### 4.3 Changelog
- [ ] Update CHANGELOG.md:
  ```markdown
  ## [0.7.0] - 2025-11-XX

  ### Added
  - Personal sync feature - sync prompts across devices
  - Per-prompt sync status indicators
  - Conflict resolution with device naming
  - Storage quota limits (1,000 prompts / 10 MB)
  ```

## Key Implementation Decisions

### Why This Approach Works
1. **Reuse Existing Infrastructure**: AuthService, Supabase, FileStorageProvider already working
2. **Simple Sequential Sync**: No need for batching - prompts are tiny text files
3. **Minimal UI Changes**: Add icons and one button - no complex new views
4. **Standard Patterns**: Follow existing service patterns (singleton, VS Code secrets, tree view extensions)

### Dependencies Needed
**None!** All required dependencies already in package.json:
- `node-fetch` ✅ (for Supabase API calls)
- `crypto` ✅ (Node.js built-in, for device ID hashing)
- VS Code API ✅ (for secrets, global state, tree view)

### Estimation [UPDATED]
- **Total Time**: 8-9 days (was 6-7 days)
- **Code Addition**: ~1200-1500 lines (was ~800-1000)
- **Files Created**: 5-6 new files (was 2-3):
  - `src/models/syncState.ts`
  - `src/storage/syncStateStorage.ts`
  - `src/services/syncService.ts`
  - `src/utils/deviceId.ts`
  - `src/utils/contentHash.ts`
  - `src/commands/syncCommands.ts`
  - 3 Supabase edge functions
- **Files Modified**: 6-8 existing files (same):
  - `package.json` (commands, toolbar)
  - `src/views/promptTreeItem.ts` (sync icons)
  - `src/views/promptTreeProvider.ts` (status indicator)
  - `test/syncService.test.ts` (new)
  - `README.md`, `CHANGELOG.md`

**Time Breakdown**:
- Phase 0 (Design Decisions): 0.5 days
- Phase 1 (Core Sync): 3.5 days (was 3)
- Phase 2 (UI Integration): 2 days (same)
- Phase 3 (Testing): 1.5 days (was 1)
- Phase 4 (Documentation): 1 day (same)
- **Total**: 8.5 days → round to 8-9 days

**Why longer?**:
- Added Phase 0 for critical design decisions
- Optimistic locking adds complexity to edge functions
- Content-hash conflict detection requires additional testing
- Pre-flight quota checks need thorough validation

### Risks & Mitigations [UPDATED]

| Risk | Likelihood | Impact | Original Mitigation | Updated Mitigation | Status |
|------|-----------|--------|---------------------|-------------------|--------|
| Supabase RLS issues | Low | High | Test with multiple accounts ✅ | Test with multiple accounts ✅ | ✅ Mitigated |
| Device ID collision | Low | High | Cryptographic hash ✅ | SHA256 with 3 inputs ✅ | ✅ Mitigated |
| Clock skew | Medium | Medium | Document limitation ⚠️ | **Content-hash comparison** ✅ | ✅ FIXED |
| **Partial sync failure** | ~~High~~ | ~~High~~ | ❌ Not addressed | **Pre-flight quota check** ✅ | ✅ FIXED |
| **Infinite sync loop** | ~~High~~ | ~~Critical~~ | ❌ Not addressed | **Separate sync-state.json** ✅ | ✅ FIXED |
| **First sync data loss** | ~~Medium~~ | ~~Critical~~ | ❌ Not addressed | **Content-hash on first sync** ✅ | ✅ FIXED |
| **Race conditions** | ~~Medium~~ | ~~High~~ | ❌ Not addressed | **Optimistic locking (version)** ✅ | ✅ FIXED |
| Nested conflict suffixes | Low | Low | ❌ Not addressed | **Regex strip existing suffixes** ✅ | ✅ FIXED |
| Deletion sync | Medium | Medium | ❌ Not addressed | **MVP: Document limitation** ⚠️ | ⚠️ Documented (v0.8.0) |

**Summary**: 5 critical risks FIXED, 1 documented as known limitation for MVP, 2 original risks properly mitigated.

## Commit Strategy [UPDATED]
Following conventional commits (from CONTRIBUTING.md):

1. `feat(sync): ✨ add sync state models and storage` (Phase 1.1)
   - `src/models/syncState.ts`
   - `src/storage/syncStateStorage.ts`
   - `src/utils/deviceId.ts`
   - `src/utils/contentHash.ts`

2. `feat(sync): ✨ implement sync service with conflict detection` (Phase 1.2)
   - `src/services/syncService.ts` (with pre-flight checks, content-hash, conflict resolution)

3. `feat(sync): ✨ implement Supabase backend with optimistic locking` (Phase 1.3)
   - Database migration (tables, triggers, RLS policies)
   - Edge functions (sync-prompt, get-user-prompts, get-user-quota)

4. `feat(sync): ✨ add sync UI with icons and commands` (Phase 2)
   - `package.json` (commands, toolbar buttons)
   - `src/commands/syncCommands.ts`
   - `src/views/promptTreeItem.ts` (sync icons)
   - `src/views/promptTreeProvider.ts` (status indicator)

5. `test(sync): ✅ add sync service unit tests` (Phase 3.1)
   - `test/syncService.test.ts`
   - Test scenarios: content-hash conflicts, quota checks, optimistic locking

6. `docs(sync): 📝 document sync feature` (Phase 4)
   - `README.md` (sync feature section, known limitations)
   - `CHANGELOG.md` (v0.7.0 release notes)
   - Inline code comments

7. `feat(sync)!: ✨ release personal sync feature v0.7.0` (Release)

**This will automatically bump to minor version (0.7.0) via standard-version.**

**Note**: Commit 3 removed (Phase 1.4) - no changes needed to `FileStorageProvider`.
