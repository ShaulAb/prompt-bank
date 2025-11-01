# Personal Prompt Sync Feature - Technical Specification

**Version:** 1.2
**Status:** Ready for Implementation
**Author:** Shaul Abergil
**Date:** October 27, 2025
**Last Updated:** October 31, 2025 (Simplified approach)

---

## Changelog

### Version 1.2 (October 31, 2025)
**Simplified implementation approach - removed over-engineering:**

1. **Simplified Sync Flow**: Removed complex batch operations, transaction logs, and retry logic. Simple sequential upload/download is sufficient for text prompts.
2. **UI/UX Simplification**: Reduced to 2 icons (out-of-sync ⚠️, conflict ❌) instead of 5 states. No icon = synced.
3. **Per-Prompt Sync**: Added ability to sync individual prompts by clicking their icon, not just "Sync All"
4. **Progress Simplification**: Changed from detailed progress tracking to simple "Syncing..." spinner
5. **Performance Approach**: Acknowledged prompts are just text - no need for complex batching or optimization
6. **Kept Guardrails**: Maintained storage limits (1,000 prompts / 10 MB) and basic error handling

### Version 1.1 (October 31, 2025)
**Technical clarifications and implementation details added:**

1. **Device Identification**: Fixed device ID generation to be stable across sessions by removing timestamp and storing in VS Code global state
2. **First Sync Behavior**: Clarified that first sync merges all prompts with no conflicts (last-write-wins based on timestamp)
3. **Data Models**: Removed unused fields (`syncVersion`, `contentHash`) from SyncMetadata to simplify implementation
4. **Storage Limits**: Defined quota limits (1,000 prompts / 10 MB) with database triggers and client-side enforcement
5. **Decision Log**: Added 5 new technical decisions documenting implementation choices

---

## Table of Contents

