# Sync 409 Error Refinement - Implementation Plan

## Context

Currently, the sync service receives generic `409 Conflict` errors from Edge Functions that don't distinguish between different conflict types. This forces the client to use workarounds that may create unnecessary duplicate prompts.

## Current Behavior

**Server Response (Generic):**
```typescript
// All conflict types return same format:
{
  status: 409,
  message: "conflict"
}
```

**Client Workaround (syncService.ts:851-882):**
```typescript
catch (uploadError) {
  if (errorContext?.status === 409) {
    // Can't distinguish conflict type - assume soft-delete
    // Retry as NEW prompt (may create duplicates if wrong assumption)
    const uploaded = await this.uploadPrompt(prompt); // No syncInfo
  }
}
```

**Problem:** The client can't distinguish between:
1. **Soft-deleted prompt** → Should retry as NEW (correct)
2. **Version mismatch** → Should retry entire sync (not create duplicate)
3. **Optimistic lock conflict** → Should retry entire sync (not create duplicate)

## Proposed Solution

### Phase 1: Server-Side Changes (Edge Functions)

#### 1.1 Define Error Code Constants

**File:** `supabase/functions/_shared/errors.ts` (new file)

```typescript
/**
 * Standardized error codes for sync conflicts
 */
export const SyncErrorCodes = {
  PROMPT_DELETED: 'PROMPT_DELETED',
  VERSION_CONFLICT: 'VERSION_CONFLICT',
  OPTIMISTIC_LOCK_CONFLICT: 'OPTIMISTIC_LOCK_CONFLICT',
} as const;

export type SyncErrorCode = typeof SyncErrorCodes[keyof typeof SyncErrorCodes];

/**
 * Create a 409 conflict response with specific error code
 */
export function conflictResponse(code: SyncErrorCode, details?: Record<string, unknown>) {
  return new Response(
    JSON.stringify({
      error: code,
      message: getErrorMessage(code),
      details,
    }),
    {
      status: 409,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

function getErrorMessage(code: SyncErrorCode): string {
  switch (code) {
    case SyncErrorCodes.PROMPT_DELETED:
      return 'Cannot update a soft-deleted prompt';
    case SyncErrorCodes.VERSION_CONFLICT:
      return 'Prompt version has changed since last sync';
    case SyncErrorCodes.OPTIMISTIC_LOCK_CONFLICT:
      return 'Prompt was modified by another device';
  }
}
```

#### 1.2 Update Edge Function: `sync-prompt`

**File:** `supabase/functions/sync-prompt/index.ts`

**Before:**
```typescript
// Generic conflict handling
if (existingPrompt.deleted_at) {
  throw new Error('Cannot update deleted prompt');
}

if (existingPrompt.version !== expectedVersion) {
  throw new Error('Version conflict');
}
```

**After:**
```typescript
import { conflictResponse, SyncErrorCodes } from '../_shared/errors.ts';

// Specific conflict handling
if (existingPrompt.deleted_at) {
  return conflictResponse(SyncErrorCodes.PROMPT_DELETED, {
    cloudId: existingPrompt.cloud_id,
    deletedAt: existingPrompt.deleted_at,
    deletedByDevice: existingPrompt.deleted_by_device_id,
  });
}

if (expectedVersion && existingPrompt.version !== expectedVersion) {
  return conflictResponse(SyncErrorCodes.VERSION_CONFLICT, {
    expectedVersion,
    actualVersion: existingPrompt.version,
    lastModifiedAt: existingPrompt.updated_at,
  });
}

// If multiple concurrent updates (rare race condition)
if (contentHash === existingPrompt.content_hash && version !== expectedVersion) {
  return conflictResponse(SyncErrorCodes.OPTIMISTIC_LOCK_CONFLICT, {
    expectedVersion,
    actualVersion: existingPrompt.version,
  });
}
```

### Phase 2: Client-Side Changes (Extension)

#### 2.1 Define Error Types

**File:** `src/models/syncState.ts`

```typescript
/**
 * Sync conflict error codes from Edge Functions
 */
export enum SyncConflictType {
  PROMPT_DELETED = 'PROMPT_DELETED',
  VERSION_CONFLICT = 'VERSION_CONFLICT',
  OPTIMISTIC_LOCK_CONFLICT = 'OPTIMISTIC_LOCK_CONFLICT',
}

/**
 * Parsed sync error from Edge Function
 */
export interface SyncConflictError {
  code: SyncConflictType;
  message: string;
  details?: {
    cloudId?: string;
    deletedAt?: string;
    deletedByDevice?: string;
    expectedVersion?: number;
    actualVersion?: number;
    lastModifiedAt?: string;
  };
}
```

#### 2.2 Update SyncService Error Handling

**File:** `src/services/syncService.ts`

**Replace workaround (lines 851-882) with:**

