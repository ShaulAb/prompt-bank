# TODO: Remove Tags Support from Prompts

## Overview
Removing 'tags' support from prompts since Title, Description, and Category provide sufficient organization. This functionality was never exposed to the UI, so there are no UX changes required.

## Tasks

### 1. Core Model Changes
- [ ] **src/models/prompt.ts**
  - [ ] Remove `tags: string[]` property from `Prompt` interface (line 23)
  - [ ] Remove `tags` parameter from `createPrompt` function (line 90)
  - [ ] Remove tags-related code in createPrompt function body (line 98)
  - [ ] Update JSDoc comments that reference tags (line 22)

### 2. Storage Layer Changes
- [ ] **src/storage/interfaces.ts**
  - [ ] Remove `tags?: string[]` from `PromptFilter` interface (line 61)
  - [ ] Update JSDoc comment about tag filtering (line 60)

- [ ] **src/storage/fileStorage.ts**
  - [ ] Remove tag filtering logic in `list()` method (lines 103-104)

### 3. Service Layer Changes
- [ ] **src/services/promptService.ts**
  - [ ] Remove tag handling in `duplicatePrompt()` method (line 266)
  - [ ] Remove tag handling in `importPrompts()` method (lines 340, 343)
  - [ ] Remove tag handling in `updatePrompt()` method (line 395)

### 4. View Layer Changes
- [ ] **src/views/promptTreeItem.ts**
  - [ ] Remove tag display logic in tooltip (lines 57-58)
  - [ ] Remove tag display in tree item label (lines 71-72)

- [ ] **src/webview/PromptEditorPanel.ts**
  - [ ] Remove `tags: this.promptData.tags` from webview message (line 126)

### 5. Test Updates
- [ ] **test/create-prompt.test.ts**
  - [ ] Remove tags parameter from `createPrompt` call (line 9)
  - [ ] Verify test still passes without tags

- [ ] **test/update-prompt.test.ts**
  - [ ] Remove tags parameter from `createPrompt` call (line 24)
  - [ ] Verify test still passes without tags

### 6. Data Migration (if needed)
- [ ] Consider if existing stored prompts with tags need migration
- [ ] Existing prompts should continue to work (tags will just be ignored)
- [ ] No explicit migration needed since tags were never user-facing

### 7. Validation & Testing
- [ ] Run all existing tests to ensure they pass
- [ ] Test prompt creation without tags
- [ ] Test prompt filtering without tag filtering
- [ ] Test prompt display without tag information
- [ ] Verify no broken references to tags remain

### 8. Documentation Updates
- [ ] Update any internal documentation that mentions tags
- [ ] Verify README or other docs don't reference tag functionality

## Implementation Notes

1. **Backward Compatibility**: Since tags were never exposed in the UI, removing them should not break any user workflows.

2. **Storage**: Existing prompts with tags in storage will simply have their tags ignored - no data corruption risk.

3. **Test Coverage**: Most tests already work without tags, only 2 test files need minimal updates.

4. **Safe Removal**: This is a safe refactoring since:
   - Tags were never user-facing
   - No UI components depend on tags
   - Filtering by tags was not exposed
   - The core functionality (title, description, category) remains intact

## Verification Checklist
- [ ] All tests pass
- [ ] No compilation errors
- [ ] Prompt creation works
- [ ] Prompt editing works
- [ ] Prompt filtering works (by category, search, etc.)
- [ ] Tree view displays correctly
- [ ] No runtime errors related to missing tag properties