1. [Overview](#overview)
2. [Product Requirements](#product-requirements)
3. [Technical Architecture](#technical-architecture)
4. [Data Models](#data-models)
5. [Sync Algorithm](#sync-algorithm)
6. [UI/UX Specification](#uiux-specification)
7. [Backend Implementation](#backend-implementation)
8. [Testing Strategy](#testing-strategy)
9. [Security & Privacy](#security--privacy)
10. [Rollout Plan](#rollout-plan)

---

## Overview

### Problem Statement

Developers work across multiple devices (work laptop, home desktop, personal machine) and currently have no way to synchronize their Prompt Bank across these devices. The existing "Share" feature requires:
- Manual creation of share links
- Time-limited links (24 hours)
- Manual import on each device

This creates friction and prevents seamless prompt reuse across a developer's entire workspace ecosystem.

### Solution

Implement a **personal sync feature** that automatically keeps prompts synchronized across all devices where a user is authenticated with the same Google account.

### Key Principles

1. **User Control**: Manual on-demand sync (not automatic/background)
2. **Data Safety**: Never delete user data - conflicts create duplicates
3. **Simplicity**: Sync everything - no selective sync complexity
4. **Convenience**: Local data persists even when signed out
5. **Transparency**: Clear sync status and progress indicators

### Success Metrics

- Users can sync prompts across 2+ devices
- Zero data loss during sync operations
- Sync completes in <5 seconds for typical libraries (50-100 prompts)
- Conflict rate <5% in real-world usage

---

## Product Requirements

### User Stories

**As a developer working across multiple devices,**
- I want to sync my prompts between devices, so I can access them anywhere
- I want control over when sync happens, so I'm not surprised by network activity
- I want conflicts to be handled safely, so I never lose work
- I want to know sync status, so I can trust the system

### Use Cases

#### UC1: First-Time Sync Setup
```
Given: User has prompts on Device A (no previous sync)
When: User clicks "Sync" for the first time
Then:
  - User is prompted to authenticate (if not already)
  - All local prompts are uploaded to cloud
  - Any existing cloud prompts (from other devices) are downloaded
  - No conflicts on first sync (merge everything)
  - Success notification shows "X prompts synced"
  - Last sync timestamp is displayed
```

#### UC2: Sync to Second Device
```
Given: User has synced prompts from Device A
When: User opens Prompt Bank on Device B and clicks "Sync"
Then:
  - All prompts from Device A appear on Device B
  - Local prompts on Device B (if any) are merged
  - Conflicts (same prompt edited on both) create duplicates
  - Success notification shows "X prompts downloaded, Y conflicts resolved"
```

#### UC3: Bidirectional Sync
```
Given: User has Device A and Device B both synced
When: User creates new prompt on Device A, syncs, then syncs on Device B
Then:
  - New prompt appears on Device B
  - No duplicates are created
  - Timestamps reflect accurate last modified dates
```

#### UC4: Conflict Resolution
```
Given: Same prompt edited on Device A and Device B (offline editing)
When: User syncs on both devices
Then:
  - Both versions are preserved
  - Duplicate prompt created with naming: "Prompt Title (from Device B - Oct 27)"
  - User notification explains conflict resolution
  - User can manually merge or delete unwanted version
```

#### UC5: Offline/Failed Sync
```
Given: User has no internet connection
When: User clicks "Sync"
Then:
  - Clear error message: "Unable to sync - check internet connection"
  - Local prompts remain unchanged
  - Sync can be retried when online
```

### User Experience Flow

```
┌─────────────────┐
│ User clicks     │
│ "Sync" button   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐      ┌──────────────┐
│ Check auth      │─────▶│ Prompt       │
│ status          │      │ OAuth login  │
└────────┬────────┘      └──────┬───────┘
         │                      │
         │◀─────────────────────┘
         │ Authenticated
         ▼
┌─────────────────┐
│ Show progress   │
│ "Syncing..."    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Fetch remote    │
│ prompts         │
└────────┬────────┘
         │
         ▼
┌─────────────────┐      ┌──────────────┐
│ Compare local   │─────▶│ Create       │
│ vs remote       │      │ duplicates   │
│                 │      │ for conflicts│
└────────┬────────┘      └──────┬───────┘
         │                      │
         │◀─────────────────────┘
         ▼
┌─────────────────┐
│ Upload new/     │
│ modified local  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Update UI       │
│ Show success    │
└─────────────────┘
```

### Non-Functional Requirements

- **Performance**: Sync 100 prompts in <5 seconds
- **Reliability**: 99%+ sync success rate
- **Usability**: Sync button accessible in <2 clicks
- **Compatibility**: Works across Windows, macOS, Linux
- **Offline**: Graceful degradation when network unavailable

---

## Technical Architecture

### System Components

```
┌─────────────────────────────────────────────┐
│           VS Code Extension                 │
│  ┌──────────────────────────────────────┐  │
│  │  UI Layer                             │  │
│  │  - Sync Button                        │  │
│  │  - Status Indicator                   │  │
│  │  - Progress Notification              │  │
│  └────────────┬─────────────────────────┘  │
│               │                             │
│  ┌────────────▼─────────────────────────┐  │
│  │  Service Layer                        │  │
│  │  - SyncService (NEW)                  │  │
│  │  - PromptService (EXTEND)             │  │
│  │  - AuthService (REUSE)                │  │
│  └────────────┬─────────────────────────┘  │
│               │                             │
│  ┌────────────▼─────────────────────────┐  │
│  │  Storage Layer                        │  │
│  │  - FileStorageProvider (EXTEND)       │  │
│  └────────────┬─────────────────────────┘  │
└───────────────┼─────────────────────────────┘
                │
                │ HTTPS
                │
┌───────────────▼─────────────────────────────┐
│           Supabase Backend                  │
│  ┌──────────────────────────────────────┐  │
│  │  Edge Functions                       │  │
│  │  - sync-prompts                       │  │
│  │  - get-user-prompts                   │  │
│  └────────────┬─────────────────────────┘  │
│               │                             │
│  ┌────────────▼─────────────────────────┐  │
│  │  PostgreSQL Database                  │  │
│  │  - user_prompts table                 │  │
│  │  - RLS policies for user isolation    │  │
│  └──────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

### Key Architectural Decisions

#### 1. Sync Strategy: Three-Way Merge
- **Local state**: Current prompts on device
- **Remote state**: Last synced state in cloud
- **Last sync metadata**: Timestamp of last successful sync

**Logic:**
```
for each prompt:
  if (local.modified > lastSync AND remote.modified > lastSync):
    // Conflict - both modified since last sync
    create_duplicate(prompt)
  else if (local.modified > lastSync):
    // Local is newer
    upload_to_remote(prompt)
  else if (remote.modified > lastSync):
    // Remote is newer
    download_from_remote(prompt)
  else:
    // No changes
    skip
```

#### 2. Device Identification
```typescript
// Generate stable device ID (persists across sessions)
deviceId = hash(hostname + username + vscodeInstallPath)
deviceName = auto-detect or user-provided
  - "MacBook Pro (Work)"
  - "ThinkPad (Home)"
  - "Desktop PC"

// Store device ID in VS Code global state on first generation
// This ensures the same device always has the same ID
```

#### 3. Conflict Naming Convention
```
Original: "Debug React Components"

Conflict detected between:
- Device A (modified: Oct 27, 10:30 AM)
- Device B (modified: Oct 27, 10:35 AM)

Result:
- "Debug React Components (from MacBook Pro - Oct 27 10:30)"
- "Debug React Components (from ThinkPad - Oct 27 10:35)"
```

#### 4. Authentication Flow
- **Reuse existing Google OAuth** via AuthService
- No additional authentication required
- User email serves as unique identifier

---

## Data Models

### Extended Prompt Model

```typescript
interface Prompt {
  // Existing fields
  id: string;
  title: string;
  content: string;
  description?: string;
  category: string;
  order?: number;
  categoryOrder?: number;
  variables: TemplateVariable[];
  metadata: PromptMetadata;

  // NEW: Sync metadata
  syncMetadata?: SyncMetadata;
}

interface SyncMetadata {
  /** UUID for cloud storage (different from local id) */
  cloudId?: string;

  /** Timestamp of last successful sync for this prompt */
  lastSyncedAt?: Date;

  /** Device that created this prompt */
  originDeviceId: string;
  originDeviceName: string;

  /** Device that last modified this prompt */
  lastModifiedDeviceId: string;
  lastModifiedDeviceName: string;

  /** Flag indicating if prompt exists in cloud */
  isSynced: boolean;
}
```

### Sync State Model

```typescript
interface SyncState {
  /** User's email (unique identifier) */
  userEmail: string;

  /** Last successful sync timestamp */
  lastSyncedAt?: Date;

  /** Current device info */
  currentDevice: DeviceInfo;

  /** Sync status */
  status: 'idle' | 'syncing' | 'error';

  /** Error message if sync failed */
  lastError?: string;

  /** Statistics from last sync */
  lastSyncStats?: SyncStats;
}

interface DeviceInfo {
  id: string;
  name: string;
  platform: 'win32' | 'darwin' | 'linux';
  hostname: string;
}

interface SyncStats {
  uploaded: number;
  downloaded: number;
  conflicts: number;
  duration: number; // milliseconds
}
```

### Remote Storage Schema (Supabase)

```sql
-- Table: user_prompts
CREATE TABLE user_prompts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT NOT NULL,              -- From Google OAuth (email)
  cloud_id TEXT NOT NULL UNIQUE,       -- Unique ID for cloud storage
  local_id TEXT NOT NULL,             -- Original local prompt ID
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  prompt_order INTEGER,
  category_order INTEGER,
  variables JSONB,
  metadata JSONB NOT NULL,
  sync_metadata JSONB NOT NULL,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Index for fast user queries
  INDEX idx_user_prompts_user_id ON user_prompts(user_id),
  INDEX idx_user_prompts_updated_at ON user_prompts(updated_at)
);

-- Row Level Security (RLS)
ALTER TABLE user_prompts ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only access their own prompts
CREATE POLICY user_prompts_select_policy ON user_prompts
  FOR SELECT
  USING (user_id = auth.jwt() ->> 'email');

CREATE POLICY user_prompts_insert_policy ON user_prompts
  FOR INSERT
  WITH CHECK (user_id = auth.jwt() ->> 'email');

CREATE POLICY user_prompts_update_policy ON user_prompts
  FOR UPDATE
  USING (user_id = auth.jwt() ->> 'email');

CREATE POLICY user_prompts_delete_policy ON user_prompts
  FOR DELETE
  USING (user_id = auth.jwt() ->> 'email');
```

---

## Sync Algorithm

### High-Level Sync Flow (Simplified)

```typescript
async function performSync(promptId?: string): Promise<SyncResult> {
  // 1. Pre-sync validation
  const user = await authService.getUser();
  if (!user) {
    throw new Error('Please sign in to sync');
  }

  // 2. Fetch remote prompts
  const remotePrompts = await fetchRemotePrompts(user.email);

  // 3. Determine what to sync
  const localPrompts = promptId
    ? [await promptService.getPrompt(promptId)]  // Single prompt sync
    : await promptService.getAllPrompts();        // Sync all

  const lastSyncTime = await getSyncState().lastSyncedAt;

  // 4. Three-way merge
  const syncPlan = computeSyncPlan(localPrompts, remotePrompts, lastSyncTime);

  // 5. Execute sync (simple sequential operations)
  const result = await executeSyncPlan(syncPlan);

  // 6. Update sync state
  await updateSyncState({
    lastSyncedAt: new Date(),
    lastSyncStats: result.stats
  });

  return result;
}
```

**Key Simplifications:**
- Support for single prompt sync via optional `promptId` parameter
- No complex error recovery or transaction logs
- Sequential upload/download (prompts are small text files)
- Simple try-catch error handling

### Detailed Sync Logic

```typescript
function computeSyncPlan(
  local: Prompt[],
  remote: RemotePrompt[],
  lastSync: Date | undefined
): SyncPlan {
  const plan: SyncPlan = {
    toUpload: [],
    toDownload: [],
    conflicts: []
  };

  // Build lookup maps
  const localMap = new Map(local.map(p => [p.syncMetadata?.cloudId || p.id, p]));
  const remoteMap = new Map(remote.map(p => [p.cloud_id, p]));

  // Find prompts to upload (new or modified locally)
  for (const prompt of local) {
    const cloudId = prompt.syncMetadata?.cloudId;
    const remoteProm

pt = cloudId ? remoteMap.get(cloudId) : null;

    if (!remotePrompt) {
      // New local prompt - upload
      plan.toUpload.push(prompt);
    } else {
      const localModified = prompt.metadata.modified;
      const remoteModified = new Date(remotePrompt.updated_at);

      if (lastSync === undefined) {
        // First sync - merge strategy (no conflicts)
        // Upload local version if it's newer, otherwise keep remote
        if (localModified > remoteModified) {
          plan.toUpload.push(prompt);
        }
        // Remote is newer - will be handled in download loop below
      } else {
        const localChangedSinceSync = localModified > lastSync;
        const remoteChangedSinceSync = remoteModified > lastSync;

        if (localChangedSinceSync && remoteChangedSinceSync) {
          // CONFLICT!
          plan.conflicts.push({
            local: prompt,
            remote: remotePrompt
          });
        } else if (localChangedSinceSync) {
          // Local is newer
          plan.toUpload.push(prompt);
        }
        // else: remote is newer or no changes - handled below
      }
    }
  }

  // Find prompts to download (new or modified remotely)
  for (const remotePrompt of remote) {
    const localPrompt = localMap.get(remotePrompt.cloud_id);

    if (!localPrompt) {
      // New remote prompt - download
      plan.toDownload.push(remotePrompt);
    } else {
      const localModified = localPrompt.metadata.modified;
      const remoteModified = new Date(remotePrompt.updated_at);

      if (lastSync && remoteModified > lastSync && localModified <= lastSync) {
        // Remote is newer
        plan.toDownload.push(remotePrompt);
      }
    }
  }

  return plan;
}
```

### Understanding Sync States

#### Out of Sync vs Conflict

**Out of Sync (⚠️)**: One version is clearly newer
- **Example**: Prompt edited on Device A yesterday, synced. Device B still has old version from last week.
- **Resolution**: Simple update - newer version overwrites older version
- **Result**: Prompt becomes synced, icon disappears

**Conflict (❌)**: Both versions modified since last sync
- **Example**: Prompt edited on Device A today AND on Device B today (after last sync)
- **Resolution**: Keep both versions as separate prompts with device names
- **Result**: Two prompts exist, user manually reviews/merges

| Status | Icon | Meaning | Sync Action |
|--------|------|---------|-------------|
| Synced | (none) | Local = Remote | Nothing to do |
| Out of Sync | ⚠️ | One is newer | Update to newer |
| Conflict | ❌ | Both modified | Keep both |

### Conflict Resolution Strategy

```typescript
async function resolveConflict(
  local: Prompt,
  remote: RemotePrompt
): Promise<Prompt[]> {
  // Create two separate prompts - keep both versions

  const localCopy: Prompt = {
    ...local,
    id: generateNewId(),
    title: `${local.title} (from ${local.syncMetadata.lastModifiedDeviceName} - ${formatDate(local.metadata.modified)})`,
    syncMetadata: {
      ...local.syncMetadata,
      isSynced: false,
      cloudId: undefined
    }
  };

  const remoteCopy: Prompt = {
    ...convertRemoteToLocal(remote),
    id: generateNewId(),
    title: `${remote.title} (from ${remote.sync_metadata.lastModifiedDeviceName} - ${formatDate(remote.updated_at)})`,
  };

  return [localCopy, remoteCopy];
}
```

### Execute Sync Plan (Simplified)

```typescript
async function executeSyncPlan(plan: SyncPlan): Promise<SyncResult> {
  const result: SyncResult = {
    stats: { uploaded: 0, downloaded: 0, conflicts: 0, duration: 0 }
  };

  const startTime = Date.now();

  try {
    // 1. Handle conflicts first (create local duplicates)
    for (const conflict of plan.conflicts) {
      const [localCopy, remoteCopy] = await resolveConflict(
        conflict.local,
        conflict.remote
      );
      await promptService.savePromptDirectly(localCopy);
      await promptService.savePromptDirectly(remoteCopy);
      result.stats.conflicts++;
    }

    // 2. Upload prompts (simple sequential)
    for (const prompt of plan.toUpload) {
      const cloudId = await uploadPrompt(prompt);

      // Update local prompt with cloud ID
      prompt.syncMetadata = {
        ...prompt.syncMetadata,
        cloudId: cloudId,
        isSynced: true,
        lastSyncedAt: new Date()
      };
      await promptService.updatePrompt(prompt);
      result.stats.uploaded++;
    }

    // 3. Download prompts (simple sequential)
    for (const remotePrompt of plan.toDownload) {
      const localPrompt = convertRemoteToLocal(remotePrompt);
      await promptService.savePromptDirectly(localPrompt);
      result.stats.downloaded++;
    }

    result.stats.duration = Date.now() - startTime;
    return result;

  } catch (error) {
    // Simple error handling
    if (error.message.includes('network') || error.message.includes('fetch')) {
      throw new Error('Unable to sync - check your internet connection');
    } else if (error.message.includes('auth') || error.message.includes('unauthorized')) {
      throw new Error('Authentication expired - please sign in again');
    } else if (error.message.includes('quota') || error.message.includes('limit')) {
      throw new Error('Storage quota exceeded - delete some prompts');
    }
    throw error;
  }
}
```

**Simplicity Rationale:**
- Prompts are small text files (typically <5KB)
- Sequential operations complete in ~1 second for 50-100 prompts
- No need for complex batching, parallelization, or transaction logs
- Simple error messages for common failure cases


---

## UI/UX Specification

### Tree View Updates

#### Sync Button (Top-Level)
**Location**: Toolbar of Prompt Bank tree view (next to refresh button)

```typescript
{
  "command": "promptBank.syncAll",
  "title": "Sync All Prompts",
  "icon": "$(sync)",
  "group": "navigation@1"
}
```

**States:**
- **Idle**: `$(sync)` icon, clickable
- **Syncing**: `$(sync~spin)` animated icon, disabled
- **Error**: Brief error notification (no persistent icon)

**Behavior:**
- Click to sync all prompts
- Shows simple "Syncing..." progress notification
- Success/error notification on completion

#### Per-Prompt Sync Icons
**Location**: Inline with each prompt in tree view

**Only 2 icon states shown:**
1. **⚠️ Out of Sync** (yellow cloud) - Local and remote differ, one is newer
   - Click to sync this specific prompt
   - After sync: icon disappears (becomes synced)

2. **❌ Conflict** (red cloud) - Both versions modified since last sync
   - Click to resolve conflict (creates duplicates with device names)
   - Shows conflict explanation notification

**No icon = Synced** ✅
- Default state, no visual clutter
- Most prompts will have no icon

**Visual Example:**
```
📁 Category Name
  └─ My Prompt Title                    (no icon - synced)
  └─ API Template              ⚠️       (out of sync - click to sync)
  └─ Debug Helper              ❌       (conflict - needs attention)
  └─ Another Prompt                     (no icon - synced)
```

#### Sync Status Indicator
**Location**: Below tree view (status bar-like component)

**Display:**
```
Last synced: 2 minutes ago
[ Sync ] [ View Conflicts ]
```

**Tooltip on hover:**
```
Last sync: Oct 27, 2025 10:45 AM
Device: MacBook Pro (Work)
Uploaded: 3 prompts
Downloaded: 1 prompt
Conflicts: 0
```

### Sync Progress Notification (Simplified)

**During sync:**
```
Syncing prompts...
```
Simple VS Code progress notification with spinner. No percentage, no detailed steps.

**After success:**
```
✓ Sync complete - 5 prompts synced
```
Brief success message. If conflicts occurred:
```
✓ Sync complete - 5 prompts synced, 2 conflicts resolved
```

**After error:**
```
✗ Unable to sync - check your internet connection
```
or
```
✗ Authentication expired - please sign in again
```
Simple error message with actionable guidance.

### First-Time Sync Experience

**When user clicks sync for first time:**

```
┌───────────────────────────────────────┐
│ Enable Prompt Sync?                   │
│                                       │
│ Sync your prompts across all devices  │
│ where you're signed in with:          │
│                                       │
│ user@example.com                      │
│                                       │
│ • Your prompts will be stored securely│
│ • You can sync anytime you want       │
│ • Local prompts are never deleted     │
│                                       │
│ [ Enable Sync ]  [ Not Now ]          │
└───────────────────────────────────────┘
```

### Conflict Resolution UI (Simplified)

**When clicking a conflict icon (❌):**

Simple information message:
```
Conflict detected: This prompt was modified on both devices.

We've kept both versions:
• "Debug React Components (from MacBook Pro - Oct 31)"
• "Debug React Components (from Desktop PC - Oct 31)"

You can review and delete the version you don't need.
```

**When conflicts occur during "Sync All":**

Success notification mentions conflicts:
```
✓ Sync complete - 5 prompts synced, 2 conflicts resolved

Conflicted prompts have been duplicated so no work was lost.
```

No complex UI needed - conflicts are rare and self-explanatory with duplicate naming.

---

## Backend Implementation

### Supabase Edge Functions

#### Function: `sync-prompt` (Singular)

**Purpose**: Upload or update a single prompt to cloud storage

**Endpoint**: `POST /functions/v1/sync-prompt`

**Request:**
```typescript
{
  cloudId?: string;       // If updating existing
  localId: string;
  title: string;
  content: string;
  description?: string;
  category: string;
  order?: number;
  categoryOrder?: number;
  variables: TemplateVariable[];
  metadata: PromptMetadata;
  syncMetadata: SyncMetadata;
}
```

**Response:**
```typescript
{
  success: boolean;
  cloudId: string;        // Cloud ID (new or existing)
  error?: string;         // Only if success is false
}
```

**Note:** Simple single-prompt endpoint. For "Sync All", client calls this endpoint multiple times sequentially. No complex batching needed.

#### Function: `get-user-prompts`

**Purpose**: Fetch all prompts for authenticated user

**Endpoint**: `GET /functions/v1/get-user-prompts`

**Query Parameters:**
- `since`: ISO timestamp (optional) - only return prompts modified after this time

**Response:**
```typescript
{
  prompts: Array<RemotePrompt>;
  total: number;
  lastUpdated: string; // ISO timestamp
}
```

### Database Operations

#### Insert/Update Logic

```sql
-- Upsert prompt (insert or update if exists)
INSERT INTO user_prompts (
  user_id,
  cloud_id,
  local_id,
  title,
  content,
  description,
  category,
  prompt_order,
  category_order,
  variables,
  metadata,
  sync_metadata,
  updated_at
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
ON CONFLICT (cloud_id)
DO UPDATE SET
  title = EXCLUDED.title,
  content = EXCLUDED.content,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  prompt_order = EXCLUDED.prompt_order,
  category_order = EXCLUDED.category_order,
  variables = EXCLUDED.variables,
  metadata = EXCLUDED.metadata,
  sync_metadata = EXCLUDED.sync_metadata,
  updated_at = NOW();
```

### Storage Limits & Quota Management

**Free Tier Limits (aligned with Supabase free tier):**
- **Max prompts per user**: 1,000 prompts
- **Max storage per user**: 10 MB total
- **Max prompt size**: 50 KB per prompt
- **API rate limit**: 100 requests per minute per user

**Quota Enforcement:**

```sql
-- Add storage tracking table
CREATE TABLE user_storage_quotas (
  user_id TEXT PRIMARY KEY,
  prompt_count INTEGER DEFAULT 0,
  storage_bytes BIGINT DEFAULT 0,
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Trigger to update quota on insert/update/delete
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

    -- Check limits
    IF (SELECT prompt_count FROM user_storage_quotas WHERE user_id = NEW.user_id) > 1000 THEN
      RAISE EXCEPTION 'Prompt limit exceeded (max 1000)';
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

**Client-Side Quota Checking:**

```typescript
interface UserQuota {
  promptCount: number;
  promptLimit: number;
  storageBytes: number;
  storageLimit: number;  // 10 MB = 10485760 bytes
  percentageUsed: number;
}

async function checkQuotaBeforeSync(): Promise<UserQuota> {
  const quota = await fetchUserQuota();

  if (quota.percentageUsed > 90) {
    vscode.window.showWarningMessage(
      `You're using ${quota.percentageUsed}% of your storage quota. ` +
      `Consider deleting old prompts.`
    );
  }

  return quota;
}
```

---

## Testing Strategy

### Unit Tests

**File: `test/sync-service.test.ts`**

```typescript
describe('SyncService', () => {
  describe('computeSyncPlan', () => {
    it('should identify new local prompts for upload', () => {});
    it('should identify new remote prompts for download', () => {});
    it('should detect conflicts when both local and remote modified', () => {});
    it('should prefer local changes when remote unchanged', () => {});
    it('should prefer remote changes when local unchanged', () => {});
  });

  describe('resolveConflict', () => {
    it('should create two separate prompts with device names', () => {});
    it('should preserve original content in both versions', () => {});
    it('should update sync metadata correctly', () => {});
  });

  describe('performSync', () => {
    it('should require authentication', () => {});
    it('should handle network errors gracefully', () => {});
    it('should update sync state after successful sync', () => {});
  });
});
```

### Integration Tests

**File: `test/e2e/sync-integration.test.ts`**

```typescript
describe('Sync Integration', () => {
  it('should sync prompts from device A to device B', async () => {
    // Setup: Create prompts on device A
    // Action: Sync on device A, then sync on device B
    // Assert: Device B has all prompts from device A
  });

  it('should handle bidirectional sync correctly', async () => {
    // Setup: Both devices have prompts synced
    // Action: Create new prompt on each device, sync both
    // Assert: Both devices have both new prompts
  });

  it('should resolve conflicts by keeping both versions', async () => {
    // Setup: Same prompt edited on both devices
    // Action: Sync both devices
    // Assert: Two separate prompts exist on both devices
  });
});
```

### Manual Testing Checklist

- [ ] First-time sync on fresh device
- [ ] Sync after creating new prompts locally
- [ ] Sync after creating new prompts remotely (on another device)
- [ ] Conflict resolution with identical prompt IDs
- [ ] Sync with no internet connection (error handling)
- [ ] Sync with slow network (progress indication)
- [ ] Sign out and verify local prompts remain
- [ ] Sign in on new device and verify prompts download
- [ ] Large library sync (100+ prompts) performance
- [ ] Sync status indicator updates correctly

---

## Security & Privacy

### Data Protection

1. **Authentication**: Google OAuth with minimal permissions
2. **Authorization**: Row Level Security (RLS) in Supabase ensures users only access their own data
3. **Encryption**: HTTPS for all network requests
4. **Token Storage**: Secure storage using VS Code's SecretStorage API

### Privacy Considerations

1. **Data Ownership**: User owns all prompt data
2. **Data Location**: Stored in Supabase (EU/US regions available)
3. **Data Deletion**: Provide "Delete All Cloud Data" option
4. **Local-First**: All data available offline, cloud is supplement not requirement

### Security Best Practices

```typescript
// 1. Always validate user session before sync
const user = await authService.getValidAccessToken();

// 2. Sanitize all user input
const sanitizedContent = sanitize(prompt.content);

// 3. Use prepared statements for database queries
// (Handled by Supabase automatically)

// 4. Implement rate limiting (in Edge Function)
const rateLimiter = new RateLimit({
  maxRequests: 10,
  windowMs: 60000 // 10 requests per minute
});
```

---

## Rollout Plan

### Phase 1: Core Sync (MVP) - Week 1

**Scope:**
- Basic sync service implementation
- UI components (button, status, notifications)
- Supabase backend (database + edge functions)
- Three-way merge algorithm
- Conflict resolution (keep both)
- Unit tests

**Success Criteria:**
- Can sync prompts between 2 devices
- Conflicts create duplicates
- All tests pass

### Phase 2: Polish & UX - Week 2

**Scope:**
- Improve conflict resolution UI
- Add sync history view
- Device management UI (see all synced devices)
- Better error messages and recovery
- Performance optimization (batch operations)
- Integration tests

**Success Criteria:**
- Sync completes in <5 seconds for 100 prompts
- Clear user feedback for all operations
- Edge cases handled gracefully

### Phase 3: Advanced Features - Week 3+

**Scope (Future):**
- Selective sync (choose categories)
- Sync scheduling (auto-sync every X hours)
- Conflict merge UI (side-by-side diff)
- Sync analytics (bandwidth, frequency)
- Team sync (shared workspaces)

---

## Open Questions & Decisions

### Decision Log

| # | Question | Decision | Rationale | Date |
|---|----------|----------|-----------|------|
| 1 | Manual vs Automatic sync? | Manual on-demand | User control and trust | Oct 27 |
| 2 | Conflict strategy? | Keep both versions | Data safety over convenience | Oct 27 |
| 3 | Selective vs Full sync? | Both - "Sync All" + per-prompt sync | User control and flexibility | Oct 31 |
| 4 | Auth provider? | Google OAuth (reuse existing) | Already implemented | Oct 27 |
| 5 | Storage backend? | Supabase (reuse existing) | Leverage existing infrastructure | Oct 27 |
| 6 | Device ID generation? | hash(hostname + username + vscodeInstallPath) | Stable across sessions, unique per install | Oct 31 |
| 7 | First sync behavior? | Merge everything (no conflicts) | User-friendly onboarding | Oct 31 |
| 8 | Error recovery? | Simple try-catch with user-friendly messages | Prompts are small, no complex rollback needed | Oct 31 |
| 9 | Storage limits? | 1,000 prompts / 10 MB per user | Align with Supabase free tier | Oct 31 |
| 10 | Batch operations? | Sequential single-prompt uploads | Simplicity over complexity - prompts are tiny | Oct 31 |
| 11 | Sync icons? | 2 icons only (out-of-sync ⚠️, conflict ❌) | Minimal visual clutter | Oct 31 |
| 12 | Progress detail? | High-level "Syncing..." only | Fast operations don't need detailed progress | Oct 31 |

### Future Considerations

1. ~~**Storage Limits**~~: ✅ **RESOLVED** - Implemented 1,000 prompt / 10 MB limit with quota tracking
2. **Sync Conflicts UI**: Should we show visual diff for conflicts? (Phase 3)
3. **Device Limits**: Consider max 10 synced devices per user for security
4. **Sync History**: Keep log of all sync operations for debugging (Phase 2)
5. **Data Export**: Provide "Download All Data" option for backup/migration (Phase 2)
6. **Pagination**: If approaching limits, implement cursor-based pagination for large libraries
7. **Compression**: Consider gzip compression for network transfer to improve performance

---

## Implementation Checklist

### Development

- [ ] Create `SyncService` class
- [ ] Extend `Prompt` model with `SyncMetadata`
- [ ] Extend `FileStorageProvider` with sync state management
- [ ] Create sync button in tree view
- [ ] Create sync status indicator
- [ ] Implement sync progress notifications
- [ ] Create Supabase database table
- [ ] Create `sync-prompts` Edge Function
- [ ] Create `get-user-prompts` Edge Function
- [ ] Implement three-way merge algorithm
- [ ] Implement conflict resolution logic
- [ ] Add device identification
- [ ] Write unit tests
- [ ] Write integration tests

### Documentation

- [ ] Update README.md with sync feature
- [ ] Add sync usage examples
- [ ] Document sync API
- [ ] Add troubleshooting guide
- [ ] Update CHANGELOG.md

### Quality Assurance

- [ ] Manual testing on 3 devices (Windows, Mac, Linux)
- [ ] Performance testing (100+ prompts)
- [ ] Network error scenarios
- [ ] Conflict resolution scenarios
- [ ] Security review
- [ ] Code review

### Release

- [ ] Create PR to dev branch
- [ ] Address review feedback
- [ ] Merge to dev
- [ ] Test on dev branch
- [ ] Merge to main
- [ ] Publish new version

---

## Appendix

### Glossary

- **Sync**: Process of synchronizing prompts between local device and cloud storage
- **Conflict**: Situation where the same prompt has been modified on multiple devices since last sync
- **Three-Way Merge**: Algorithm that compares local, remote, and last synced state
- **Device ID**: Unique identifier for each device/installation
- **Cloud ID**: Unique identifier for prompt in cloud storage (different from local ID)
- **Sync Metadata**: Additional data attached to prompts for sync tracking

### References

- [VS Code Extension API](https://code.visualstudio.com/api)
- [Supabase Documentation](https://supabase.com/docs)
- [Three-Way Merge Algorithms](https://en.wikipedia.org/wiki/Merge_(version_control))
- [Operational Transformation](https://en.wikipedia.org/wiki/Operational_transformation)

---

**Document Status**: Ready for Implementation
**Last Updated**: October 31, 2025
**Next Review**: After implementation Phase 1 completion

### Review Sign-off

- [x] Technical architecture reviewed and clarified
- [x] Data models simplified (removed unused fields)
- [x] Performance strategy defined (batch operations, error recovery)
- [x] Storage limits and quotas specified
- [x] All engineering decisions documented
- [ ] Product/UX review (pending)
- [ ] Security review (pending Phase 1 implementation)
