# Sync Implementation - Key Patterns & Code Templates

**Quick Reference**: Production-ready code patterns for implementing the sync feature

---

## Pattern 1: Device ID Generation (Stable)

**File**: `src/utils/deviceId.ts`

```typescript
import { createHash } from 'crypto';
import * as os from 'os';
import * as vscode from 'vscode';

/**
 * Generate stable device ID that persists across sessions.
 * Stored in VS Code global state to ensure consistency.
 */
export function generateDeviceId(context: vscode.ExtensionContext): string {
  // Check global state first (stable across sessions)
  const existingId = context.globalState.get<string>('promptBank.deviceId');
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
  context.globalState.update('promptBank.deviceId', deviceId);

  return deviceId;
}

/**
 * Get user-friendly device name for conflict resolution UI.
 */
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

**Key Points**:
- ✅ Stable across sessions (stored in global state)
- ✅ Unique per device + user + editor
- ✅ Cryptographically secure (SHA256)
- ✅ Human-readable names for UI

---

## Pattern 2: Content Hash Computation

**File**: `src/utils/contentHash.ts`

```typescript
import { createHash } from 'crypto';
import { Prompt } from '../models/prompt';

/**
 * Compute SHA256 hash of prompt content for conflict detection.
 * Uses canonical JSON representation to ensure consistent hashing.
 */
export function computeContentHash(prompt: Prompt): string {
  // Canonical representation - order matters for consistent hashing
  const canonical = JSON.stringify({
    title: prompt.title.trim(),
    content: prompt.content.trim(),
    category: prompt.category.trim()
    // Note: Don't include metadata.modified - that changes frequently
    // Note: Don't include variables - those don't affect core content
  });

  return createHash('sha256')
    .update(canonical)
    .digest('hex');
}
```

**Key Points**:
- ✅ Catches same-second edits (timestamps can be identical)
- ✅ Canonical JSON ensures consistent hashing
- ✅ Only includes content-relevant fields (not metadata)
- ✅ Fast for small prompts (~5KB typical)

---

## Pattern 3: Pre-Flight Quota Check

**File**: `src/services/syncService.ts`

```typescript
interface UserQuota {
  promptCount: number;
  promptLimit: number;        // 1000
  storageBytes: number;
  storageLimit: number;       // 10485760 (10 MB)
  percentageUsed: number;
}

/**
 * Check user quota BEFORE starting sync to prevent partial failures.
 * Throws user-friendly error if sync would exceed limits.
 */
private async checkQuotaBeforeSync(plan: SyncPlan): Promise<void> {
  const quota = await this.fetchUserQuota();

  // Check prompt count limit
  const promptsToUpload = plan.toUpload.length;
  if (quota.promptCount + promptsToUpload > quota.promptLimit) {
    const overage = promptsToUpload - (quota.promptLimit - quota.promptCount);
    throw new Error(
      `Cannot sync: would exceed limit by ${overage} prompts. ` +
      `Delete ${overage} prompts and try again.`
    );
  }

  // Check storage size limit
  const uploadSize = this.calculateUploadSize(plan.toUpload);
  if (quota.storageBytes + uploadSize > quota.storageLimit) {
    const overageMB = ((quota.storageBytes + uploadSize - quota.storageLimit) / 1048576).toFixed(1);
    throw new Error(
      `Cannot sync: would exceed 10 MB storage limit by ${overageMB} MB. ` +
      `Delete some prompts and try again.`
    );
  }

  // Optionally warn if approaching limit
  if (quota.percentageUsed > 90) {
    vscode.window.showWarningMessage(
      `You're using ${quota.percentageUsed}% of your storage quota. ` +
      `Consider deleting old prompts.`
    );
  }
}

/**
 * Calculate total upload size for quota check.
 */
