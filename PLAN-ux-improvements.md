# UX Improvements - Remaining Items

## Deferred (Pending Decision)

### 1. Version History
- **Decision:** Remove from extension, move to website
- **Current state:** Right-click → "View Version History" opens QuickPick
- **Action:** Remove command, update README with note "version management available via website"

### 2. Auto-Sync Investigation
- **Questions to answer:**
  - When does it trigger? (startup, on save, interval?)
  - What happens with no internet connection?
  - How to know what's in-sync vs out-of-sync?
- **Goal:** Improve UX or simplify the feature

### 3. Sync Icon in Tree View
- **Idea:** Show sync status indicator in tree view title bar
- **States:** Spinning (syncing), checkmark (synced), warning (conflict/offline)

### 4. Bulk Operations
- **Decision:** Website-only feature (extension won't support natively)
- **Examples:** Multi-select delete, move, share

## Low Priority

### 5. Category Management
- **Gap:** No dedicated category list view
- **Issue:** Can't manage empty categories
- **Possible solution:** Category management panel or dedicated view

---

*Last updated: 2026-01-01 (after v0.9.1 release)*
