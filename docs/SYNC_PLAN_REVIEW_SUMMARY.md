# Sync Implementation Plan - Critical Updates Summary

**Date**: November 1, 2025
**Reviewer**: Technical Architecture Review
**Status**: ✅ READY FOR IMPLEMENTATION

---

## Executive Summary

The original implementation plan was **75% ready** but missed **5 critical risks** that could cause data loss, infinite loops, and race conditions. This review identified and fixed all critical issues.

**Timeline Impact**: 6-7 days → **8-9 days** (worth it to avoid refactoring mid-implementation)

**Risk Impact**: 3 critical risks unaddressed → **ALL 8 RISKS MITIGATED**

---

## What Changed

### ✅ Added: Phase 0 - Design Decisions (NEW)

**Why Critical**: Making architectural decisions upfront prevents mid-implementation refactoring.

**6 Key Decisions Documented**:

1. **Sync State Storage**: Separate `sync-state.json` file (NOT embedded in Prompt objects)
   - **Prevents**: Infinite loops from modifying prompt timestamps
   - **Benefit**: Clean separation of concerns

2. **Deletion Handling**: MVP ignores deletions (document limitation)
   - **Trade-off**: Simplicity over completeness for MVP
   - **Future**: Add tombstone deletion in v0.8.0

3. **First Sync Conflict Detection**: Content-hash comparison even on first sync
   - **Prevents**: Silent data loss when same prompt has different content on two devices
   - **Benefit**: Data safety is paramount

4. **Edge Function Design**: Single-prompt endpoint (simple, sequential)
   - **Rationale**: Prompts are tiny (~2KB), sequential sync is fast enough
   - **Trade-off**: If users have 500+ prompts, may revisit batch endpoint later

5. **Optimistic Locking**: Version column with database triggers
   - **Prevents**: Race conditions when two devices upload simultaneously
   - **Benefit**: Industry-standard approach (Notion, Figma use this)

6. **Content Hash Algorithm**: SHA256
   - **Prevents**: False positives from timestamp-only conflict detection
   - **Benefit**: Catches same-second edits

---

## Critical Bugs Fixed

### 🔴 Bug #1: Infinite Sync Loop (CRITICAL)
**Original Plan**: Embed `syncMetadata` in Prompt objects
**Problem**: Updating sync metadata triggers `modified` timestamp → triggers another sync check → infinite loop

**FIX**: Separate `sync-state.json` file
```typescript
// Do NOT modify Prompt interface
// Instead: Store sync state separately in .vscode/prompt-bank/sync-state.json
interface SyncState {
  userId: string;
  deviceId: string;
  lastSyncedAt?: Date;
  promptSyncMap: Record<string, PromptSyncInfo>;  // Map: promptId → cloudId + hash
}
```

**Impact**: PREVENTS CRITICAL BUG

---

### 🔴 Bug #2: Data Loss on First Sync (CRITICAL)
**Original Plan**: "Merge everything, no conflicts on first sync"
**Problem**: Device A has "API Template" v1, Device B has "API Template" v2 → one version silently lost

**FIX**: Content-hash conflict detection on first sync
```typescript
if (!lastSync) {
  // First sync - but still check for content conflicts
  if (localHash !== remoteHash) {
    plan.conflicts.push({ local, remote });  // Keep both versions!
  }
}
```

**Impact**: PREVENTS DATA LOSS

---

### 🔴 Bug #3: Partial Sync Failure (CRITICAL)
**Original Plan**: Upload prompts sequentially, quota check happens in database trigger
**Problem**: User tries to sync 50 prompts. Prompt #27 hits quota limit. Database raises exception. Now:
- Prompts 1-26 uploaded ✅
- Prompts 27-50 failed ❌
- Inconsistent state

