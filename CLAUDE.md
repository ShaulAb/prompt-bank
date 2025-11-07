# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Prompt Bank is a VS Code extension for managing, reusing, and sharing AI prompts. It provides a tree view in the explorer sidebar where users can save prompts organized by categories, and features drag-and-drop support, cloud sharing via Google OAuth, and a modern webview editor interface.

### Latest Status (dev branch - November 3, 2025)
**Status**: ✅ Authentication migration complete, ready for release

**Authentication Infrastructure**: ✅ MIGRATED TO ECC P-256
- ✅ Migrated JWT signing from HS256 to ECC P-256 (ES256) with JWKS
- ✅ Industry-standard public key cryptography for enhanced security
- ✅ Automatic token recovery on invalid JWT errors (no manual sign-out)
- ✅ Edge Functions compatible with ES256 tokens
- ✅ Type safety improvements across sync/share services

**Testing Infrastructure**: ✅ COMPLETE
- ✅ Migrated from custom OAuth provider to MSW (Mock Service Worker)
- ✅ Achieved 80% code reduction (800+ lines → 200 lines)
- ✅ Comprehensive E2E authentication testing: 78 tests passing
- ✅ 7 OAuth test scenarios covering full lifecycle including PKCE
- ✅ Zero dependency on external test users or Supabase instances

**CI/CD Pipeline**: ✅ SIMPLIFIED
- ✅ Reduced from 4 complex workflows to 2 streamlined ones
- ✅ CI runtime reduced to ~30 seconds
- ✅ Fixed branch naming issue (develop → dev)
- ✅ Automated testing on all pushes/PRs to dev branch

**Previous Session Features**: ✅ MERGED TO DEV
- ✅ Right-click context menu "Save Selection as Prompt"
- ✅ Optimized WebView with caching for fast loading
- ✅ Fixed category system with inline creation
- ✅ Google OAuth authentication fully operational
- ✅ Sharing functionality working end-to-end

### Recent Improvements (November 3, 2025 Session)

**JWT Migration to ECC P-256**:
- Migrated from symmetric HS256 to asymmetric ES256 (Elliptic Curve) signing
- Implemented JWKS (JSON Web Key Set) endpoint for public key distribution
- Enhanced security: Private keys stay server-side, only public keys distributed
- Automatic token recovery: Extension detects invalid JWTs and prompts re-authentication
- Zero user disruption: Seamless transition with automatic fallback

