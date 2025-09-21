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
- **Drag & Drop**: Reorder categories and prompts with intuitive drag & drop interface. Move prompts between categories seamlessly.
- **Category Management**: Create, rename, and organize prompts into categories. Categories are automatically managed and sorted.
- **Powerful Search**: Find prompts quickly with integrated search that scans titles, content, descriptions, and categories.
- **Context Menus**: Right-click on any prompt or category for all actions: Edit, Insert, Delete, Share, and Rename Category.
- **Inline Actions**: Use convenient inline icons in the tree view for quick insert and delete operations.
- **Authentication**: Secure GitHub OAuth integration for sharing features.
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


## 🔧 Commands & Keybindings

| Command                    | Keybinding     | Description                                                       |
| -------------------------- | -------------- | ----------------------------------------------------------------- |
| `promptBank.savePrompt`    | `Ctrl+Alt+P` | Save text from selection or clipboard as a new prompt.        |
| `promptBank.savePromptFromSelection` | Right-click | Save selected text as prompt (editor context menu only).  |
| `promptBank.insertPrompt`  | `Ctrl+Alt+I` | Insert prompt from the collection.                                 |
| `promptBank.listPrompts`   | -              | List all prompts with search and action options.                  |
| `promptBank.importPrompt`  | -              | Import a prompt or collection from a share link.                  |
| `promptBank.shareCollection` | -           | Share a category or the entire collection.                         |
| `promptBank.refreshTree`   | -              | Manually refresh the tree view.                                   |
| **Context Menu Actions**   | (Right-Click)  | `Edit`, `Insert`, `Delete`, `Share`, `Rename Category`.           |

## 📁 Storage

Prompts are stored locally on your machine using atomic file operations:

- **Project-Specific**: `.vscode/prompt-bank/prompts.json` (for prompts tied to the current workspace)
- **Global**: `~/.vscode-prompt-bank/prompts.json` (as a fallback for prompts available everywhere)
- **Data Format**: JSON with metadata including creation/modification dates and usage tracking

## 🔐 Authentication

Sharing features require GitHub OAuth authentication:

- **First Time**: When you first share a prompt, you'll be redirected to GitHub to authorize the extension
- **Secure**: Only minimal permissions are requested (public profile access)
- **Automatic**: Once authorized, sharing works seamlessly without further prompts
- **Revocable**: You can revoke access anytime from your GitHub settings

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details on how to:

- Set up the development environment with MSW-based E2E testing
- Run comprehensive authentication tests (67 tests with OAuth flow coverage)
- Submit bug reports and feature requests
- Create pull requests with automated CI/CD validation

## 📋 Changelog

See [CHANGELOG.md](CHANGELOG.md) for a detailed history of changes and new features.
