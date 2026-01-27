# Bi-directional Sync Fix Plan

## Problem Statement

Web-created prompts don't sync to VS Code extension because:
1. Web prompts have `workspace_id = NULL` (no workspace association)
2. Edge Function filters by `workspace_id` when extension provides one
3. Result: Extension never sees web-created prompts
4. **User needs control**: When creating prompts on web, user should choose which workspace/project to assign them to

## Root Cause Analysis

**SQL Evidence** (from Supabase):
```
Web-created (NULL workspace_id):
- "Test sync create" - workspace_id: NULL, cloud_id: NULL
- "Personal Website Context" - workspace_id: NULL, cloud_id: NULL

Extension-synced (has workspace_id):
- "Website browse" - workspace_id: 549639e8-8cd6-...
- "docstrings" - workspace_id: 4c0e7c59-4199-...
```

**Current Gaps**:
1. `get-user-prompts/index.ts:100-102` - Filters by exact `workspace_id`, excluding NULL
2. `sync-prompt/index.ts:160-176` - UPDATE query does NOT include `workspace_id`
3. **No `workspaces` table** - workspace_id is just a UUID with no metadata
4. **No workspace selector in web UI** - prompt-form.tsx has no workspace field

## Recommended Solution: Workspace Registry + Web UI Selector

A two-part solution:
1. **Backend**: Create `workspaces` table to track user's VS Code workspaces with names
2. **Web UI**: Add optional workspace selector when creating/editing prompts

---

## Implementation Details

### Phase 1: Database - Create `workspaces` Table

Create a new table to store workspace metadata:

```sql
-- Migration: create_workspaces_table
CREATE TABLE workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL,           -- VS Code workspace UUID
  user_id UUID NOT NULL REFERENCES auth.users(id),
  name TEXT NOT NULL,                   -- Human-readable name (e.g., "prompt-bank-suite")
  device_name TEXT,                     -- Last device that synced this workspace
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(workspace_id, user_id)
);

-- RLS policies
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own workspaces"
  ON workspaces FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own workspaces"
  ON workspaces FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own workspaces"
  ON workspaces FOR UPDATE
  USING (auth.uid() = user_id);
```

---

### Phase 2: Extension - Register Workspace on Sync

#### 2.1 New Edge Function: `register-workspace`

```typescript
// supabase/functions/register-workspace/index.ts
Deno.serve(async (req) => {
  // ... auth validation ...

  const { workspaceId, workspaceName, deviceName } = await req.json();

  // Upsert workspace (create if not exists, update if exists)
  const { data, error } = await supabase
    .from('workspaces')
    .upsert({
      workspace_id: workspaceId,
      user_id: userId,
      name: workspaceName,
      device_name: deviceName,
      last_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'workspace_id,user_id',
    })
    .select()
    .single();

  return new Response(JSON.stringify({ workspace: data }));
});
```

#### 2.2 `syncService.ts` - Call register-workspace on sync

In `performSync()`, before fetching prompts:

```typescript
// Register/update workspace in cloud
await this.registerWorkspace();
```

New method:
```typescript
private async registerWorkspace(): Promise<void> {
  const workspaceId = await getOrCreateWorkspaceId(this.context);
  const workspaceName = this.getWorkspaceName(); // e.g., folder name
  const deviceInfo = await getDeviceInfo(this.context);

  await supabase.functions.invoke('register-workspace', {
    body: { workspaceId, workspaceName, deviceName: deviceInfo.name }
  });
}

private getWorkspaceName(): string {
  const folders = vscode.workspace.workspaceFolders;
  return folders?.[0]?.name ?? 'Unnamed Workspace';
}
```

---

### Phase 3: Web UI - Workspace Selector

#### 3.1 New Edge Function: `get-user-workspaces`

```typescript
// Returns all workspaces for the authenticated user
Deno.serve(async (req) => {
  // ... auth validation ...

  const { data, error } = await supabase
    .from('workspaces')
    .select('workspace_id, name, device_name, last_synced_at')
    .eq('user_id', userId)
    .order('last_synced_at', { ascending: false });

  return new Response(JSON.stringify({ workspaces: data }));
});
```

