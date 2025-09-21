# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Prompt Bank is a VS Code extension for managing, reusing, and sharing AI prompts. It provides a tree view in the explorer sidebar where users can save prompts organized by categories, and features drag-and-drop support, cloud sharing via GitHub OAuth, and a modern webview editor interface.

### Latest Status (feature/simplify-save-prompt-flow branch)
**Status**: ✅ COMPLETE - Ready for PR to master

**Core Features**: ✅ COMPLETE
- ✅ Right-click context menu "Save Selection as Prompt"
- ✅ Optimized WebView with caching for fast loading
- ✅ Fixed category system with inline creation
- ✅ WebView supports both create and edit modes
- ✅ Comprehensive test coverage: 60 tests passing (9 skipped)
- ✅ All quality checks passing: Tests, Formatting, TypeScript, Build

**Authentication for Sharing**: ✅ COMPLETE
- ✅ Google OAuth implementation working end-to-end
- ✅ Fixed Supabase Site URL configuration issue
- ✅ Updated API keys and resolved all authentication flows
- ✅ Sharing functionality fully operational

### Recent Improvements (Latest Session)

**Performance Optimizations**:
- Added WebView caching system (`WebViewCache.ts`) for faster loading
- HTML template caching reduces file I/O on subsequent opens
- Categories caching with 1-minute expiration
- DNS prefetching for CDN resources

**Category System Fixes**:
- Fixed empty categories dropdown on first use
- Implemented inline category creation (no more command palette interruption)
- Added keyboard support (Enter/Escape) for category input
- Prevents duplicate and empty categories
- Default "General" category when none exist

**Authentication Resolution**:
- Fixed Supabase Site URL configuration mismatch
- Updated to latest Supabase anon key
- Resolved OAuth callback extension ID issue
- **URI Scheme Detection Fix**: Replaced hacky editor detection with proper `vscode.env.uriScheme` API
- End-to-end sharing functionality now working

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

## Next Steps / Potential Improvements

1. **Template Variables**: Support for template variables in prompts (e.g., `{{selection}}`, `{{clipboard}}`)
2. **Export/Import**: Add JSON/CSV export functionality for backup and sharing
3. **Prompt History**: Track prompt usage history and provide analytics
4. **Keyboard Shortcuts**: Customizable keyboard shortcuts for frequently used prompts
5. **Categories Icons**: Add customizable icons for categories
6. **Search Improvements**: Add fuzzy search and regex support
7. **Prompt Versioning**: Track changes to prompts over time
8. **Team Sharing**: Enhanced sharing features for team collaboration