**Edge Function Updates**:
- Redeployed all 5 Edge Functions for ES256 compatibility
- Fixed `get-user-prompts` to accept both GET and POST methods (was 405 error)
- Disabled `verify_jwt` setting (Supabase's automatic verification incompatible with ES256)
- All functions use manual `auth.getUser()` for proper ES256 validation
- Cross-platform testing confirmed working on Mac and Windows

**Code Quality Improvements**:
- Eliminated all 7 'any' types with proper type definitions
- Added `MetadataJSON` interface for type-safe JSON conversions
- Reduced ESLint warnings from 28 to 17 (39% reduction)
- Fixed unused variable warnings and type assertion issues
- Enhanced error context with proper type checking

### Previous Improvements (September 21, 2025 Session)

**MSW Testing Migration**:
- Replaced 800+ lines of custom OAuth provider with 200 lines of MSW handlers
- Implemented comprehensive E2E authentication testing with 7 scenarios
- Added network-level request mocking for reliable, isolated testing
- Removed dependencies: @types/glob, @types/mocha, glob, mocha (600+ KB)
- Added lightweight msw dependency (200 KB)

**CI/CD Simplification**:
- Consolidated 4 workflows into 2: main.yml (CI) and release.yml (deployment)
- Fixed branch naming configuration (develop → dev)
- Reduced CI runtime from 10-15 minutes to ~30 seconds
- All quality gates automated: TypeScript, linting, testing, building

**Documentation Updates**:
- Updated CHANGELOG.md with v0.6.1 infrastructure improvements
- Refined README.md Contributing section for clarity
- Maintained comprehensive TEST_PLAN.md with MSW approach

## Commands

### Development
```bash
# Install dependencies
npm install

# Build for development (with sourcemap)
npm run build:dev

# Build for production (minified)
npm run build

# Watch mode for development
npm run build:watch

# Run tests
npm run test            # Single run
npm run test:watch      # Watch mode
npm run test:ui         # With UI

# Linting and formatting
npm run lint            # Check ESLint
npm run format          # Format with Prettier

# Version Management (NEW)
npm run release         # Auto-detect version from commits
npm run release:patch   # Force patch bump (0.0.x)
npm run release:minor   # Force minor bump (0.x.0)
npm run release:major   # Force major bump (x.0.0)
npm run release:dry-run # Preview changes without committing

# Package extension
npm run package

# Deploy to VS Code Marketplace
npm run deploy
```

### Testing in VS Code
Press `F5` to launch Extension Development Host for testing changes.

## Architecture

### Core Services
- **PromptService** (`src/services/promptService.ts`): Central business logic for managing prompts, handles CRUD operations and import/export
- **AuthService** (`src/services/authService.ts`): Google OAuth authentication for sharing features via Supabase
- **ShareService** (`src/services/shareService.ts`): Handles creating and fetching shared prompts via Supabase backend
- **WebViewCache** (`src/webview/WebViewCache.ts`): Caching system for WebView HTML and categories

### Storage Layer
- **FileStorageProvider** (`src/storage/fileStorage.ts`): Manages persistence to JSON files with atomic write operations
- Stores in `.vscode/prompt-bank/prompts.json` (workspace) or `~/.vscode-prompt-bank/prompts.json` (global)

### UI Components
- **PromptTreeProvider** (`src/views/promptTreeProvider.ts`): Manages the tree view in sidebar with drag-and-drop support
- **PromptEditorPanel** (`src/webview/PromptEditorPanel.ts`): WebView-based editor for creating/editing prompts

### Command Registration
- Commands are registered in `src/commands/index.ts`, `src/commands/treeCommands.ts`, and `src/commands/contextMenuCommands.ts`
- Key commands: `savePrompt`, `savePromptFromSelection`, `insertPrompt`, `listPrompts`, `importPrompt`, `shareCollection`
- **New**: `savePromptFromSelection` - Right-click context menu command for saving selected text as prompt

## Key Patterns

1. **Prompt Content Source**: The extension can capture prompts from either editor selection or clipboard (fallback), implemented in `PromptService.getPromptContent()`

2. **Context Menu Save Flow**: Right-click on selected text → "Save Selection as Prompt" → Opens WebView modal with prefilled content → User fills metadata → Saves prompt

3. **Direct Save Method**: `PromptService.savePromptDirectly()` allows saving prompts without user dialogs, used by WebView editor

4. **Conflict Resolution**: When importing prompts, automatic conflict resolution handles duplicate titles by appending numbers

5. **Tree View Updates**: After any data modification, call `treeProvider.refresh()` to update the UI

6. **WebView Communication**: Uses message passing between extension and WebView for prompt editing

7. **Authentication Flow**: Uses VS Code URI handler for Google OAuth callback, stores tokens securely in VS Code secrets. URI scheme detection uses `vscode.env.uriScheme` for cross-editor compatibility

8. **WebView Modal Modes**: `PromptEditorPanel` supports both edit mode (for existing prompts) and create mode (for new prompts with optional initial content)

9. **Automatic Token Recovery**: Services detect invalid JWT errors (401 + "invalid jwt" message) and automatically call `AuthService.clearInvalidTokens()`, prompting users to re-authenticate without manual sign-out. Implemented in ShareService and SyncService for seamless recovery from authentication issues.

10. **Commit Conventions**: Use conventional commits with emojis for automatic version management. See CONTRIBUTING.md for detailed guidelines. Examples:
   - `feat(auth): ✨ add OAuth integration` (minor bump)
   - `fix(editor): 🐛 resolve loading issue` (patch bump)
   - `feat(api)!: ✨ redesign storage system` (major bump)

## Testing Approach

Uses Vitest with behavior-based testing. Tests are isolated per feature (create, update, delete, etc.) in separate files under `test/` directory.

## TypeScript Configuration

- Strict mode enabled with all strict checks
- Target ES2022, CommonJS modules
- Source maps enabled for debugging
- Path alias `@/*` maps to `src/*`

## Recent Achievements

### Authentication & Security
- Migrated JWT signing from HS256 to ECC P-256 (ES256) for industry-standard security
- Implemented JWKS endpoint for public key distribution
- Built automatic token recovery system for seamless user experience
- Resolved Edge Function compatibility with ES256 tokens
- Cross-platform authentication verified on Mac and Windows

### Feature Development
- Successfully implemented "Save Selection as Prompt" context menu feature
- Enhanced WebView editor with performance optimizations and caching
- Fixed category management with inline creation and validation
- Resolved Google OAuth authentication end-to-end
- Fixed cross-editor URI scheme compatibility using official VS Code API

### Code Quality
- Achieved 100% test pass rate (78 tests passing, 9 intentionally skipped)
- Eliminated all 'any' types with proper type definitions and interfaces
- Reduced ESLint warnings by 39% (28 → 17)
- Fixed all TypeScript compilation errors and applied consistent formatting
- Optimized WebView loading performance with caching system
- Bundle size: 39.8kb minified

### Documentation
- Updated README.md, CHANGELOG.md with latest features
- Maintained comprehensive CONTRIBUTING.md guide
- Enhanced inline code documentation

## Version Management & Release Process

### Dev-Centered Release Workflow (Consolidated)
The project uses a **single consolidated workflow** with automated version bumping and manual publishing control:

```
Feature Branches → dev → [Version Bump + VSIX] → [Local Test] → dev → main → [Marketplace]
```

#### **Branch Strategy**:
- **Feature branches**: Development of individual features
- **dev branch**: Integration branch where features are merged and releases are prepared
- **main branch**: Stable/released code only, represents what users have

#### **Release Philosophy**:
- **Automated preparation**: Version bumping, changelog generation, VSIX packaging happen on `dev`
- **Quality assurance**: All checks (TypeScript, linting, tests, build) run before packaging
- **Manual verification**: Local testing of VSIX before committing to release
- **Controlled publishing**: Manual marketplace publishing with full oversight

#### **The Release Process**:
1. **Feature Development**: Work in feature branches, PR to dev
2. **Version Release**: Trigger "Version Bump and Release" workflow from dev branch only
3. **Quality Assurance**: Workflow runs all checks automatically
4. **Package Creation**: Creates version bump, changelog, and VSIX package
5. **Dev Update**: Pushes changes back to dev branch with new version tag
6. **GitHub Release**: Creates release with downloadable VSIX for testing
7. **Local Testing**: Download and test VSIX locally: `code --install-extension prompt-bank-x.x.x.vsix`
8. **Main Merge**: If testing passes, merge dev → main manually
9. **Marketplace Publishing**: Manually publish with `vsce publish`

### **Commit Convention Impact**:
- `fix:` commits → Patch version (0.0.x)
- `feat:` commits → Minor version (0.x.0)
- `BREAKING CHANGE:` → Major version (x.0.0)

### **Release Workflow**:
- **version-bump.yml**: Consolidated workflow for version bumps, packaging, and release creation
  - Runs only from dev branch (`if: github.ref == 'refs/heads/dev'`)
  - Includes all quality checks (TypeScript, linting, tests, build)
  - Creates version bump, changelog, VSIX package, and GitHub release
  - No automatic marketplace publishing (manual control)

### **Complete Release Process**:

#### **Step 1: Create Release from Dev**
```bash
# Local testing (optional - preview changes)
npm run release:dry-run  # Preview what will change

# GitHub Actions (Recommended)
# 1. Ensure you're on dev branch with all features merged
# 2. Go to Actions tab → "Version Bump and Release" workflow
# 3. Select version type (auto/patch/minor/major)
# 4. Workflow automatically:
#    - Runs all quality checks
#    - Bumps version and generates changelog
#    - Creates VSIX package
#    - Pushes changes to dev
#    - Creates GitHub release with VSIX
```

#### **Step 2: Local Testing**
```bash
# Download VSIX from GitHub release
code --install-extension prompt-bank-X.X.X.vsix  # Test locally
# Verify all functionality works as expected
```

#### **Step 3: Release to Production**
```bash
# Create PR from dev to main (after successful testing)
gh pr create --base main --head dev --title "Release v0.X.Y"

# After review and merge to main:
vsce publish  # Publish to VS Code Marketplace
# Optional: npx ovsx publish --pat <token>  # Publish to Open VSX
```

### **Benefits of This Workflow**:
- **Safety**: Local testing before committing to release
- **Quality**: PR review for all releases (dev → main)
- **Control**: Manual marketplace publishing timing
- **Clarity**: Clean separation between development and released code
- **History**: Main branch represents actual release history

### **Important Notes**:
- The system uses `.versionrc.json` configuration that recognizes emoji commits
- DO NOT modify version numbers manually in package.json - always use the release scripts or workflows
- Git tags are created on dev during version bump, then pushed to main during release
- All release artifacts (VSIX, changelog) are prepared on dev branch for testing

## Next Steps / Potential Improvements

**Immediate Priority**:
- ~~**Issue #24**: Implement automated version bumping workflow for releases~~ ✅ COMPLETED

**Future Enhancements**:
1. **Template Variables**: Support for template variables in prompts (e.g., `{{selection}}`, `{{clipboard}}`)
2. **Export/Import**: Add JSON/CSV export functionality for backup and sharing
3. **Prompt History**: Track prompt usage history and provide analytics
4. **Keyboard Shortcuts**: Customizable keyboard shortcuts for frequently used prompts
5. **Categories Icons**: Add customizable icons for categories
6. **Search Improvements**: Add fuzzy search and regex support
7. **Prompt Versioning**: Track changes to prompts over time
8. **Team Sharing**: Enhanced sharing features for team collaboration
- to memorize