# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

### [0.7.1](https://github.com/ShaulAb/prompt-bank/compare/v0.7.0...v0.7.1) (2025-11-07)

## [0.7.0](https://github.com/ShaulAb/prompt-bank/compare/v0.6.2...v0.7.0) (2025-11-07)

### ⚠ BREAKING CHANGES

- **models:** None - versions array defaults to [] for backward compatibility

### ♻️ Code Refactoring

- **services:** ♻️ add dependency injection container - Phase 1 ([a71ffe7](https://github.com/ShaulAb/prompt-bank/commit/a71ffe798db319118ef13c81065117fba1d21df9))
- **services:** ♻️ complete Phase 3 - migrate to container-based DI ([cd67441](https://github.com/ShaulAb/prompt-bank/commit/cd67441e76ad43a1663e0907e07b6ebd536a02a2))
- **services:** ♻️ remove all backward compatibility code - pure DI architecture ([7dce5cb](https://github.com/ShaulAb/prompt-bank/commit/7dce5cb3a970124af4f99beb93367ffd4c23d5bf))
- **services:** ♻️ transition to constructor-based dependency injection - Phase 2 ([38f4ca6](https://github.com/ShaulAb/prompt-bank/commit/38f4ca6afbc037caa666d9141a27bc29edb1d3cb))
- **services:** 🔧 fix code quality issues after DI migration ([f90dced](https://github.com/ShaulAb/prompt-bank/commit/f90dced8eddb0efd100bd09150fb03a2a65a6f1b))

### ✅ Tests

- ♻️ migrate all tests to dependency injection pattern ([049fbde](https://github.com/ShaulAb/prompt-bank/commit/049fbdeb0be15d34428838df25ef87e56aba4037))
- **setup:** ✅ add machineId to VS Code mock ([659d34e](https://github.com/ShaulAb/prompt-bank/commit/659d34e978eef1a7283a9b596f27d0e71c902028))
- **sync:** ✅ add comprehensive sync feature test infrastructure ([458257f](https://github.com/ShaulAb/prompt-bank/commit/458257f2dd4f6e941ab27aa981dbd175eab69494))
- **sync:** ✨ create ergonomic prompt factory helper ([0f76c64](https://github.com/ShaulAb/prompt-bank/commit/0f76c6433e51f26dac51e73b54dfa058d93e87af))
- **sync:** 🐛 fix singleton state isolation in integration tests ([e3d8606](https://github.com/ShaulAb/prompt-bank/commit/e3d86060ad16c1ee59374616d1fb8bd5312a8fd8))
- **sync:** 🐛 fix test infrastructure issues - 81% pass rate achieved ([3e30c93](https://github.com/ShaulAb/prompt-bank/commit/3e30c930a6d138f94321b1a301ff035d45f5371d))
- **sync:** 🧪 fix service initialization and vscode mocks ([55baa1f](https://github.com/ShaulAb/prompt-bank/commit/55baa1f680416d689d8ce8fb4a9726347904df4a))
- **versioning:** ✅ add comprehensive versioning tests ([6e66d2c](https://github.com/ShaulAb/prompt-bank/commit/6e66d2c55f24feba74c994d87ab79a0a52adbd1d))

### 📝 Documentation

- 📝 update testing documentation and fix typos ([f04b0a5](https://github.com/ShaulAb/prompt-bank/commit/f04b0a535ebe2f385718dc67872a3e65f5910fe9))
- **contributing:** 📝 add Dependency Injection architecture section ([88c4829](https://github.com/ShaulAb/prompt-bank/commit/88c48294536194c4e2118098db4d6aca6ee61c20))
- **readme,testing:** 📝 add prompt versioning documentation ([34cd4a0](https://github.com/ShaulAb/prompt-bank/commit/34cd4a095ae08fd07173dc51cfa765eb7a63eb73))
- **sync:** 📝 update TODO with root cause analysis ([844ea3d](https://github.com/ShaulAb/prompt-bank/commit/844ea3d552562b32e030fed4dbf3c126bf7d4724))
- **tests:** 📝 document remaining work for sync test implementation ([9a07acc](https://github.com/ShaulAb/prompt-bank/commit/9a07acc6e1dd03af590116d81b988693c4f5cea9))

### 🔧 Chores

- massive codebase cleanup - remove dead code and docs ([dd97b14](https://github.com/ShaulAb/prompt-bank/commit/dd97b14766626d2f0942db5b21eb5adac04eb8b7))

### ✨ Features

- **config:** ✨ add versioning configuration settings ([67ec148](https://github.com/ShaulAb/prompt-bank/commit/67ec1485a239b69183f618c6516f75467d8f9209))
- **models:** ✨ add prompt versioning data model ([fadc189](https://github.com/ShaulAb/prompt-bank/commit/fadc1896d9ca49b76df72d36c554a216e868de06))
- **services:** ✨ implement version management in PromptService ([ccb5cd3](https://github.com/ShaulAb/prompt-bank/commit/ccb5cd37c9ca5baadf85b6633c109288e2ee62ba))
- **storage:** ✨ add version persistence support ([bf37c5f](https://github.com/ShaulAb/prompt-bank/commit/bf37c5fc658a95733b885658a5f57af45e5e9afb))
- **sync:** ✨ add intelligent 409 conflict resolution with specific error codes ([5261802](https://github.com/ShaulAb/prompt-bank/commit/5261802a37d06c1ece2b67ba0916700a066fddab))
- **sync:** ✨ add version sync and merge support ([e39ba87](https://github.com/ShaulAb/prompt-bank/commit/e39ba87fee2c1d7ff67857626790801214a86ae6))
- **versioning:** ✨ add version history UI with QuickPick interface ([b9ce0d5](https://github.com/ShaulAb/prompt-bank/commit/b9ce0d5d371644b745ff9b3f92612533cf81a0bc))

### 🐛 Bug Fixes

- **extension:** remove unsafe optional chaining with non-null assertion ([20ee96a](https://github.com/ShaulAb/prompt-bank/commit/20ee96a1754f15a15157a125f027803bbf91b146)), closes [#47](https://github.com/ShaulAb/prompt-bank/issues/47)
- **services:** 🐛 address code review findings - type safety and error handling ([29913da](https://github.com/ShaulAb/prompt-bank/commit/29913dad587b33e69918bab8fc5582cf1f5d465a))
- **sync:** 🐛 correct 409 conflict status code detection ([d9d2fd3](https://github.com/ShaulAb/prompt-bank/commit/d9d2fd31b9af6257bc91ba78e2752621d4d571a6))
- **sync:** 🐛 fix 409 conflict tests and error parsing - all tests passing ([671f0df](https://github.com/ShaulAb/prompt-bank/commit/671f0df5832f5981dec1ace4bf84d8433bcc51cb))
- **sync:** 🐛 resolve 409 conflict loops and corrupted state detection ([975dc57](https://github.com/ShaulAb/prompt-bank/commit/975dc5758fc53588bf4836723d519b98f3ff3c7a))
- **sync:** 🐛 resolve three-way merge detection issues ([33c7abb](https://github.com/ShaulAb/prompt-bank/commit/33c7abbf1eede19f8bfcec77234da3956c856458))
- **versioning:** 🐛 fix TypeScript strictness and code formatting ([50f83e8](https://github.com/ShaulAb/prompt-bank/commit/50f83e8b1db98c08c369c2d8068112567392848e))
- **versioning:** 🐛 replace require() with static imports for ESLint compliance ([19ab201](https://github.com/ShaulAb/prompt-bank/commit/19ab2010b1dc9084fbfa6267ec2b3ce41a99e6f0)), closes [#48](https://github.com/ShaulAb/prompt-bank/issues/48)

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
