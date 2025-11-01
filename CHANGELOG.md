# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

## [0.7.0] - TBD

### ✨ Features

- **sync:** ✨ add complete deletion support with soft-delete and restore
  - Deleted prompts tracked across all synced devices
  - 30-day retention period before permanent removal
  - Automatic server-side garbage collection runs daily at 2 AM UTC
  - Delete-modify conflict resolution (modified version always preserved)

### 🔄 Changed

- **Sync Algorithm**: Enhanced three-way merge to handle deletion tracking
  - Detects locally deleted prompts and propagates deletions to cloud
  - Filters out soft-deleted prompts from remote sync
  - Preserves tombstone records to prevent re-downloading deleted prompts
- **Database Schema**: Extended user_prompts table with deletion tracking columns
  - Added `deleted_at` timestamp for soft-delete tracking
  - Added `deleted_by_device_id` for tracking which device initiated deletion
  - Updated quota triggers to exclude soft-deleted prompts from limits
  - Created indexes for efficient deleted prompt queries

### 🐛 Bug Fixes

- **Deletion Sync Bug**: Previously deleted prompts would incorrectly re-download after sync
- **Tombstone Tracking**: Proper tracking prevents deleted prompts from being treated as new

### 📊 Technical Details

- **4 New Edge Functions**: delete-prompt, restore-prompt, gc-deleted-prompts, get-user-prompts (updated)
- **Schema Version**: Sync state now includes schema version for future migrations
- **Quota Accuracy**: Soft-deleted prompts don't count toward 1,000 prompt limit
- **Conflict Resolution**: Modified prompts always take precedence over deletions
- **Data Models**: Extended PromptSyncInfo with isDeleted/deletedAt, SyncPlan with toDelete, SyncStats with deleted count

---

### [0.6.1](https://github.com/ShaulAb/prompt-bank/compare/v0.6.0...v0.6.1) (2025-09-27)

### ✨ Features