#### 3.2 Update `prompt-form.tsx` - Add workspace selector

```tsx
// Add to PromptFormProps
interface PromptFormProps {
  defaultValues?: Partial<PromptFormData>;
  workspaces?: { workspace_id: string; name: string }[];  // NEW
  onSubmit: (data: PromptFormData) => Promise<void>;
  // ...
}

// Add to form schema (lib/validations/prompt.ts)
export const promptFormSchema = z.object({
  // ... existing fields ...
  workspaceId: z.string().nullable().optional(),  // NEW
});

// Add to form UI (between folder and tags)
<FormField
  control={form.control}
  name="workspaceId"
  render={({ field }) => (
    <FormItem>
      <FormLabel>Project (VS Code Workspace)</FormLabel>
      <Select onValueChange={field.onChange} defaultValue={field.value ?? ""}>
        <FormControl>
          <SelectTrigger>
            <SelectValue placeholder="None (available to all workspaces)" />
          </SelectTrigger>
        </FormControl>
        <SelectContent>
          <SelectItem value="">None (available to all workspaces)</SelectItem>
          {workspaces?.map((ws) => (
            <SelectItem key={ws.workspace_id} value={ws.workspace_id}>
              {ws.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FormDescription>
        Optionally assign this prompt to a specific VS Code workspace.
      </FormDescription>
      <FormMessage />
    </FormItem>
  )}
/>
```

#### 3.3 Update create/edit prompt pages to fetch workspaces

```tsx
// In workspace page or new-prompt page
const { data: workspaces } = await supabase.functions.invoke('get-user-workspaces');

<PromptForm workspaces={workspaces} ... />
```

---

### Phase 4: Backend - Update Edge Functions

#### 4.1 `get-user-prompts/index.ts` (lines 99-102)

**NO CHANGE NEEDED** - Keep exact workspace_id filtering. Global prompts (NULL) intentionally excluded from sync.

```typescript
// Current code is correct - only return workspace-specific prompts
if (workspaceId) {
  query = query.eq('workspace_id', workspaceId);
}
```

#### 4.2 `sync-prompt/index.ts` (lines 160-176)

Add `workspace_id` to UPDATE query to allow web-assigned workspace prompts to update:

```typescript
.update({
  // ... existing fields ...
  workspace_id: workspaceId,  // ADD THIS - allows workspace to be set/updated
  // ...
})
```

---

### Phase 5: Extension - Handle Web-Created Workspace Prompts

When a prompt is created on web WITH a workspace selected:
- It has `workspace_id` set but `local_id = NULL`
- Extension sees it in sync response (matches workspace_id)
- Extension generates `local_id`, downloads, and uploads back to set `local_id`

```typescript
// In executeSyncPlan() download section
for (const remotePrompt of plan.toDownload) {
  const isWebCreated = remotePrompt.local_id === null;

  if (isWebCreated) {
    // Web-created prompt assigned to this workspace
    // Generate local_id and download
    const newLocalId = this.generateNewId();
    const localPrompt = this.convertRemoteToLocal({
      ...remotePrompt,
      local_id: newLocalId,
    });
    localPrompt.id = newLocalId;

    await promptService.savePromptDirectly(localPrompt);

    // Upload back to set local_id in cloud
    const uploaded = await this.uploadPrompt(localPrompt, { ... });
    // ... update sync state ...
  } else {
    // Normal download (existing code)
  }
}
```

---

### Phase 6: Handle Web Deletions

#### 6.1 Fetch with `includeDeleted=true`

```typescript
const remotePrompts = await this.fetchRemotePrompts(undefined, true);
```

#### 6.2 Add deletion detection in `computeSyncPlan()`

```typescript
// Detect remotely deleted prompts
for (const remotePrompt of remote) {
  if (!remotePrompt.deleted_at) continue;

  const localPromptId = this.findLocalPromptId(remotePrompt.cloud_id, promptSyncMap);
  if (localPromptId && localMap.has(localPromptId)) {
    plan.toDelete.push({ cloudId: remotePrompt.cloud_id, localId: localPromptId });
  }
}
```

