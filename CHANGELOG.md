# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

### [0.6.2](https://github.com/ShaulAb/prompt-bank/compare/v0.6.1...v0.6.2) (2025-11-03)

### 👷 CI/CD

- ✨ add automated marketplace publishing workflow ([854a0d0](https://github.com/ShaulAb/prompt-bank/commit/854a0d04718e9818e4e7588e15fecf14fd9047eb))

### 🐛 Bug Fixes

- **sync:** 🐛 remove unused variables to pass TypeScript checks ([8ddbca4](https://github.com/ShaulAb/prompt-bank/commit/8ddbca45f782b64a3894672818491ed90b198adc))

### ✨ Features

- **auth:** ✨ migrate to JWKS-based JWT verification with ECC P-256 ([7af93a9](https://github.com/ShaulAb/prompt-bank/commit/7af93a9c4d235b1b7b264dac4284f130e076c3e6))
- **sync:** ✨ add complete deletion support with soft-delete and restore ([870053c](https://github.com/ShaulAb/prompt-bank/commit/870053cbf0360e4b4bb031ca10fb292d2ec3dbbd))
- **sync:** ✨ add sync state models and storage infrastructure ([f4724eb](https://github.com/ShaulAb/prompt-bank/commit/f4724eb0479eec194bc4bbc9ac360d8971e16357))
- **sync:** ✨ implement SyncService with three-way merge algorithm ([84a0d5f](https://github.com/ShaulAb/prompt-bank/commit/84a0d5fb1fc44e8559b8fe2e1b5309a8ef15a546))
- **sync:** add Supabase API integration to SyncService ([e5b5af0](https://github.com/ShaulAb/prompt-bank/commit/e5b5af08c75c1bf3f80eec316fa5385c020a66ed))
- **sync:** add sync UI commands and VS Code integration ([e334fad](https://github.com/ShaulAb/prompt-bank/commit/e334faddb78b31ad7ed4eb26c02f08db0ed80598))

### ✅ Tests

- 🧪 fix JWKS verification test infrastructure issues ([489c52a](https://github.com/ShaulAb/prompt-bank/commit/489c52ae0ed0f183f358e1d6b8726ab389746084))

### 🔧 Chores

- 🔧 remove committed VSIX files and add to .gitignore ([456cc7a](https://github.com/ShaulAb/prompt-bank/commit/456cc7a18ed1d1bbcc7d93f1f7c39950d6403ace))
- 🧹 remove debug script from tracking ([d61227e](https://github.com/ShaulAb/prompt-bank/commit/d61227e9d01f9f0569a2433c799f2fbf2b5ac890))
- 🧹 remove unused WebView HTML files ([a1632dd](https://github.com/ShaulAb/prompt-bank/commit/a1632dd6cc6738a9ee5a5eb4aada8c47fd91a1f3))

### 💄 Styles

- 💄 apply prettier formatting to modified files ([2e72516](https://github.com/ShaulAb/prompt-bank/commit/2e7251648e2d766495711ae009475046bf7a8139))
- 💄 fix ESLint warnings (reduce from 28 to 24) ([f87091a](https://github.com/ShaulAb/prompt-bank/commit/f87091aabd977ab90ec9c87a4353a982c2e1aab6))

### ♻️ Code Refactoring

- 🔧 replace all 'any' types with proper type definitions ([7dcf095](https://github.com/ShaulAb/prompt-bank/commit/7dcf0952edb0f943cc894a9d87961fa3b3893106))
- **auth:** 🔧 improve JWKS verification error handling and token lifecycle ([958ac1d](https://github.com/ShaulAb/prompt-bank/commit/958ac1dcf1d1cde6212965af80a6e122a8117e66))
- **sync:** add Supabase JS client singleton ([45fb82f](https://github.com/ShaulAb/prompt-bank/commit/45fb82fbe6b245fa707a967e2264dbd1bf2a118f))
- **sync:** migrate SyncService to use Supabase JS client ([507b3a9](https://github.com/ShaulAb/prompt-bank/commit/507b3a91bcb0aa12b84ac29e018cd3838cb1cf7e))

### 📝 Documentation

- 📝 consolidate TEST_PLAN.md and TESTING.md into single guide ([9915d8f](https://github.com/ShaulAb/prompt-bank/commit/9915d8f2990d2e56c9904e84ca2426b37363af3a))
- 📝 expand sync feature documentation in README ([7d44026](https://github.com/ShaulAb/prompt-bank/commit/7d44026a6e04d59214d425977998023690a340a9))
- 📝 update authentication documentation and testing guides ([2911c7a](https://github.com/ShaulAb/prompt-bank/commit/2911c7a832342ba1879e2b32597593c919312d61))
- 📝 update CI/CD documentation for automated publishing ([bd773ec](https://github.com/ShaulAb/prompt-bank/commit/bd773ecbc913c743f4f4b9cb13e296311197c2a8))
- 📝 update documentation for sync deletion support ([582882a](https://github.com/ShaulAb/prompt-bank/commit/582882ae8dd645e22fbf3767d62452e543ba7cb2))
- 📝 update documentation for v0.7.0 release preparation ([e6f27fd](https://github.com/ShaulAb/prompt-bank/commit/e6f27fdf5fbabb9734e5bd6fc716aaaea9da962c))
- 📝 update TESTING.md to reflect all tests passing ([1cffce1](https://github.com/ShaulAb/prompt-bank/commit/1cffce15f79e90727ce1a0760c0424e174ed2630))
- **sync:** 📝 add comprehensive specification for personal sync feature ([b89bd29](https://github.com/ShaulAb/prompt-bank/commit/b89bd29659bd1d3a8701501009fcad7e04ef40cd))
- **sync:** add comprehensive sync feature documentation ([18e2af2](https://github.com/ShaulAb/prompt-bank/commit/18e2af22773c8d2237e46b17bb52624ec5ba046d))

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
