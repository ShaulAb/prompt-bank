# Prompt Bank

<p align="center">
  <img src="./assets/logo_3x.png" alt="Prompt Bank Logo" width="150">
</p>

<p align="center">
  <strong>Managing, Reusing and Sharing Prompts Right From Your IDE.</strong>
  <br />
  Enhance your development workflow by saving, searching, and inserting AI prompts instanly.
</p>

<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=prestissimo.prompt-bank"><img src="https://img.shields.io/visual-studio-marketplace/v/prestissimo.prompt-bank?style=for-the-badge&label=VS%20Marketplace&color=blue" alt="VS Marketplace"></a>
  <a href="https://github.com/ShaulAb/prompt-bank/blob/master/LICENSE"><img src="https://img.shields.io/github/license/ShaulAb/prompt-bank?style=for-the-badge&color=green" alt="License"></a>
</p>

---

A powerful VS Code extension to save and manage your frequent prompts for AI assistants, code templates, and development workflows.

<!-- Optional: Add a GIF demo here -->
<!-- <p align="center">
  <img src="link-to-your-demo.gif" alt="Prompt Bank Demo">
</p> -->

## 🚀 Key Features

- **Save Prompts Instantly**: Select any text and save it as a prompt with a title, description, and category using a simple keyboard shortcut (`Ctrl+Alt+P`).
- **Save from Selection**: Right-click selected text in the editor and choose "Save Selection as Prompt" to quickly save with prefilled content.
- **Tree View**: Browse and manage all your prompts in a hierarchical tree view organized by categories. Click any prompt to insert it instantly.
- **Modern Editor**: Create and edit prompts in a clean, two-column webview editor with dynamic category dropdown and inline category creation.
- **Share & Import**: Share individual prompts or entire collections via public links. Import prompts and collections from others with automatic conflict resolution.
- **Multi-Device Sync**: Synchronize prompts across multiple devices with smart conflict detection, deletion tracking, and restore capabilities. Never lose work when editing the same prompt on different machines.
- **Drag & Drop**: Reorder categories and prompts with intuitive drag & drop interface. Move prompts between categories seamlessly.
- **Category Management**: Create, rename, and organize prompts into categories. Categories are automatically managed and sorted.
- **Powerful Search**: Find prompts quickly with integrated search that scans titles, content, descriptions, and categories.
- **Context Menus**: Right-click on any prompt or category for all actions: Edit, Insert, Delete, Share, and Rename Category.
- **Inline Actions**: Use convenient inline icons in the tree view for quick insert and delete operations.
- **Authentication**: Secure Google OAuth integration for sharing and sync features.
- **Prompt Versioning**: Automatic version history for every prompt edit. Restore previous versions, track changes across devices, and never lose work. Configurable strategies (on-save, time-debounce, manual) with automatic pruning to manage storage.
- **Persistence**: All data persists across VS Code sessions with atomic file operations.


## 🎯 Quick Start

1.  **Save a Prompt**:
    - **Option 1**: Select text in your editor OR copy text from anywhere to your clipboard, then press `Ctrl+Alt+P` (or `Cmd+Alt+P` on Mac).
    - **Option 2**: Select text in the editor, right-click, and choose "Save Selection as Prompt" from the context menu.
    - Fill in the details in the prompt editor and save.

2.  **Insert a Prompt**:
    - **From the Sidebar**: Find your prompt in the "Prompt Bank" tree and click it.
    - **With a Shortcut**: Press `Ctrl+Shift+I` (or `Cmd+Shift+I` on Mac) and select a prompt from the list. Start typing to search and filter prompts.

3.  **Manage Prompts**:
    - Right-click any item in the tree view to see all management options.

4. **Share Prompts**:
    - **Single Prompt**: Right-click any prompt and select "Share" to get a public link.
    - **Collection**: Use Command Palette (`Ctrl+Shift+P`) → "Prompt Bank: Share Collection" to share entire categories or the complete prompt bank.

5. **Import Prompts**:
    - Command Palette → "Prompt Bank: Import Prompt" → paste share link.
    - Automatic conflict resolution handles duplicate titles and categories.