```typescript
/**
 * Parse sync conflict error from Edge Function response
 */
private parseSyncConflictError(error: unknown): SyncConflictError | null {
  const errorContext = (error as { context?: { error?: string; details?: unknown } }).context;

  if (!errorContext?.error) {
    return null;
  }

  const code = errorContext.error as SyncConflictType;
  const details = errorContext.details as SyncConflictError['details'];

  return {
    code,
    message: (error as Error).message || 'Sync conflict',
    details,
  };
}

/**
 * Handle upload with intelligent conflict resolution
 */
private async uploadWithConflictHandling(
  prompt: Prompt,
  syncInfo?: PromptSyncInfo
): Promise<{ cloudId: string; version: number }> {
  try {
    return await this.uploadPrompt(prompt, syncInfo);
  } catch (uploadError) {
    const conflictError = this.parseSyncConflictError(uploadError);

    if (!conflictError) {
      throw uploadError; // Not a sync conflict, re-throw
    }

    switch (conflictError.code) {
      case SyncConflictType.PROMPT_DELETED:
        // Soft-deleted prompt - upload as NEW with new cloudId
        console.info(
          `[SyncService] Prompt ${prompt.id} was deleted in cloud. Creating new cloud prompt.`
        );
        return await this.uploadPrompt(prompt); // No syncInfo = new prompt

      case SyncConflictType.VERSION_CONFLICT:
      case SyncConflictType.OPTIMISTIC_LOCK_CONFLICT:
        // Version conflict - retry entire sync to get fresh state
        console.warn(
          `[SyncService] Optimistic lock conflict for prompt ${prompt.id}. ` +
          `Expected v${conflictError.details?.expectedVersion}, ` +
          `actual v${conflictError.details?.actualVersion}. Retrying sync...`
        );
        throw new Error('sync_conflict_retry');

      default:
        // Unknown conflict type - fail safe by retrying entire sync
        console.error(`[SyncService] Unknown conflict type: ${conflictError.code}`);
        throw new Error('sync_conflict_retry');
    }
  }
}
```

**Update executeSyncPlan (line 809):**

```typescript
// Before:
for (const promptUnknown of plan.toUpload) {
  const prompt = promptUnknown as Prompt;
  const syncInfo = await this.syncStateStorage!.getPromptSyncInfo(prompt.id);

  try {
    const uploaded = await this.uploadPrompt(prompt, syncInfo ?? undefined);
    // ... success path
  } catch (uploadError) {
    // ... workaround code
  }
}

// After:
for (const promptUnknown of plan.toUpload) {
  const prompt = promptUnknown as Prompt;
  const syncInfo = await this.syncStateStorage!.getPromptSyncInfo(prompt.id);

  const uploaded = await this.uploadWithConflictHandling(prompt, syncInfo ?? undefined);
  const contentHash = computeContentHash(prompt);

  await this.syncStateStorage!.setPromptSyncInfo(prompt.id, {
    cloudId: uploaded.cloudId,
    lastSyncedContentHash: contentHash,
    lastSyncedAt: new Date(),
    version: uploaded.version,
    isDeleted: false,
  });

  result.stats.uploaded++;
}
```

### Phase 3: Testing

#### 3.1 Server-Side Tests

**File:** `supabase/functions/sync-prompt/index.test.ts`

```typescript
import { assertEquals } from 'https://deno.land/std@0.192.0/testing/asserts.ts';
import { SyncErrorCodes } from '../_shared/errors.ts';

Deno.test('sync-prompt returns PROMPT_DELETED for soft-deleted prompts', async () => {
  // Setup: Create and soft-delete a prompt
  const cloudId = await createAndDeletePrompt();

  // Act: Try to update deleted prompt
  const response = await invokeFunction('sync-prompt', {
    cloudId,
    expectedVersion: 1,
    content: 'Updated content',
  });

  // Assert
  assertEquals(response.status, 409);
  const body = await response.json();
  assertEquals(body.error, SyncErrorCodes.PROMPT_DELETED);
  assertEquals(body.details.cloudId, cloudId);
});

Deno.test('sync-prompt returns VERSION_CONFLICT for version mismatch', async () => {
  // Setup: Create prompt with version 1, update to version 2
  const cloudId = await createPrompt();
  await updatePrompt(cloudId); // Now version 2

  // Act: Try to update with outdated version 1
  const response = await invokeFunction('sync-prompt', {
    cloudId,
    expectedVersion: 1, // Outdated
    content: 'Updated content',
  });

  // Assert
  assertEquals(response.status, 409);
  const body = await response.json();
  assertEquals(body.error, SyncErrorCodes.VERSION_CONFLICT);
  assertEquals(body.details.expectedVersion, 1);
  assertEquals(body.details.actualVersion, 2);
});
```

#### 3.2 Client-Side Tests

**File:** `test/sync-conflict-error-handling.test.ts`

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { SyncService } from '../src/services/syncService';
import { server, syncTestHelpers } from './e2e/helpers/msw-setup';