- **ci:** ✨ implement automated version bumping with standard-version ([e19e376](https://github.com/ShaulAb/prompt-bank/commit/e19e3763d67a4a350a03ce9bc99758c163e320b5)), closes [#24](https://github.com/ShaulAb/prompt-bank/issues/24)
- **ci:** ✨ implement manual release control for safer publishing ([d073083](https://github.com/ShaulAb/prompt-bank/commit/d073083149c93c07f65eacbaf15176c477469279))
- consolidate workflows into single dev-centered release process ([b4b2d67](https://github.com/ShaulAb/prompt-bank/commit/b4b2d6782b25a30b7409d5717e3ecbd543b0d5cf))

### 📝 Documentation

- ✨ update CI/CD documentation for simplified workflow ([3879f2f](https://github.com/ShaulAb/prompt-bank/commit/3879f2f654d0999e4d445bfeefd2e936335078e0))
- **workflow:** 📝 document automated version bumping system ([2309828](https://github.com/ShaulAb/prompt-bank/commit/23098284c425ec411702c5402d9b393ef4f49eb9)), closes [#24](https://github.com/ShaulAb/prompt-bank/issues/24)

### 🐛 Bug Fixes

- **ci:** 🔧 implement dev-centered release workflow ([572ca44](https://github.com/ShaulAb/prompt-bank/commit/572ca44aa8562a71d1339a996c48848c4656ba22))
- configure git identity before standard-version runs ([baec9dd](https://github.com/ShaulAb/prompt-bank/commit/baec9dd5e112b4b4b112b6835c2f8084b7b50d14))
- **lint:** 🔧 resolve all ESLint warnings ([cea39e0](https://github.com/ShaulAb/prompt-bank/commit/cea39e0ed918f5312a025044026ebcd6ead25d07))
- **types:** 🔧 resolve TypeScript errors while preserving all user workflows ([4c5a0d9](https://github.com/ShaulAb/prompt-bank/commit/4c5a0d93bb2be612fafb44c225e354d4ff90dc4f))

## [0.6.1] - 2025-09-21

### Added

- **E2E Authentication Testing**: Comprehensive OAuth flow testing with MSW (Mock Service Worker)
  - 7 test scenarios covering full OAuth lifecycle, token refresh, PKCE validation
  - Network-level mocking for isolated testing without external dependencies
  - VS Code Extension Host compatibility for realistic testing environment
- **MSW Testing Infrastructure**: Modern testing approach replacing custom OAuth providers
  - Zero dependency on external test users or Supabase test instances

### Changed

- **CI/CD Pipeline Simplification**: Streamlined from 4 workflows to 2
  - Reduced CI duration
  - Unified main.yml workflow for all standard CI checks (TypeScript, lint, test, build)
  - Dedicated release.yml workflow for marketplace deployment with manual triggers
- **Testing Architecture**: Migrated from custom OAuth provider to MSW
  - Removed dependencies: @types/glob, @types/mocha, glob, mocha (600+ KB)
  - Added msw dependency (200 KB) for testing capabilities

### Removed

- **Over-engineered CI Workflows**: Eliminated redundant and complex automation
  - Removed ci.yml, code-quality.yml, dependency-updates.yml workflows
  - Consolidated functionality into streamlined, maintainable workflows

### Technical Details

- **Test Coverage**: 67 tests passing with comprehensive E2E authentication scenarios
- **Bundle Impact**: Maintained 40.4kb minified size despite adding robust testing infrastructure
- **Developer Experience**: Significantly improved with faster CI feedback and reliable local testing

## [0.6.0] - 2025-09-20

### Added

- **Save from Selection Context Menu**: New right-click context menu item "Save Selection as Prompt" in the editor
- **WebView Performance Optimizations**: Caching system for faster prompt editor loading
  - HTML template caching to avoid repeated file I/O
  - Categories caching with 1-minute expiration
  - DNS prefetching for CDN resources
- **Inline Category Creation**: Improved UX for creating new categories directly in the form
- **Enhanced Test Coverage**: Comprehensive tests for new features (60 tests passing)

### Changed

- **Command Visibility**: `savePromptFromSelection` command is now hidden from command palette (context menu only)
- **WebView Editor**: Supports both create and edit modes with prefilled content
- **Category Management**: Inline category creation replaces command palette interruption
- **Default Categories**: Always shows at least "General" category when none exist

### Fixed

- **Google OAuth Authentication**: Resolved extension ID mismatch preventing OAuth callbacks
  - Updated Supabase Site URL configuration from old publisher ID to current
  - Updated Supabase anon key to latest version
- **Category System Issues**: Fixed empty dropdown and validation problems
  - Prevents saving prompts with empty categories
  - Keyboard support (Enter/Escape) for category input
  - Prevents duplicate categories
- **TypeScript Errors**: Fixed type checking issues in authService and promptService
  - Added proper type annotations for Supabase API responses
  - Removed unused variables
- **Code Quality**: Applied consistent formatting and fixed ESLint configuration

## [0.5.5] - 2025-07-22

### Added

- **Sharing Functionality**: Share individual prompts and entire collections via public links
- **Import Functionality**: Import prompts and collections from shared links
- **Category Management**: Create, rename, and organize prompts into categories
- **Drag & Drop**: Reorder categories and prompts with intuitive drag & drop interface
- **Tree View**: Hierarchical display of prompts organized by categories
- **Context Menus**: Right-click actions for all prompt operations
- **Search**: Find prompts quickly with integrated search functionality
- **Webview Editor**: Modern Lit-based editor for creating and editing prompts
- **Authentication**: GitHub OAuth integration for sharing features
- **Persistence**: All data persists across VS Code sessions
- **Empty State**: Helpful guidance when no prompts exist

### Changed

- **UI/UX**: Complete visual overhaul with modern, professional styling
- **Architecture**: Refactored to use storage provider pattern for better maintainability
- **Category Handling**: Centralized category management through `getAllCategories()` method

### Fixed

- **Security**: Removed debug logging that exposed JWT tokens in terminal output
- **Command Registration**: Fixed missing `promptBank.shareCollection` command registration
- **Type Safety**: Improved TypeScript types for sharing functionality
- **Error Handling**: Enhanced error handling throughout the extension

### Technical Details

- **Storage**: File-based JSON storage with atomic operations
- **Webview**: LitElement-based editor with VS Code theme integration
- **Testing**: Comprehensive test suite with 32 passing tests
- **Bundle Size**: Optimized extension bundle at 32.4kb
- **Compatibility**: Supports VS Code 1.99.0 and later

---

## Previous Test Versions

### [0.5.3 - 0.5.4] - Test Releases

These versions were used for testing and development purposes. Version 0.5.5 represents the first production-ready release with all core features implemented and tested.

---

### Added

- **Contribution Documentation**: Comprehensive CONTRIBUTING.md with development setup, coding guidelines, and PR process

### Changed

- **Keyboard Shortcuts**: Updated to avoid conflicts with Cursor built-ins
  - Save Prompt: `Ctrl+Alt+P` (Mac: `Cmd+Alt+P`)
  - Insert Prompt: `Ctrl+Alt+I` (Mac: `Cmd+Alt+I`)

### Planned

- Template variables support
- Improved import UX
- Cloud sync

[0.5.5]: https://github.com/ShaulAb/prompt-bank/releases/tag/v0.5.5
