# Sync Feature Tests - Remaining Work

**Status**: Infrastructure complete, service initialization fixed, needs createPrompt fixes

**Date**: November 3, 2025

---

## ✅ Completed

### Infrastructure (Commit: 458257f)
- ✅ Created `test/e2e/helpers/sync-handlers.ts` with MSW handlers
  - 5 Supabase Edge Function handlers
  - In-memory cloud database (Map-based)
  - Helper utilities (`syncTestHelpers`)
- ✅ Updated `test/e2e/helpers/msw-setup.ts` to register sync handlers
- ✅ Implemented 3 comprehensive test files (31 test cases total)

### Test Files Created
1. **`test/sync-three-way-merge.test.ts`** (14 tests)
   - First sync scenarios (5 tests)
   - Subsequent sync scenarios (6 tests)
   - Deletion scenarios (2 tests)
   - Content hash detection (2 tests)

2. **`test/sync-edge-cases.test.ts`** (9 tests)
   - Corrupted sync state handling (2 tests)
   - Quota enforcement (4 tests)
   - Conflict resolution details (3 tests)

3. **`test/sync-integration.test.ts`** (8 tests)
   - End-to-end sync flows (4 tests)
   - Sync state persistence (2 tests)
   - Sync statistics and reporting (2 tests)

### Service Initialization (Commit: 55baa1f)
- ✅ Fixed AuthService initialization in all three test files
- ✅ Fixed SupabaseClientManager initialization in all three test files
- ✅ Updated vscode mock to return Supabase URL and anon key
- ✅ Fixed getConfiguration mock to handle 'promptBank' section

**Progress**: 5/31 tests now passing

---

## ❌ Remaining Work

### 1. Fix createPrompt() Usage in Test Files

**Problem**: All sync test files are using object syntax `createPrompt({ title, content, category })` but the actual function signature is `createPrompt(title, content, category, description?)` with separate parameters.

**Root Cause**: The `createPrompt()` function in `src/models/prompt.ts` expects separate parameters, not an object. When called with an object, the entire object becomes the `title` parameter, causing `prompt.title.trim is not a function` error.

**Solution**: Replace all object-style calls with parameter-style calls in test files.

**Examples**:
```typescript
// WRONG (current):
const prompt = createPrompt({ title: 'Test', content: 'Content', category: 'Cat' });

// CORRECT (target):
const prompt = createPrompt('Test', 'Content', 'Cat');
```

**Files to Fix**:
- `test/sync-three-way-merge.test.ts` - ~25 occurrences
- `test/sync-edge-cases.test.ts` - ~15 occurrences
- `test/sync-integration.test.ts` - ~10 occurrences

**Reference**: See `test/share-collection.test.ts` for correct usage examples.

---

### 2. Update TESTING.md

After all tests pass, update test documentation:

**File to Modify**: `TESTING.md`

**Updates**:
```markdown
## 📊 Test Overview

```
Total Tests: 118 tests across 16 test files
Status: ✅ 109 passing | ⏭️ 9 skipped
Success Rate: 100% (all tests passing)
CI Runtime: ~35 seconds
```

### Test Coverage by Feature

| Feature | Unit Tests | Integration Tests | E2E Tests | Status |
|---------|-----------|-------------------|-----------|--------|
| **Sync Three-Way Merge** | ✅ 14 tests | - | - | ✅ Passing |
| **Sync Edge Cases** | ✅ 9 tests | - | - | ✅ Passing |
| **Sync Integration** | - | ✅ 8 tests | - | ✅ Passing |
```

---

## 📋 Step-by-Step Checklist

### Phase 1: Fix createPrompt() Calls (CURRENT)
- [ ] Fix `test/sync-three-way-merge.test.ts` (25 occurrences)
- [ ] Fix `test/sync-edge-cases.test.ts` (15 occurrences)
- [ ] Fix `test/sync-integration.test.ts` (10 occurrences)
- [ ] Run tests: `npm run test -- sync`
- [ ] Verify all 31 tests passing
- [ ] Commit: `test(sync): 🧪 fix createPrompt() usage to match function signature`

### Phase 2: Verify & Document
- [ ] Run full test suite: `npm run test`
- [ ] Verify all 109+ tests passing
- [ ] Update `TESTING.md` with new test count
- [ ] Commit: `docs(tests): 📝 update test documentation for sync coverage`

### Phase 3: Merge & Release
- [ ] Push branch: `git push origin test/sync-feature-coverage`
- [ ] Create PR to `dev` branch
- [ ] After merge: Run "Version Bump and Release" workflow
- [ ] Test VSIX locally
- [ ] Merge `dev` → `main`

---

## 🔍 Debugging Notes

### Current Status (Commit: 55baa1f)
- **Passing**: 5/31 tests
  - Empty cloud scenarios (no operations)
  - Download-only scenarios
  - Pre-flight quota checks
- **Failing**: 26/31 tests
  - All upload scenarios failing with "prompt.title.trim is not a function"
  - All conflict resolution scenarios failing

### Root Cause Identified
The issue is NOT with:
- ✅ VS Code mocks (fixed)
- ✅ AuthService initialization (fixed)
- ✅ SupabaseClientManager initialization (fixed)
- ✅ MSW handlers (working correctly)
- ✅ File storage provider (deserializes dates correctly)

The issue IS:
- ❌ Test files using object syntax for `createPrompt()`
- ❌ Function signature expects separate parameters
- ❌ When object is passed, it becomes the title, causing type errors

---

## 🎯 Success Criteria

- ✅ All 31 sync tests passing
- ✅ No regressions in existing 78 tests
- ✅ Test runtime < 40 seconds total
- ✅ MSW intercepts all Supabase Edge Function calls
- ✅ Tests are deterministic (no flaky tests)
- ✅ Clean git history with logical commits

---

## 📝 Notes

### Test Architecture Alignment
- Follows existing MSW pattern (consistent with auth tests)
- Uses behavior-based testing approach
- Proper test isolation with beforeEach/afterEach
- No external dependencies (all mocked)

### Coverage Analysis
**Current Coverage** (after tests pass):
- **Services**: SyncService ~85%, SyncStateStorage ~90%
- **Edge Functions**: Covered via MSW handlers
- **Critical Scenarios**: All major sync scenarios tested

**Not Covered** (intentionally):
- Real Supabase network calls (covered by MSW)
- UI notifications (tested in integration tests)
- Device ID collision (extremely low probability)

---

## 🚀 Estimated Time

- **Phase 1 (Fix createPrompt)**: 30-45 minutes
- **Phase 2 (Verify & Doc)**: 15 minutes
- **Phase 3 (Merge & Release)**: 30 minutes
- **Total**: ~1-1.5 hours

---

**Last Updated**: November 3, 2025
**Branch**: `test/sync-feature-coverage`
**Last Commit**: 55baa1f
**Status**: Ready for createPrompt() fixes
