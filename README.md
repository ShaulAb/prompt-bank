# Prompt Bank

<p align="center">
  <img src="./assets/logo.png" alt="Prompt Bank Logo" width="150">
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

- **Save Prompts Instantly**: Select any text and save it as a prompt with a title, description, and category using a simple keyboard shortcut (`Ctrl+Shift+S`).
- **Sidebar View**: Browse and manage all your prompts in a hierarchical tree view right in the VS Code Explorer. Categories show prompt counts, and you can click any prompt to insert it instantly.
- **Prompt Editor**: Create and edit prompts in a clean, two-column webview editor with a dynamic dropdown for selecting or creating categories on the fly.
- **Share & Import Prompts**: Easily share your prompts with others via a public link and import prompts shared by other users.
- **Powerful Search**: Find the exact prompt you need in seconds with a fuzzy search that scans titles, content, descriptions, and categories.
- **Context Menu Support**: Right-click on any prompt or category in the tree view to access all actions: Edit, Insert, Delete, Duplicate, and Rename Category.
- **Inline Actions**: Use the convenient inline icons in the tree view to insert or delete prompts with a single click.
- **Usage Tracking**: Prompts are automatically sorted by usage, so your most frequently used templates are always at the top.
- **Project-Specific & Global Storage**: Keep prompts specific to a project within its `.vscode` directory or store them globally to access them across all your projects.


## 🎯 Quick Start

1.  **Save a Prompt**:
    - Select text in your editor.
    - Press `Ctrl+Shift+S` (or `Cmd+Shift+S` on Mac).
    - Fill in the details in the prompt editor and save.

2.  **Insert a Prompt**:
    - **From the Sidebar**: Find your prompt in the "Prompt Bank" tree and click it.
    - **With a Shortcut**: Press `Ctrl+Shift+I` (or `Cmd+Shift+I` on Mac) and select a prompt from the list. Start typing to search and filter prompts.

3.  **Manage Prompts**:
    - Right-click any item in the tree view to access all management options.

4. **Share a Prompt**:
    - **From the Sidebar**: Right-click any item and get a share link.

5.  **Import a Prompt**:
    - Open the Command Palette (`Ctrl+Shift+P`), run "Prompt Bank: Import Prompt".
    - Paste the share link into the input box and press Enter.


## 🔧 Commands & Keybindings

| Command                    | Keybinding     | Description                                                       |
| -------------------------- | -------------- | ----------------------------------------------------------------- |
| `promptBank.savePrompt`    | `Ctrl+Shift+S` | Save the current selection as a new prompt.                       |
| `promptBank.insertPrompt`  | `Ctrl+Shift+I` | Show a list of prompts to insert.                                 |
| `promptBank.importPrompt`  | -              | Import a prompt from a share link.                                |
| `promptBank.refreshTree`   | -              | Manually refresh the sidebar tree view.                           |
| **Context Menu Actions**   | (Right-Click)  | `Edit`, `Delete`, `Copy Content`, `Rename Category`, `Duplicate`, `Share`. |

## 📁 Storage

Prompts are stored locally on your machine:

- **Project-Specific**: `.vscode/prompt-bank/prompts.json` (for prompts tied to the current workspace)
- **Global**: `~/.vscode-prompt-bank/prompts.json` (as a fallback for prompts available everywhere)


## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details. 
