# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Prompt Bank is a VS Code extension for managing, reusing, and sharing AI prompts. It provides a tree view in the explorer sidebar where users can save prompts organized by categories, and features drag-and-drop support, cloud sharing via GitHub OAuth, and a modern webview editor interface.

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
- Key commands: `savePrompt`, `insertPrompt`, `listPrompts`, `importPrompt`, `shareCollection`

## Key Patterns

1. **Prompt Content Source**: The extension can capture prompts from either editor selection or clipboard (fallback), implemented in `PromptService.getPromptContent()`

2. **Conflict Resolution**: When importing prompts, automatic conflict resolution handles duplicate titles by appending numbers

3. **Tree View Updates**: After any data modification, call `treeProvider.refresh()` to update the UI

4. **WebView Communication**: Uses message passing between extension and WebView for prompt editing

5. **Authentication Flow**: Uses VS Code URI handler for GitHub OAuth callback, stores tokens securely in VS Code secrets

## Testing Approach

Uses Vitest with behavior-based testing. Tests are isolated per feature (create, update, delete, etc.) in separate files under `test/` directory.

## TypeScript Configuration

- Strict mode enabled with all strict checks
- Target ES2022, CommonJS modules
- Source maps enabled for debugging
- Path alias `@/*` maps to `src/*`