---

## Files to Modify/Create

### Database (Supabase)
| Change | Description |
|--------|-------------|
| New migration | Create `workspaces` table with RLS policies |

### Backend - New Edge Functions (promptbank-website)
| File | Description |
|------|-------------|
| `supabase/functions/register-workspace/index.ts` | NEW - Upsert workspace on sync |
| `supabase/functions/get-user-workspaces/index.ts` | NEW - List user's workspaces for web UI |

### Backend - Existing Edge Functions (promptbank-website)
| File | Change |
|------|--------|
| `supabase/functions/sync-prompt/index.ts:162` | Add `workspace_id` to UPDATE query |
| `supabase/functions/get-user-prompts/index.ts` | NO CHANGE - existing filter is correct |

### Extension (prompt-bank)
| File | Change |
|------|--------|
| `src/services/syncService.ts` | Add `registerWorkspace()` method |
| `src/services/syncService.ts` | Add `getWorkspaceName()` helper |
| `src/services/syncService.ts` | Handle web-created prompts (generate local_id) |
| `src/services/syncService.ts` | Add web deletion detection (includeDeleted=true) |

### Website (promptbank-website)
| File | Change |
|------|--------|
| `src/lib/validations/prompt.ts` | Add `workspaceId` to form schema |
| `src/components/prompts/prompt-form.tsx` | Add workspace selector dropdown |
| `src/app/(dashboard)/workspace/page.tsx` | Fetch workspaces, pass to form |
| `src/components/prompts/new-prompt-form.tsx` | Fetch workspaces, pass to form |
| `src/actions/prompts.ts` | Handle workspaceId in create/update actions |

---

## User Experience Flow

### Web: Creating a Prompt
1. User opens "New Prompt" form
2. Sees optional "Project" dropdown with their VS Code workspaces
3. Options: "None (web only)" or specific workspace names
4. Selects workspace → prompt will sync to that VS Code workspace
5. Selects "None" → prompt stays web-only (personal/experimental, not synced)

### Extension: Syncing
1. Extension calls `register-workspace` to ensure workspace is known
2. Extension calls `get-user-prompts` with workspace_id
3. API returns ONLY prompts with matching workspace_id (no NULL prompts)
4. Bi-directional sync happens for workspace-assigned prompts only

### Web: Viewing Prompts
- All prompts shown (from all workspaces + web-only)
- Workspace column/badge shows: workspace name or "Web only"
- Filter by workspace available

### Key Insight
**Global prompts (workspace_id=NULL) are intentionally web-only**. These are personal/experimental prompts that don't belong to any codebase. They exist only on the web and are NOT synced to any VS Code workspace.

---

## Edge Cases & Mitigations

| Edge Case | Risk | Mitigation |
|-----------|------|------------|
| **No workspaces synced yet** | User can't assign to workspace on web | Show message: "Sync from VS Code first to register workspaces" |
| **Workspace name changes** | Stale name in web | Update name on each sync |
| **Web-only prompt (no workspace)** | User expects it to sync | Clear UI label: "Web only - won't sync to VS Code" |
| **Web deletion of synced prompt** | Local copy orphaned | Detect deleted_at and remove locally |
| **Download fails mid-sync** | Prompt stays cloud-only | Next sync will retry |

---

## Testing Strategy

### Unit Tests (Vitest)
```typescript
describe('workspace registration', () => {
  it('should register workspace on first sync', () => { ... });
  it('should update workspace name on subsequent syncs', () => { ... });
});

describe('web-created prompt sync', () => {
  it('should download web prompt with matching workspace_id', () => { ... });
  it('should generate local_id for web-created prompt', () => { ... });
  it('should NOT download prompts with NULL workspace_id', () => { ... });
});

describe('web deletion sync', () => {
  it('should delete local prompt when remote is soft-deleted', () => { ... });
});
```

