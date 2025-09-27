# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Prompt Bank is a VS Code extension for managing, reusing, and sharing AI prompts. It provides a tree view in the explorer sidebar where users can save prompts organized by categories, and features drag-and-drop support, cloud sharing via GitHub OAuth, and a modern webview editor interface.

### Latest Status (dev branch - September 21, 2025)
**Status**: ✅ All features merged to dev, ready for v0.6.1 release

**Testing Infrastructure**: ✅ COMPLETE
- ✅ Migrated from custom OAuth provider to MSW (Mock Service Worker)
- ✅ Achieved 80% code reduction (800+ lines → 200 lines)
- ✅ Comprehensive E2E authentication testing: 67 tests passing
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

### Recent Improvements (September 21, 2025 Session)

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

## Testing Approach

Uses Vitest with behavior-based testing. Tests are isolated per feature (create, update, delete, etc.) in separate files under `test/` directory.

## TypeScript Configuration

- Strict mode enabled with all strict checks
- Target ES2022, CommonJS modules
- Source maps enabled for debugging
- Path alias `@/*` maps to `src/*`

## Recent Achievements

### Feature Development
- Successfully implemented "Save Selection as Prompt" context menu feature
- Enhanced WebView editor with performance optimizations and caching
- Fixed category management with inline creation and validation
- Resolved Google OAuth authentication end-to-end
- Fixed cross-editor URI scheme compatibility using official VS Code API

### Code Quality
- Achieved 100% test pass rate (60 tests passing, 9 intentionally skipped)
- Fixed all TypeScript compilation errors and applied consistent formatting
- Optimized WebView loading performance with caching system
- Bundle size: 39.8kb minified

### Documentation
- Updated README.md, CHANGELOG.md with latest features
- Maintained comprehensive CONTRIBUTING.md guide
- Enhanced inline code documentation

## Version Management & Release Process

### Manual Release Control (Implemented)
The project uses **standard-version** for semantic versioning with manual publishing control:

1. **Commit Convention Impact**:
   - `fix:` commits → Patch version (0.0.x)
   - `feat:` commits → Minor version (0.x.0)
   - `BREAKING CHANGE:` → Major version (x.0.0)

2. **Release Workflows**:
   - **version-bump.yml**: Manual trigger for version bumps, creates PR with changelog
   - **release.yml**: Creates GitHub release with VSIX for manual testing/publishing

3. **How to Release**:
   ```bash
   # Local testing
   npm run release:dry-run  # Preview what will change

   # GitHub Actions (Recommended)
   # 1. Go to Actions tab → "Version Bump" workflow
   # 2. Select version type (auto/patch/minor/major)
   # 3. Review and merge the created PR
   # 4. Use "Release" workflow to create GitHub release with VSIX
   # 5. Download VSIX, test locally, then publish manually
   ```

4. **Manual Publishing Process**:
   ```bash
   # After testing the VSIX file locally:
   vsce publish  # Publishes to VS Code Marketplace
   # Optional: npx ovsx publish --pat <token>  # Publish to Open VSX
   ```

5. **Important**: The system uses `.versionrc.json` configuration that recognizes emoji commits. DO NOT modify version numbers manually in package.json - always use the release scripts or workflows.

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