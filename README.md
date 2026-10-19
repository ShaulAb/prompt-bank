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
  <a href="https://open-vsx.org/extension/prestissimo/prompt-bank"><img src="https://img.shields.io/open-vsx/v/prestissimo/prompt-bank?style=for-the-badge&label=Open%20VSX" alt="Open VSX"></a>
  <a href="https://github.com/ShaulAb/prompt-bank/actions/workflows/main.yml"><img src="https://img.shields.io/github/actions/workflow/status/ShaulAb/prompt-bank/main.yml?style=for-the-badge&label=Tests" alt="Tests"></a>
  <a href="https://github.com/ShaulAb/prompt-bank/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" alt="License: MIT"></a>
</p>

---

A powerful VS Code extension to save and manage your frequent prompts for AI assistants, code templates, and development workflows.

<!-- Optional: Add a GIF demo here -->
<!-- <p align="center">
  <img src="link-to-your-demo.gif" alt="Prompt Bank Demo">
</p> -->

## 🚀 Key Features

- **Create Prompts**: Use the New Prompt action in the Prompt Bank tree, or right-click selected editor text and choose **Save Selection as Prompt** to start with that text as content.
- **Tree View**: Browse and manage all your prompts in a hierarchical tree view organized by categories. Click any prompt to insert it instantly.
- **Modern Editor**: Create and edit prompts in a clean, two-column webview editor with dynamic category dropdown and inline category creation.
- **Share & Import**: Share individual prompts or entire collections via public links. Import prompts and collections from others with automatic conflict resolution.
- **Multi-Device Sync**: Synchronize prompts across multiple devices with smart conflict detection, deletion tracking, and restore capabilities. Never lose work when editing the same prompt on different machines.
- **Drag & Drop**: Reorder categories and prompts with intuitive drag & drop interface. Move prompts between categories seamlessly.
- **Category Management**: Create, rename, and organize prompts into categories. Categories are automatically managed and sorted.
- **Powerful Search**: Find prompts quickly with integrated search that scans titles, content, descriptions, and categories.
- **Context Menus**: Right-click on any prompt or category for all actions: Edit, Copy, Delete, Share, and Rename Category.
- **Inline Actions**: Use the convenient copy icon in the tree view for quick prompt copying.
- **Authentication**: Secure Google OAuth integration for sharing and sync features.
- **Persistence**: All data persists across VS Code sessions with atomic file operations.


## 🎯 Quick Start

1.  **Create a Prompt**:
    - In the Prompt Bank tree, choose **New Prompt**.
    - To use selected editor text as the starting content, right-click the selection and choose **Save Selection as Prompt**.
    - Fill in the prompt details and save.

2.  **Copy a Prompt**:
    - **From the Sidebar**: Find your prompt in the "Prompt Bank" tree and click the copy icon.
    - **From Command Palette**: Use "Prompt Bank: List All Prompts" to search and select a prompt to copy.

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
    - For a detailed walkthrough, see the [Sync Guide](docs/SYNC-GUIDE.md).


## 🔧 Commands & Keybindings

| Command                    | Keybinding     | Description                                                       |
| -------------------------- | -------------- | ----------------------------------------------------------------- |
| `promptBank.newPrompt` | Prompt Bank tree | Open the prompt editor to create a prompt. |
| `promptBank.savePromptFromSelection` | Editor right-click | Create a prompt with the selected text prefilled. |
| `promptBank.insertPrompt`  | -              | Copy prompt from the collection.                                  |
| `promptBank.listPrompts`   | -              | List all prompts with search and action options.                  |
| `promptBank.importPrompt`  | -              | Import a prompt or collection from a share link.                  |
| `promptBank.shareCollection` | -           | Share a category or the entire collection.                         |
| `promptBank.syncPrompts`   | -              | Manually sync prompts across devices.                             |
| `promptBank.toggleAutoSync` | -             | Enable/disable automatic synchronization.                          |
| `promptBank.viewSyncStatus` | -             | View current sync status (user, device, last sync time).          |
| `promptBank.clearSyncState` | -             | Reset sync metadata for fresh start.                               |
| `promptBank.refreshTree`   | -              | Manually refresh the tree view.                                   |
| **Context Menu Actions**   | (Right-Click)  | `Edit`, `Copy`, `Delete`, `Share`, `Rename Category`.             |

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

- **Device Flow**: Uses OAuth 2.0 Device Authorization Grant (RFC 8628) for secure, reliable authentication from VS Code
- **First Time**: When you first share or sync, a browser window opens for Google sign-in while the extension waits for completion
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

## Installation channels

Get registry updates from [Open VSX](https://open-vsx.org/extension/prestissimo/prompt-bank), or download the VSIX from [GitHub Releases](https://github.com/ShaulAb/prompt-bank/releases). In VS Code, run **Extensions: Install from VSIX** and choose the downloaded file. New releases are no longer published to VS Code Marketplace.