### Manual Test Scenarios
1. **Workspace registration**: Sync from VS Code → Check `workspaces` table → Workspace appears with name
2. **Web creation with workspace**: Create prompt on web with workspace selected → Sync → Appears in that workspace
3. **Web creation without workspace**: Create "web only" prompt → Sync → Does NOT appear locally (correct!)
4. **Web deletion**: Delete synced prompt on web → Sync → Removed locally
5. **Web edit**: Edit synced prompt on web → Sync → Changes appear locally

---

## User Questions Answered

### Q1: How to relate newly created web prompts to local workspace?
**A**: User explicitly selects workspace in web UI dropdown when creating/editing prompts. If no workspace selected, prompt is "web only" - a personal/experimental prompt that stays on web and doesn't sync to any VS Code workspace.

### Q2: How to properly test bi-directional sync?
**A**: Three-tier approach:
- Unit tests with mocked Supabase responses (Vitest)
- Integration tests with test Supabase project
- Manual test scenarios (documented above)

### Q3: Should there be sync state indication on web?
**A**: Yes - included in this plan:
- Workspace column/badge shows: workspace name or "Web only"
- Filter by workspace available
- Clear messaging when creating "web only" prompts

---

## Implementation Order

1. **Database**: Create `workspaces` table migration
2. **Backend - new**: Create `register-workspace` and `get-user-workspaces` Edge Functions
3. **Backend - update**: Modify `get-user-prompts` and `sync-prompt`
4. **Extension**: Add workspace registration and global prompt adoption
5. **Website**: Add workspace selector to prompt form
6. **Tests**: Add unit tests
7. **Manual testing**: Build VSIX, test end-to-end
8. **PR**: Create PR with all changes

---

## Verification Checklist

- [ ] **Workspace registration**: Sync from VS Code → `workspaces` table has entry with correct name
- [ ] **Web UI**: Workspace dropdown shows registered workspaces + "Web only" option
- [ ] **Web → Extension (with workspace)**: Create prompt on web with workspace → Sync → Appears locally
- [ ] **Web → Extension (edit)**: Edit prompt on web → Sync → Changes appear locally
- [ ] **Web → Extension (delete)**: Delete prompt on web → Sync → Removed from local prompts.json
- [ ] **Web only**: Create prompt without workspace → Sync → Does NOT appear locally (correct!)
- [ ] **Extension → Web**: Create prompt in VS Code → Sync → Appears on web with workspace badge
- [ ] **Tests**: Run `npm run test` → All tests pass
- [ ] **VSIX**: Build and manually test end-to-end flow

## Supabase Verification (via MCP)
```sql
-- Check workspaces table has entries after sync
SELECT * FROM workspaces WHERE user_id = '<your-user-id>';

-- Check web-created prompt with workspace has local_id after sync
SELECT id, title, workspace_id, local_id FROM prompts
WHERE workspace_id IS NOT NULL AND local_id IS NOT NULL;
```

---

## Implementation Status (January 2025)

### Completed: Extension (prompt-bank) - Phases 5 & 6

