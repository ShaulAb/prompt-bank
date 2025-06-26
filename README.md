# Prompt Bank - VS Code Extension

![Version](https://img.shields.io/badge/version-0.2.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

A powerful VS Code extension to save and manage your frequent prompts for AI assistants, code templates, and development workflows.

## 🚀 Features

### ✅ Phase 1 & 2 (Complete)
- **Save Prompts**: Save any selected text as a prompt with title, description, and category
- **Insert Prompts**: Quickly insert saved prompts at cursor position
- **Sidebar Tree View**: Browse prompts hierarchically in VS Code Explorer sidebar
- **Smart Search**: Intelligent search across all prompt fields via command palette
- **Context Menus**: Right-click actions for editing, copying, and managing prompts
- **Category Management**: Organize prompts with custom categories and rename functionality
- **Usage Tracking**: Track how often prompts are used with smart sorting
- **Smart Storage**: Stores prompts in `.vscode/prompt-bank/` for project-specific prompts

## 📦 Installation

1. **From VS Code Marketplace** (Coming Soon)
   - Open VS Code
   - Go to Extensions (`Ctrl+Shift+X`)
   - Search for "Prompt Bank"
   - Install the extension

2. **Development Install**
   ```bash
   git clone https://github.com/ShaulAb/prompt-bank.git
   cd prompt-bank
   npm install
   npm run build
   # Install using F5 in VS Code or `vsce package`
   ```

## 🎯 Quick Start

### Save a Prompt
1. Select any text in your editor
2. Press `Ctrl+Shift+S` (or `Cmd+Shift+S` on Mac)
3. Enter a title and description
4. Choose a category
5. Your prompt is saved and appears in the sidebar!

### Insert a Prompt
**Method 1: From Sidebar Tree**
1. Open "Prompt Bank" section in Explorer sidebar
2. Expand categories to see prompts
3. Click any prompt to insert at cursor position

**Method 2: Via Keyboard Shortcut**
1. Place cursor where you want to insert text
2. Press `Ctrl+Shift+I` (or `Cmd+Shift+I` on Mac)
3. Select from your saved prompts

### Search Prompts
1. Open Command Palette (`Ctrl+Shift+P`)
2. Run "Prompt Bank: Search Prompts"
3. Type search terms (searches title, content, description, category)
4. Select prompt to insert

### Manage Prompts
- **Edit Prompt**: Right-click any prompt → "Edit Prompt"
- **Copy Content**: Right-click any prompt → "Copy Content"
- **Delete Prompt**: Right-click any prompt → "Delete Prompt"
- **Rename Category**: Right-click any category → "Rename Category"
- **Refresh Tree**: Click refresh button (🔄) in tree header

## 🔧 Commands

| Command | Keybinding | Description |
|---------|------------|-------------|
| `promptBank.savePrompt` | `Ctrl+Shift+S` | Save current selection as prompt |
| `promptBank.insertPrompt` | `Ctrl+Shift+I` | Insert a saved prompt |
| `promptBank.searchPrompts` | - | Smart search across all prompts |
| `promptBank.listPrompts` | - | List all saved prompts |
| `promptBank.deletePrompt` | - | Delete a prompt |
| `promptBank.showStats` | - | Show storage statistics |
| `promptBank.refreshTree` | - | Refresh sidebar tree view |
| `promptBank.insertPromptFromTree` | - | Insert prompt from tree click |
| `promptBank.editPromptFromTree` | - | Edit prompt via context menu |
| `promptBank.copyPromptContent` | - | Copy prompt content to clipboard |
| `promptBank.deletePromptFromTree` | - | Delete prompt via context menu |
| `promptBank.renameCategory` | - | Rename category (updates all prompts) |

## 🌳 Sidebar Tree View

The Prompt Bank integrates seamlessly into VS Code's Explorer sidebar:

- **Categories**: Show as folders with prompt counts (e.g., "General (5)")
- **Prompts**: Display with file-text icons and usage statistics
- **Click to Insert**: Single-click any prompt to insert at cursor
- **Context Menus**: Right-click for edit, copy, delete operations
- **Auto-Refresh**: Tree updates automatically after any changes

## 🔍 Smart Search

Powerful search functionality accessible via Command Palette:

- **Multi-Field Search**: Searches across title, description, content, and category
- **Input Validation**: Requires minimum 2 characters for efficient searching
- **Smart Sorting**: Results sorted by usage count (most used first)
- **Context Previews**: Shows relevant content snippets around search terms
- **Instant Results**: Fast in-memory search with immediate feedback

## 📁 Storage

Prompts are stored in:
- **With Workspace**: `.vscode/prompt-bank/prompts.json`
- **Global Fallback**: `~/.vscode-prompt-bank/prompts.json`

This allows for:
- Project-specific prompts when working in a workspace
- Global prompts accessible across all projects

## 🏗️ Architecture

Built with future-proofing in mind:

```
src/
├── extension.ts              # Main entry point
├── commands/                 # Command handlers
│   ├── index.ts             # Main commands (save, insert, etc.)
│   ├── treeCommands.ts      # Tree view commands
│   ├── searchCommands.ts    # Search functionality
│   └── contextMenuCommands.ts # Context menu actions
├── services/                 # Business logic
│   └── promptService.ts     # Core prompt operations
├── models/                   # Type definitions
│   └── prompt.ts            # Prompt interface
├── storage/                  # Storage abstractions
│   ├── interfaces.ts        # Storage contracts
│   └── fileStorage.ts       # File-based storage
├── views/                    # Tree view components
│   ├── promptTreeProvider.ts # Tree data provider
│   └── promptTreeItem.ts     # Tree item implementations
└── utils/                    # Utilities
```

## 🛣️ Roadmap

### ✅ Phase 1 & 2 (Complete)
- **Basic Prompt Management**: Save, insert, delete, list prompts
- **Categories & Organization**: Custom categories with management
- **Sidebar Tree View**: Visual browsing and organization
- **Smart Search**: Intelligent filtering and discovery
- **Context Menus**: Right-click operations for efficiency
- **Usage Analytics**: Track and sort by usage patterns

### Phase 3 (Next)
- **Template Variables**: Support `{{filename}}`, `{{selectedText}}`, `{{language}}`, etc.
- **Import/Export**: Share prompt collections as JSON files
- **Advanced Search**: Filters, saved searches, and bookmarks

### Phase 4 (Future)
- **Cloud Sync**: Synchronize prompts across devices
- **Smart Suggestions**: Context-aware prompt recommendations
- **Team Sharing**: Collaborate on prompt libraries
- **Analytics Dashboard**: Usage insights and optimization

## 🧪 Development

### Prerequisites
- Node.js >= 18
- VS Code >= 1.85.0

### Setup
```bash
# Clone and install
git clone https://github.com/ShaulAb/prompt-bank.git
cd prompt-bank
npm install

# Development
npm run build:dev      # Build with sourcemaps
npm run build:watch    # Watch mode
npm run lint          # Run ESLint
npm run format        # Run Prettier

# Testing
npm test              # Run tests
npm run test:ui       # Test UI dashboard

# Package
npm run package       # Create .vsix file
```

### Testing the Extension
1. Open the project in VS Code
2. Press `F5` to launch Extension Development Host
3. Use `PHASE1-CHECKLIST.md` and `PHASE2-CHECKLIST.md` for comprehensive testing
4. Test all features: save/insert, tree view, search, context menus

## 📝 Data Format

Prompts are stored as JSON with this structure:

```typescript
interface Prompt {
  id: string;
  title: string;
  content: string;
  description?: string;
  category: string;
  tags: string[];
  variables: TemplateVariable[];
  metadata: {
    created: Date;
    modified: Date;
    usageCount: number;
    lastUsed?: Date;
    context?: FileContext;
  };
}
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if needed
5. Follow the testing checklists
6. Submit a pull request

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built with VS Code Extension API
- Inspired by the need for better prompt management in AI-assisted development
- Developed with iterative feedback-driven methodology 