6. **Sync Across Devices** (NEW):
    - **First Time Setup**: Sign in with Google OAuth (same account used for sharing).
    - **Three-Way Merge**: Intelligent sync algorithm compares local, remote, and last-synced states to detect changes on all devices.
    - **Manual Sync**: Command Palette → "Prompt Bank: Sync Prompts" to synchronize with cloud.
    - **Auto-Sync**: Enable automatic synchronization in settings (`promptBank.sync.autoSync`) for seamless background syncing.
    - **View Status**: Check sync state with "Prompt Bank: View Sync Status" to see user, device name, and last sync time.
    - **Unlimited Devices**: Sync across as many devices as you need - desktop, laptop, work machine, etc.
    - **Smart Conflict Resolution**:
      - **Modify-Modify**: When the same prompt is edited on multiple devices, both versions are preserved with device names and timestamps for manual review.
      - **Delete-Modify**: When a prompt is deleted on one device but modified on another, the modified version always wins (prevents accidental data loss).
    - **Deletion Support**:
      - Deleted prompts are tracked and synced across all devices with tombstones to prevent re-downloading.
      - Soft-deleted prompts are retained for 30 days before permanent removal.
      - **Restore Capability**: Recover accidentally deleted prompts within the retention period using Edge Functions.
    - **Device Tracking**: Each change tracks which device made it, helping you understand prompt history.
    - **Fresh Start**: Use "Prompt Bank: Clear Sync State" to reset sync metadata if needed.


## 🔧 Commands & Keybindings

| Command                    | Keybinding     | Description                                                       |
| -------------------------- | -------------- | ----------------------------------------------------------------- |
| `promptBank.savePrompt`    | `Ctrl+Alt+P` | Save text from selection or clipboard as a new prompt.        |
| `promptBank.savePromptFromSelection` | Right-click | Save selected text as prompt (editor context menu only).  |
| `promptBank.insertPrompt`  | `Ctrl+Alt+I` | Insert prompt from the collection.                                 |
| `promptBank.listPrompts`   | -              | List all prompts with search and action options.                  |
| `promptBank.importPrompt`  | -              | Import a prompt or collection from a share link.                  |
| `promptBank.shareCollection` | -           | Share a category or the entire collection.                         |
| `promptBank.syncPrompts`   | -              | Manually sync prompts across devices.                             |
| `promptBank.toggleAutoSync` | -             | Enable/disable automatic synchronization.                          |
| `promptBank.viewSyncStatus` | -             | View current sync status (user, device, last sync time).          |
| `promptBank.clearSyncState` | -             | Reset sync metadata for fresh start.                               |
| `promptBank.refreshTree`   | -              | Manually refresh the tree view.                                   |
| **Context Menu Actions**   | (Right-Click)  | `Edit`, `Insert`, `Delete`, `Share`, `Rename Category`.           |

## 📁 Storage

Prompts are stored both locally and in the cloud:

**Local Storage** (atomic file operations):
- **Project-Specific**: `.vscode/prompt-bank/prompts.json` (for prompts tied to the current workspace)
- **Sync State**: `.vscode/prompt-bank/sync-state.json` (tracks sync metadata, deletion tombstones per device)
- **Global**: `~/.vscode-prompt-bank/prompts.json` (as a fallback for prompts available everywhere)
- **Data Format**: JSON with metadata including creation/modification dates and usage tracking

**Cloud Storage** (when sync enabled):
- **Backend**: Supabase with PostgreSQL and Row Level Security
- **Privacy**: Data isolated per user account - no sharing between users unless explicitly shared
- **Deletion**: Soft-delete with 30-day retention period before automatic permanent removal
- **Garbage Collection**: Server-side automatic cleanup runs daily

## 🔐 Authentication

Sharing and sync features require Google OAuth authentication via Supabase Auth:

- **First Time**: When you first share or sync, you'll be redirected to Google to authorize the extension
- **Secure**: Modern JWKS-based JWT verification with ECC (P-256) asymmetric keys for enhanced security
- **Automatic**: Once authorized, sharing and sync work seamlessly without further prompts
- **Account Linking**: Same Google account is used for both sharing and sync features
- **Token Verification**: All API requests are verified using public-key cryptography with zero-downtime key rotation support
- **Offline Grace Period**: Tokens cached locally with 5-minute grace period for offline scenarios

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details on how to:

- Set up the development environment and run the test suite to ensure everything works as expected
- Submit bug reports and feature requests
- Create pull requests with automated CI/CD validation

## 📋 Changelog

See [CHANGELOG.md](CHANGELOG.md) for a detailed history of changes and new features.