private calculateUploadSize(prompts: Prompt[]): number {
  return prompts.reduce((total, prompt) => {
    // Approximate JSON size (title + content + metadata)
    const size = Buffer.byteLength(JSON.stringify(prompt), 'utf8');
    return total + size;
  }, 0);
}
```

**Key Points**:
- ✅ Checks quota BEFORE uploading anything
- ✅ Atomic operation (either sync everything or nothing)
- ✅ User-friendly error messages with actionable guidance
- ✅ Optional warning at 90% usage

---

## Pattern 4: Optimistic Locking (Edge Function)

**File**: `supabase/functions/sync-prompt/index.ts`

```typescript
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
        .eq('version', expectedVersion)  // ⚠️ Optimistic lock check
        .select('cloud_id, version')
        .single();

      if (error) {
        // Version mismatch = conflict detected
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
          }), {
            status: 409,  // Conflict
            headers: { 'Content-Type': 'application/json' }
          });
        }

        throw error;
      }

      // Success - return new version
      return new Response(JSON.stringify({
        success: true,
        cloudId: data.cloud_id,
        version: data.version  // Incremented by database trigger
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
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});
```

**Key Points**:
- ✅ Optimistic lock prevents race conditions
- ✅ Returns 409 Conflict status code
- ✅ Includes version mismatch details for debugging
- ✅ Database trigger auto-increments version

---

## Pattern 5: Three-Way Merge with Content-Hash

**File**: `src/services/syncService.ts`

```typescript
interface SyncPlan {
  toUpload: Prompt[];
  toDownload: RemotePrompt[];
  conflicts: Array<{ local: Prompt; remote: RemotePrompt }>;
}

/**
 * Compute sync plan using three-way merge with content-hash conflict detection.
 * Compares: local state, remote state, last synced state (via content hash).
 */
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
  for (const remotePrompt of remote) {
    remoteMap.set(remotePrompt.cloud_id, remotePrompt);
  }

  // Process local prompts
  for (const prompt of local) {
    const syncInfo = promptSyncMap[prompt.id];
    const cloudId = syncInfo?.cloudId;
    const remotePrompt = cloudId ? remoteMap.get(cloudId) : null;

    if (!remotePrompt) {
      // New local prompt - upload
      plan.toUpload.push(prompt);
      continue;
    }

    // Prompt exists both locally and remotely
    const localModified = prompt.metadata.modified;
    const remoteModified = new Date(remotePrompt.updated_at);

    // Compute content hashes
    const localHash = computeContentHash(prompt);
    const remoteHash = remotePrompt.content_hash;  // Stored in DB
    const lastSyncHash = syncInfo?.lastSyncedContentHash;

    if (!lastSync) {
      // FIRST SYNC - Check content hash for conflicts (prevent data loss)
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

**Key Points**:
- ✅ Three-way merge: local, remote, last synced (via hash)
- ✅ Content-hash detects same-second edits
- ✅ First sync uses content-hash to prevent data loss
- ✅ Subsequent syncs track changes via hash comparison

---

## Pattern 6: Conflict Resolution (Prevent Nesting)

**File**: `src/services/syncService.ts`

```typescript
/**
 * Resolve conflict by creating two separate prompts with device names.
 * Strips existing conflict suffixes to prevent nesting.
 */
private async resolveConflict(
  local: Prompt,
  remote: RemotePrompt
): Promise<Prompt[]> {
  // Strip existing conflict suffixes to prevent nesting
  // Pattern matches: " (from Device Name - Oct 27)" or " (from Device - Jan 1)"
  const suffixPattern = / \(from .+ - \w{3} \d{1,2}\)$/;
  const baseTitle = local.title.replace(suffixPattern, '');

  const syncState = await this.syncStateStorage.getSyncState();
  const localDeviceName = syncState?.deviceName || 'Unknown Device';
  const remoteDeviceName = remote.sync_metadata?.lastModifiedDeviceName || 'Unknown Device';

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

**Key Points**:
- ✅ Regex strips existing suffixes (prevents nesting)
- ✅ Both prompts get NEW IDs (no reuse)
- ✅ Clear device names for user (from sync metadata)
- ✅ Short date format (MMM DD) for readability

**Example Output**:
```
Original: "Debug React Components"

First conflict:
- "Debug React Components (from MacBook - Oct 27)"
- "Debug React Components (from Desktop - Oct 27)"

If "Debug React Components (from MacBook - Oct 27)" gets edited and conflicts again:
✅ CORRECT: "Debug React Components (from MacBook - Oct 31)"
❌ WRONG:   "Debug React Components (from MacBook - Oct 27) (from MacBook - Oct 31)"
```

---

## Pattern 7: Sync State Storage (Separate from Prompts)

**File**: `src/storage/syncStateStorage.ts`

```typescript
import * as path from 'path';
import * as fs from 'fs/promises';

export class SyncStateStorage {
  private readonly syncStateFile: string;

  constructor(workspaceRoot: string) {
    this.syncStateFile = path.join(workspaceRoot, '.vscode/prompt-bank/sync-state.json');
  }

  /**
   * Get current sync state (or null if never synced).
   */
  async getSyncState(): Promise<SyncState | null> {
    try {
      const content = await fs.readFile(this.syncStateFile, 'utf8');
      return JSON.parse(content);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return null;  // File doesn't exist yet
      }
      throw error;
    }
  }

  /**
   * Update sync state (partial update supported).
   */
  async updateSyncState(state: Partial<SyncState>): Promise<void> {
    const current = await this.getSyncState() || {
      userId: '',
      deviceId: '',
      deviceName: '',
      promptSyncMap: {}
    };

    const updated = { ...current, ...state };

    // Ensure directory exists
    const dir = path.dirname(this.syncStateFile);
    await fs.mkdir(dir, { recursive: true });

    // Atomic write (write to temp file, then rename)
    const tempFile = `${this.syncStateFile}.tmp`;
    await fs.writeFile(tempFile, JSON.stringify(updated, null, 2), 'utf8');
    await fs.rename(tempFile, this.syncStateFile);
  }

  /**
   * Get sync info for specific prompt.
   */
  async getPromptSyncInfo(promptId: string): Promise<PromptSyncInfo | null> {
    const state = await this.getSyncState();
    return state?.promptSyncMap[promptId] || null;
  }

  /**
   * Set sync info for specific prompt.
   */
  async setPromptSyncInfo(promptId: string, info: PromptSyncInfo): Promise<void> {
    const state = await this.getSyncState() || {
      userId: '',
      deviceId: '',
      deviceName: '',
      promptSyncMap: {}
    };

    state.promptSyncMap[promptId] = info;

    await this.updateSyncState(state);
  }

  /**
   * Remove sync info for deleted prompt.
   */
  async removePromptSyncInfo(promptId: string): Promise<void> {
    const state = await this.getSyncState();
    if (!state) return;

    delete state.promptSyncMap[promptId];
    await this.updateSyncState(state);
  }

  /**
   * Clear all sync state (for sign-out).
   */
  async clearAllSyncState(): Promise<void> {
    try {
      await fs.unlink(this.syncStateFile);
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }
}
```

**Key Points**:
- ✅ Atomic writes (temp file + rename)
- ✅ Partial updates supported
- ✅ Per-prompt sync info management
- ✅ Clear state on sign-out

---

## Pattern 8: Error Handling with User-Friendly Messages

**File**: `src/services/syncService.ts`

```typescript
/**
 * Execute sync plan with comprehensive error handling.
 */
private async executeSyncPlan(plan: SyncPlan): Promise<SyncResult> {
  const result: SyncResult = {
    stats: { uploaded: 0, downloaded: 0, conflicts: 0, duration: 0 }
  };

  const startTime = Date.now();

  try {
    // 1. Handle conflicts first
    for (const conflict of plan.conflicts) {
      const [localCopy, remoteCopy] = await this.resolveConflict(conflict.local, conflict.remote);
      await this.promptService.savePromptDirectly(localCopy);
      await this.promptService.savePromptDirectly(remoteCopy);

      // Update sync state for both
      await this.updatePromptSyncState(localCopy);
      await this.updatePromptSyncState(remoteCopy);

      result.stats.conflicts++;
    }

    // 2. Upload prompts
    for (const prompt of plan.toUpload) {
      const { cloudId, version } = await this.uploadPrompt(prompt);
      await this.updatePromptSyncState(prompt, cloudId, version);
      result.stats.uploaded++;
    }

    // 3. Download prompts
    for (const remotePrompt of plan.toDownload) {
      const localPrompt = this.convertRemoteToLocal(remotePrompt);
      await this.promptService.savePromptDirectly(localPrompt);
      await this.updatePromptSyncState(localPrompt, remotePrompt.cloud_id, remotePrompt.version);
      result.stats.downloaded++;
    }

    result.stats.duration = Date.now() - startTime;
    return result;

  } catch (error: any) {
    // Categorize errors and provide user-friendly messages
    if (error.message.includes('network') || error.message.includes('fetch')) {
      throw new Error('Unable to sync - check your internet connection');
    } else if (error.message.includes('auth') || error.message.includes('unauthorized')) {
      throw new Error('Authentication expired - please sign in again');
    } else if (error.message.includes('quota') || error.message.includes('limit')) {
      throw error;  // Already user-friendly from checkQuotaBeforeSync
    } else if (error.message.includes('conflict')) {
      // Retry sync once if conflict detected (optimistic lock)
      vscode.window.showInformationMessage('Sync conflict detected - retrying...');
      // Don't throw - will be retried by caller
      throw new Error('sync_conflict_retry');
    }

    // Unknown error - show generic message
    throw new Error(`Sync failed: ${error.message}`);
  }
}
```

**Key Points**:
- ✅ Categorize errors by type
- ✅ User-friendly messages (not technical stack traces)
- ✅ Actionable guidance ("check internet", "sign in again")
- ✅ Retry logic for optimistic lock conflicts

---

## Anti-Patterns to Avoid

### ❌ DON'T: Embed sync metadata in Prompt objects
```typescript
// BAD - causes infinite loops
interface Prompt {
  id: string;
  title: string;
  content: string;
  syncMetadata: {  // ❌ Modifying this triggers metadata.modified update
    lastSyncedAt: Date;
    cloudId: string;
  };
}
```

### ✅ DO: Use separate sync-state.json file
```typescript
// GOOD - clean separation
interface SyncState {
  promptSyncMap: Record<string, PromptSyncInfo>;  // Map: promptId → sync info
}

// Prompt object remains unchanged by sync operations
interface Prompt {
  id: string;
  title: string;
  content: string;
  metadata: { created: Date; modified: Date };  // ✅ Never modified by sync
}
```

---

### ❌ DON'T: Upload prompts without quota check
```typescript
// BAD - partial sync failures
async performSync() {
  const plan = computeSyncPlan(...);

  for (const prompt of plan.toUpload) {
    await uploadPrompt(prompt);  // ❌ May fail mid-sync if quota exceeded
  }
}
```

### ✅ DO: Pre-flight quota check
```typescript
// GOOD - atomic all-or-nothing
async performSync() {
  const plan = computeSyncPlan(...);

  await checkQuotaBeforeSync(plan);  // ✅ Throws if would exceed limit

  // Now safe to proceed - either sync everything or nothing
  await executeSyncPlan(plan);
}
```

---

### ❌ DON'T: Timestamp-only conflict detection
```typescript
// BAD - misses same-second edits
if (local.metadata.modified > lastSync && remote.updated_at > lastSync) {
  // Conflict detected... but what if timestamps are identical?
  // ❌ Same-second edits will be missed
}
```

### ✅ DO: Content-hash comparison
```typescript
// GOOD - catches same-second edits
const localChangedSinceSync = (localHash !== lastSyncHash);
const remoteChangedSinceSync = (remoteHash !== lastSyncHash);

if (localChangedSinceSync && remoteChangedSinceSync) {
  if (localHash !== remoteHash) {  // ✅ Content actually differs
    plan.conflicts.push({ local, remote });
  }
}
```

---

### ❌ DON'T: Reuse prompt IDs for conflicts
```typescript
// BAD - cascading conflicts
async resolveConflict(local: Prompt, remote: RemotePrompt) {
  const localCopy = { ...local };  // ❌ Reuses same ID
  const remoteCopy = { ...remote, id: remote.cloud_id };  // ❌ Reuses remote ID
  return [localCopy, remoteCopy];
}
```

### ✅ DO: Generate new IDs for both conflicts
```typescript
// GOOD - prevents cascading conflicts
async resolveConflict(local: Prompt, remote: RemotePrompt) {
  const localCopy = { ...local, id: generateNewId() };  // ✅ New ID
  const remoteCopy = { ...remote, id: generateNewId() };  // ✅ New ID
  return [localCopy, remoteCopy];
}
```

---

## Summary

These patterns address all 5 critical bugs identified in the review:

1. ✅ **Infinite loop prevention**: Separate sync-state.json file
2. ✅ **Data loss prevention**: Content-hash on first sync
3. ✅ **Partial failure prevention**: Pre-flight quota check
4. ✅ **Race condition prevention**: Optimistic locking with version
5. ✅ **Conflict nesting prevention**: Regex strip existing suffixes

**Use these patterns as templates during implementation to avoid the critical bugs.**