**Branch**: `feature/bidirectional-sync-workspace-registration`
**PR**: [#72 - feat(sync): implement bi-directional sync (Phases 5 & 6)](https://github.com/ShaulAb/prompt-bank/pull/72)
**VSIX**: `prompt-bank-0.10.0.vsix` built for testing

#### Commits (newest first)

| Commit | Description |
|--------|-------------|
| `02a90fa` | refactor(sync): remove unused findLocalPromptId method |
| `df6da59` | refactor(sync): define constant for sync_conflict_retry error code |
| `c1a2476` | docs(sync): document DELETE-MODIFY conflict resolution design decision |
| `617105b` | fix(sync): improve race condition handling for web-created prompts |
| `67edaa8` | perf(sync): optimize findLocalPromptId with O(1) map lookup |
| `04c4615` | fix(sync): add null safety clarification and non-null assertion |
| `e316cb7` | fix(sync): use cloud IDs for duplicate detection in Phase 6 |
| `88868d9` | feat(sync): add workspace registration for bi-directional sync |

#### Key Changes in `syncState.ts`

1. Updated `RemotePrompt.local_id` type: `string` → `string | null`
2. Added `toAssignLocalId` to `SyncPlan` (Phase 5: web-created prompts)
3. Added `toDeleteLocally` to `SyncPlan` (Phase 6: web deletions)

#### Key Changes in `syncService.ts`

1. **Phase 5 - Web-Created Prompts**:
   - Detect prompts with `workspace_id` but `local_id = NULL`
   - Generate `local_id`, download locally, upload back to set `local_id` in cloud
   - Improved race condition handling with retry logic

2. **Phase 6 - Web Deletions**:
   - Pass `includeDeleted=true` to `fetchRemotePrompts()`
   - Detect soft-deleted prompts (`deleted_at` not null)
   - Delete locally and mark as deleted in sync state
   - DELETE-MODIFY conflict: always keeps local version (prevents data loss)

3. **Performance Optimization**:
   - O(1) lookup via `cloudIdToLocalId` reverse map (was O(n²))
   - Cloud ID deduplication using `cloudIdsQueuedForUpload` Set

4. **Code Quality**:
   - Added `SYNC_ERROR_CODES` constant
   - Documented DELETE-MODIFY design decision in code comments

#### CI/CD Results

- ✅ TypeScript compilation passed
- ✅ ESLint passed (warnings only, no errors)
- ✅ Prettier formatting fixed
- ✅ All 177 tests passed
- ✅ Build succeeded

---

### Still Missing (Not Yet Implemented)

#### Database (Supabase)

- [ ] Create `workspaces` table migration
- [ ] Add RLS policies for workspaces table

#### Backend - New Edge Functions (promptbank-website)

- [ ] `register-workspace/index.ts` - Upsert workspace on sync
- [ ] `get-user-workspaces/index.ts` - List user's workspaces for web UI

#### Backend - Existing Edge Functions

- [ ] `sync-prompt/index.ts:162` - Add `workspace_id` to UPDATE query

#### Website (promptbank-website)

- [ ] `lib/validations/prompt.ts` - Add `workspaceId` to form schema
- [ ] `components/prompts/prompt-form.tsx` - Add workspace selector dropdown
- [ ] Prompt pages - Fetch and display workspaces

---

### Required Testing

#### Manual Test Scenarios (Before Merging PR)

1. **Web-created prompt sync**:
   - Create prompt on web UI with workspace selected
   - Run sync in VS Code extension
   - Verify: prompt appears locally with generated ID
   - Verify: Supabase `local_id` is now set

2. **Web deletion sync**:
   - Create prompt in extension, sync to cloud
   - Delete prompt via web UI (soft-delete)
   - Run sync in extension
   - Verify: prompt removed from local `prompts.json`
   - Verify: sync-state.json shows `isDeleted: true`

3. **DELETE-MODIFY conflict**:
   - Create prompt in extension, sync to cloud
   - Delete on web
   - Modify locally before syncing
   - Run sync
   - Verify: local version preserved and re-uploaded (not deleted)

4. **Normal sync still works**:
   - Create/edit/delete prompts locally
   - Sync to cloud
   - Verify: all operations work as before

#### Supabase Queries for Verification

```sql
-- Check web-created prompt has local_id after sync
SELECT cloud_id, local_id, title, workspace_id
FROM prompts
WHERE workspace_id IS NOT NULL
  AND local_id IS NOT NULL;

-- Check soft-deleted prompts
SELECT cloud_id, title, deleted_at, deleted_by_device_id
FROM prompts
WHERE deleted_at IS NOT NULL;

-- Verify no orphaned prompts (deleted remotely but local_id exists)
SELECT cloud_id, local_id, title, deleted_at
FROM prompts
WHERE deleted_at IS NOT NULL
  AND local_id IS NOT NULL;
```

---

### Next Steps

1. **Merge PR #72** after manual testing passes
2. **Database**: Create `workspaces` table migration in Supabase
3. **Backend**: Implement `register-workspace` and `get-user-workspaces` Edge Functions
4. **Extension**: Add workspace registration call in `performSync()`
5. **Website**: Add workspace selector UI to prompt form