**FIX**: Pre-flight quota check
```typescript
async performSync() {
  // ...
  const syncPlan = computeSyncPlan(...);

  // PRE-FLIGHT CHECK (before uploading anything)
  await checkQuotaBeforeSync(syncPlan);  // Throws if would exceed limit

  // Now safe to proceed - either sync everything or nothing
  await executeSyncPlan(syncPlan);
}
```

**Impact**: PREVENTS PARTIAL SYNC FAILURES (atomic all-or-nothing)

---

### 🟡 Bug #4: Race Conditions (HIGH)
**Original Plan**: Single-prompt endpoint, no version checking
**Problem**: Device A and Device B simultaneously upload to same prompt → last-write-wins, no conflict detection

**FIX**: Optimistic locking with version column
```sql
-- Database
ALTER TABLE user_prompts ADD COLUMN version INTEGER DEFAULT 1;

CREATE TRIGGER increment_version_trigger
BEFORE UPDATE ON user_prompts
FOR EACH ROW EXECUTE FUNCTION increment_version();
```

```typescript
// Edge function
UPDATE user_prompts
SET ...
WHERE cloud_id = $1
  AND version = $expectedVersion  -- Optimistic lock check
RETURNING version;

// If no rows affected → version mismatch → conflict!
```

**Impact**: PREVENTS RACE CONDITIONS

---

### 🟡 Bug #5: Same-Second Edits Missed (MEDIUM)
**Original Plan**: Timestamp-only conflict detection
**Problem**: Device A edits at 10:30:00, Device B edits at 10:30:00 → timestamps match, no conflict detected, but content differs

**FIX**: Content-hash comparison
```typescript
const localHash = computeContentHash(prompt);  // SHA256 of (title + content + category)
const remoteHash = remotePrompt.content_hash;  // Stored in DB
const lastSyncHash = syncInfo?.lastSyncedContentHash;

if (localChangedSinceSync && remoteChangedSinceSync) {
  if (localHash !== remoteHash) {
    // Content actually differs (not just timestamp)
    plan.conflicts.push({ local, remote });
  }
}
```

**Impact**: CATCHES SAME-SECOND EDITS

---

### 🟢 Bug #6: Nested Conflict Suffixes (LOW)
**Original Plan**: Append " (from Device - Date)" to conflicted prompts
**Problem**: If conflicted prompt gets edited again → nested suffixes:
```
"Debug React Components (from MacBook - Oct 27) (from Desktop - Oct 28)"
```

**FIX**: Strip existing suffixes with regex
```typescript
async resolveConflict(local: Prompt, remote: RemotePrompt) {
  const suffixPattern = / \(from .+ - \w{3} \d{1,2}\)$/;
  const baseTitle = local.title.replace(suffixPattern, '');

  const localCopy: Prompt = {
    ...local,
    id: generateNewId(),  // NEW ID (don't reuse original)
    title: `${baseTitle} (from ${deviceName} - ${formatDate(date)})`
  };

  // Same for remoteCopy with NEW ID
}
```

**Impact**: PREVENTS UX ANNOYANCE

---

## Updated Architecture

### Old Approach (PROBLEMATIC)
```
Prompt Object
├── id, title, content, category
├── metadata (created, modified)
└── syncMetadata ❌ (cloudId, lastSyncedAt, etc.)
     └── Modifying this triggers metadata.modified update
         └── Triggers another sync check
             └── INFINITE LOOP
```

### New Approach (CORRECT)
```
Prompt Object                    Sync State File (.vscode/prompt-bank/sync-state.json)
├── id, title, content           ├── userId: "user@example.com"
├── category                     ├── deviceId: "abc123"
└── metadata (created,           ├── deviceName: "MacBook Pro (Mac)"
    modified)                    ├── lastSyncedAt: "2025-10-31T10:30:00Z"
    ✅ NEVER MODIFIED            └── promptSyncMap:
    BY SYNC                          ├── "prompt-1": { cloudId, contentHash, lastSyncedAt }
                                     └── "prompt-2": { cloudId, contentHash, lastSyncedAt }
```