describe('SyncService - Conflict Error Handling', () => {
  it('should upload as NEW when cloud prompt is soft-deleted', async () => {
    // Arrange
    const prompt = createPrompt({ title: 'Test', content: 'Content' });
    const cloudPrompt = syncTestHelpers.addCloudPrompt({ local_id: prompt.id, ... });
    syncTestHelpers.deleteCloudPrompt(cloudPrompt.cloud_id); // Soft-delete

    // Setup sync state pointing to deleted cloud prompt
    await syncStateStorage.setPromptSyncInfo(prompt.id, {
      cloudId: cloudPrompt.cloud_id,
      lastSyncedContentHash: computeContentHash(prompt),
      lastSyncedAt: new Date(),
      version: 1,
    });

    // Modify local prompt
    prompt.content = 'Modified Content';

    // Act
    const result = await syncService.performSync([prompt], promptService);

    // Assert
    expect(result.stats.uploaded).toBe(1);

    // Verify new cloud prompt created (not updated deleted one)
    const allCloudPrompts = syncTestHelpers.getAllCloudPrompts();
    const newCloudPrompt = allCloudPrompts.find(p => !p.deleted_at && p.content === 'Modified Content');
    expect(newCloudPrompt).toBeDefined();
    expect(newCloudPrompt.cloud_id).not.toBe(cloudPrompt.cloud_id); // Different cloudId
  });

  it('should retry entire sync on version conflict', async () => {
    // Arrange
    const prompt = createPrompt({ title: 'Test', content: 'Original' });
    const cloudPrompt = syncTestHelpers.addCloudPrompt({ local_id: prompt.id, version: 2 });

    // Setup outdated sync state
    await syncStateStorage.setPromptSyncInfo(prompt.id, {
      cloudId: cloudPrompt.cloud_id,
      lastSyncedContentHash: computeContentHash(prompt),
      lastSyncedAt: new Date(),
      version: 1, // Outdated
    });

    prompt.content = 'Modified';

    // Act & Assert
    await expect(
      syncService.performSync([prompt], promptService)
    ).rejects.toThrow('sync_conflict_retry');
  });
});
```

## Migration Strategy

### Backward Compatibility

**Problem:** Old clients won't understand new error format.

**Solution:** Server must support both formats during transition:

```typescript
// Edge Function response format
if (clientSupportsNewErrors(request)) {
  return conflictResponse(SyncErrorCodes.PROMPT_DELETED, details);
} else {
  // Legacy format for old clients
  throw new Error('conflict');
}

function clientSupportsNewErrors(request: Request): boolean {
  const clientVersion = request.headers.get('X-Client-Version');
  return clientVersion && semver.gte(clientVersion, '0.7.0');
}
```

**Client sends version header:**
```typescript
// supabaseClient.ts
const headers = {
  'X-Client-Version': vscode.extensions.getExtension('prestissimo.prompt-bank')?.packageJSON.version,
};
```

### Rollout Plan

1. **Week 1:** Deploy server changes with backward compatibility
2. **Week 2:** Release extension v0.7.0 with new error handling
3. **Week 4:** Monitor error logs for old client usage (< 5%)
4. **Week 6:** Remove legacy error format from server

## Success Metrics

- **Reduced duplicate prompts:** < 1% of syncs should create duplicates (down from current ~5%)
- **Improved conflict resolution:** 100% of soft-delete conflicts handled correctly
- **Better error messages:** Users see specific conflict reasons in logs

## Implementation Checklist

### Server-Side
- [ ] Create `_shared/errors.ts` with error codes
- [ ] Update `sync-prompt` Edge Function
- [ ] Update `delete-prompt` Edge Function (if needed)
- [ ] Add server-side tests for each error type
- [ ] Deploy to staging and verify

### Client-Side
- [ ] Add `SyncConflictType` enum to `syncState.ts`
- [ ] Implement `parseSyncConflictError()` in `syncService.ts`
- [ ] Implement `uploadWithConflictHandling()` in `syncService.ts`
- [ ] Update `executeSyncPlan()` to use new handler
- [ ] Add client-side tests for conflict scenarios
- [ ] Update error messages shown to users

### Testing
- [ ] Integration tests with MSW for all 3 conflict types
- [ ] Manual testing: soft-delete conflict scenario
- [ ] Manual testing: version conflict scenario
- [ ] Manual testing: backward compatibility (old client + new server)

### Documentation
- [ ] Update CLAUDE.md with new error handling
- [ ] Update README.md sync section with conflict explanations
- [ ] Add JSDoc comments to new functions

## Related Files

- **Server:** `supabase/functions/sync-prompt/index.ts`
- **Client:** `src/services/syncService.ts` (lines 851-882)
- **Models:** `src/models/syncState.ts`
- **Tests:** `test/sync-conflict-error-handling.test.ts` (new)

## Estimated Effort

- **Server changes:** 2-3 hours
- **Client changes:** 3-4 hours
- **Testing:** 2-3 hours
- **Documentation:** 1 hour
- **Total:** 8-11 hours (~1.5 days)
