# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Prompt Bank is a VS Code extension for managing, reusing, and sharing AI prompts. It provides a tree view in the explorer sidebar where users can save prompts organized by categories, and features drag-and-drop support, cloud sharing via GitHub OAuth, and a modern webview editor interface.

### Latest Status (feature/simplify-save-prompt-flow branch)
**Core Features**: ✅ COMPLETE - Ready for PR
- ✅ Added right-click context menu item "Save Selection as Prompt" in the editor
- ✅ Improved UX: Users can now select text → right-click → save as prompt with prefilled content
- ✅ WebView modal now supports both create and edit modes
- ✅ Command is hidden from command palette (context menu only)
- ✅ Handles multiple selections gracefully (uses first, notifies user)
- ✅ Comprehensive test coverage: 60 tests passing (9 skipped due to static method limitations)
- ✅ All quality checks passing: Tests, Formatting, Type checking, Build
- ✅ Documentation updated: README.md and CHANGELOG.md

**Authentication for Sharing**: 🔄 IN PROGRESS - OAuth callback issue
- ✅ Google OAuth implementation complete (AuthService + ShareService)
- ✅ Supabase Edge Functions updated for JWT validation
- ✅ Extension builds and packages successfully
- ❌ VS Code URI callback failing due to extension ID mismatch

### 🚀 Authentication Flow Update (January 30, 2025)
**Status**: ✅ RESOLVED - Switched to Google OAuth for simpler authentication

#### Previous Challenge:
- Device Code Flow implementation hit JWT verification limitations in Supabase Edge Functions
- All Edge Functions require real JWT tokens, blocking custom authentication methods

#### New Solution: Google OAuth
1. **AuthService**: Completely rewritten to use Google OAuth with PKCE flow
2. **ShareService**: Updated to use proper Supabase JWT tokens from Google OAuth
3. **Edge Functions**: Updated create-share function to validate Google OAuth JWT tokens
4. **Benefits**:
   - ✅ Minimal friction - users likely already have Google accounts
   - ✅ Native Supabase support - no custom JWT workarounds needed
   - ✅ Proper JWT tokens work seamlessly with all Edge Functions
   - ✅ Token refresh mechanism for long-lived sessions

#### Implementation Details:
- **OAuth Flow**: Using Supabase's built-in Google provider with PKCE for security
- **Token Storage**: Access tokens, refresh tokens, and user info stored in VS Code secrets
- **User Experience**: One-click Google sign-in opens browser, returns to VS Code automatically
- **Share Function**: Works with standard Supabase JWT validation

#### Files Modified:
- `src/services/authService.ts`: Complete rewrite for Google OAuth with PKCE
- `src/services/shareService.ts`: Updated to use JWT tokens with proper headers
- Edge Function `create-share`: Updated to validate Google OAuth tokens
- Removed: `src/services/deviceAuthService.ts` (no longer needed)

#### Current Status (February 13, 2025):
**Problem**: Google OAuth authentication callback still failing with extension ID mismatch
- ✅ Google OAuth configured in Supabase Dashboard
- ✅ User successfully authenticates with Google and gives consent
- ✅ Google redirects back to VS Code URI (`vscode://prestissimo.prompt-bank/auth-callback`)
- ❌ VS Code shows error: "The extension 'ShaulAbergil.prompt-bank' cannot be installed because it was not found"

#### Debugging Attempts This Session:
1. **Cleared All VS Code Cache** (Feb 13):
   - Uninstalled extension completely
   - Removed from `~/.vscode/extensions/`
   - Cleared cached VSIX files from `~/.config/Code/CachedExtensionVSIXs/`
   - Cleared storage directories (`~/.vscode-prompt-bank`, `.vscode/prompt-bank`)
   - Reinstalled fresh from VSIX
   - **Result**: Same error persists - issue not related to caching

2. **Verified Extension Configuration**:
   - `package.json` correctly shows `"publisher": "prestissimo"` and `"name": "prompt-bank"`
   - Extension correctly generates `prestissimo.prompt-bank` as ID
   - AuthService correctly builds redirect URI as `vscode://prestissimo.prompt-bank/auth-callback`

3. **Implemented Localhost Callback Alternative**:
   - Created `authServiceLocalhost.ts` with HTTP server callback (ports 3000-8082)
   - Uses `http://localhost:PORT/auth/callback` to avoid VS Code URI issues
   - Handles OAuth flow in browser with auto-close on success
   - **Status**: Implementation complete but not yet integrated

#### Root Cause Analysis:
- The error message mentioning `ShaulAbergil.prompt-bank` suggests either:
  1. Supabase OAuth configuration has hardcoded redirect URI with old publisher ID
  2. The extension was previously published under `ShaulAbergil` and something is cached server-side
  3. There's a redirect/rewrite happening somewhere in the OAuth flow

#### Next Session Priorities:
1. **Check Supabase Dashboard OAuth Settings**:
   - Login to Supabase Dashboard
   - Navigate to Authentication > Providers > Google
   - Check if redirect URIs are hardcoded there
   - Update any references to `ShaulAbergil` to `prestissimo`

2. **Test Localhost Authentication**:
   - Swap `authService.ts` with `authServiceLocalhost.ts` 
   - Update imports in extension.ts
   - Test full OAuth flow with localhost callback

3. **Alternative Solutions if Still Blocked**:
   - Implement manual token entry (user copies token from browser)
   - Use VS Code's built-in authentication API
   - Consider publishing under original `ShaulAbergil` publisher ID

4. **Create PR for Save Selection Feature**:
   - Feature is complete and tested (60 tests passing)
   - Ready to merge to master branch
   - Can be done independently of auth fix

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
- **AuthService** (`src/services/authService.ts`): GitHub OAuth authentication for sharing features
- **ShareService** (`src/services/shareService.ts`): Handles creating and fetching shared prompts via Supabase backend

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

7. **Authentication Flow**: Uses VS Code URI handler for GitHub OAuth callback, stores tokens securely in VS Code secrets

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
- Enhanced WebView editor to support both create and edit modes
- Added `savePromptDirectly` method for programmatic prompt saving

### Code Quality
- Achieved 100% test pass rate (60 tests passing, 9 intentionally skipped)
- Fixed all TypeScript compilation errors
- Formatted entire codebase with Prettier
- Optimized bundle size to 34.3kb minified

### Documentation
- Updated README.md with new feature descriptions
- Maintained comprehensive CHANGELOG.md
- Created detailed CONTRIBUTING.md guide
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