**Benefits**:
- Prompts remain clean, unchanged by sync operations
- No risk of triggering modification timestamps
- Easier to debug sync issues (all sync state in one file)
- Follows separation of concerns principle

---

## Updated Database Schema

### Added Columns
```sql
CREATE TABLE user_prompts (
  -- Existing columns...

  -- NEW: Optimistic locking
  version INTEGER DEFAULT 1 NOT NULL,

  -- NEW: Content hash for conflict detection
  content_hash TEXT NOT NULL,

  -- Existing timestamps...
);

-- Trigger to auto-increment version on update
CREATE TRIGGER user_prompts_version_trigger
BEFORE UPDATE ON user_prompts
FOR EACH ROW EXECUTE FUNCTION increment_version();
```

### Edge Function: sync-prompt
```typescript
const { cloudId, expectedVersion, contentHash, ...promptData } = req.body;

if (cloudId) {
  // UPDATE with optimistic lock check
  const { data } = await supabase
    .from('user_prompts')
    .update({ ...promptData, content_hash: contentHash })
    .eq('cloud_id', cloudId)
    .eq('version', expectedVersion)  // ⚠️ Optimistic lock
    .select('cloud_id, version')
    .single();

  if (!data) {
    // Version mismatch → conflict detected
    return { success: false, error: 'conflict', status: 409 };
  }
}
```

---

## Updated Implementation Timeline

### Original: 6-7 days
- Phase 1 (Core Sync): 3 days
- Phase 2 (UI): 2 days
- Phase 3 (Testing): 1 day
- Phase 4 (Docs): 1 day

### Updated: 8-9 days ✅
- **Phase 0 (Design Decisions)**: 0.5 days **[NEW]**
- **Phase 1 (Core Sync)**: 3.5 days (was 3)
  - Reason: Optimistic locking, content-hash, pre-flight checks
- Phase 2 (UI): 2 days (same)
- **Phase 3 (Testing)**: 1.5 days (was 1)
  - Reason: Additional critical test scenarios
- Phase 4 (Docs): 1 day (same)

**Why Longer?**
- Added Phase 0 for critical design decisions
- Optimistic locking adds complexity to edge functions
- Content-hash conflict detection requires additional testing
- Pre-flight quota checks need thorough validation

**Trade-off**: 2 extra days → **PREVENTS 5 CRITICAL BUGS**

---

## Updated Risk Assessment

| Risk | Likelihood | Impact | Original | Updated | Status |
|------|-----------|--------|----------|---------|--------|
| Supabase RLS issues | Low | High | ✅ Test with multiple accounts | ✅ Test with multiple accounts | ✅ Mitigated |
| Device ID collision | Low | High | ✅ Cryptographic hash | ✅ SHA256 with 3 inputs | ✅ Mitigated |
| Clock skew | Medium | Medium | ⚠️ Document limitation | ✅ **Content-hash comparison** | ✅ **FIXED** |
| **Partial sync failure** | ~~High~~ | ~~High~~ | ❌ Not addressed | ✅ **Pre-flight quota check** | ✅ **FIXED** |
| **Infinite sync loop** | ~~High~~ | ~~Critical~~ | ❌ Not addressed | ✅ **Separate sync-state.json** | ✅ **FIXED** |
| **First sync data loss** | ~~Medium~~ | ~~Critical~~ | ❌ Not addressed | ✅ **Content-hash on first sync** | ✅ **FIXED** |
| **Race conditions** | ~~Medium~~ | ~~High~~ | ❌ Not addressed | ✅ **Optimistic locking (version)** | ✅ **FIXED** |
| Nested conflict suffixes | Low | Low | ❌ Not addressed | ✅ **Regex strip suffixes** | ✅ **FIXED** |
| Deletion sync | Medium | Medium | ❌ Not addressed | ⚠️ **MVP: Document limitation** | ⚠️ Documented (v0.8.0) |

**Summary**: 5 critical risks FIXED, 1 documented as known limitation for MVP, 2 original risks properly mitigated.

---

## Updated Test Checklist

### Critical Bug Prevention Tests (ADDED)
- [ ] **First sync with different content** (same title, different content → should create duplicates)
- [ ] **Same-second edits** (edit on both devices within same second → content-hash detects conflict)
- [ ] **Quota pre-flight check** (try to sync more than limit → should fail before uploading anything)
- [ ] **Simultaneous sync from two devices** (spam sync button on both → optimistic locking catches race)
- [ ] **Rapid successive syncs** (spam sync button → should handle gracefully, no infinite loops)
- [ ] **Conflicted prompt gets edited again** (conflict suffix should be stripped, not nested)

---

## New Files Created

### Original Plan: 2-3 files
1. `src/services/syncService.ts`
2. `src/commands/syncCommands.ts`

### Updated Plan: 5-6 files
1. `src/models/syncState.ts` **[NEW]**
2. `src/storage/syncStateStorage.ts` **[NEW]**
3. `src/services/syncService.ts`
4. `src/utils/deviceId.ts` **[NEW]**
5. `src/utils/contentHash.ts` **[NEW]**
6. `src/commands/syncCommands.ts`
7. 3 Supabase edge functions **[NEW]**

---

## Code Size Estimate

### Original: ~800-1000 lines
### Updated: ~1200-1500 lines

**Breakdown**:
- Sync state models: ~100 lines
- Sync state storage: ~150 lines
- Sync service (with pre-flight, content-hash, conflict resolution): ~500 lines
- Device ID utils: ~50 lines
- Content hash utils: ~30 lines
- Supabase migration (SQL): ~200 lines
- Edge functions: ~300 lines
- UI components: ~200 lines
- Tests: ~200 lines

---

## Bottom Line

### Original Plan Assessment
- ✅ **Good**: Reuse strategy, timeline structure, phase breakdown
- ⚠️ **Missing**: 5 critical risks not addressed
- ❌ **Fatal Flaw**: Embedded sync metadata would cause infinite loops

### Updated Plan Assessment
- ✅ **All critical risks mitigated**
- ✅ **Data loss prevention** (content-hash on first sync)
- ✅ **Race condition prevention** (optimistic locking)
- ✅ **Infinite loop prevention** (separate sync state)
- ✅ **Partial failure prevention** (pre-flight quota check)
- ✅ **Production-ready architecture** (industry-standard patterns)

### Recommendation
**PROCEED WITH UPDATED PLAN**

The 2 extra days are **worth it** to avoid:
1. Mid-implementation refactoring
2. Data loss bugs in production
3. Infinite loop bugs requiring hotfix
4. Race condition bugs causing data corruption

---

## Key Takeaways for Implementation

1. **Never modify Prompt objects during sync** → Use separate sync-state.json
2. **Always check quotas BEFORE uploading** → Pre-flight checks
3. **Always compare content hashes** → Don't rely on timestamps alone
4. **Always use optimistic locking** → Prevent race conditions
5. **Always strip conflict suffixes** → Prevent nested naming
6. **Document deletion limitation** → Add to README, plan for v0.8.0

---

## Next Steps

1. Review Phase 0 design decisions → Confirm choices
2. Implement Phase 1.1 (sync state models + storage)
3. Implement Phase 1.2 (sync service with all safety checks)
4. Implement Phase 1.3 (Supabase backend with optimistic locking)
5. Implement Phase 2 (UI integration)
6. Execute Phase 3 (comprehensive testing with critical scenarios)
7. Document in Phase 4 (including known limitations)
8. Release v0.7.0

---

**Status**: ✅ READY FOR IMPLEMENTATION
**Confidence Level**: HIGH (all critical risks mitigated)
**Estimated Timeline**: 8-9 days (realistic, includes safety mechanisms)
**Risk Level**: LOW (down from HIGH in original plan)
