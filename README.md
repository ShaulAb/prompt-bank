# Prompt Bank - VS Code Extension

![Version](https://img.shields.io/badge/version-0.1.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

A powerful VS Code extension to save and manage your frequent prompts for AI assistants, code templates, and development workflows.

## 🚀 Features

### Phase 1 (Current)
- **Save Prompts**: Save any selected text as a prompt with title, description, and category
- **Insert Prompts**: Quickly insert saved prompts at cursor position
- **Organize by Categories**: Organize prompts with predefined or custom categories
- **Usage Tracking**: Track how often prompts are used
- **Smart Storage**: Stores prompts in `.vscode/prompt-bank/` for project-specific prompts

## 📦 Installation

1. **From VS Code Marketplace** (Coming Soon)
   - Open VS Code
   - Go to Extensions (`Ctrl+Shift+X`)
   - Search for "Prompt Bank"
   - Install the extension

2. **Development Install**
   ```bash
   git clone <repository-url>
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
5. Your prompt is saved!

### Insert a Prompt
1. Place cursor where you want to insert text
2. Press `Ctrl+Shift+I` (or `Cmd+Shift+I` on Mac)
3. Select from your saved prompts
4. The prompt content is inserted at cursor position

### Manage Prompts
- **List All Prompts**: `Ctrl+Shift+P` → "Prompt Bank: List All Prompts"
- **Delete Prompts**: `Ctrl+Shift+P` → "Prompt Bank: Delete Prompt"
- **View Stats**: `Ctrl+Shift+P` → "Prompt Bank: Show Stats"

## 🔧 Commands

| Command | Keybinding | Description |
|---------|------------|-------------|
| `promptBank.savePrompt` | `Ctrl+Shift+S` | Save current selection as prompt |
| `promptBank.insertPrompt` | `Ctrl+Shift+I` | Insert a saved prompt |
| `promptBank.listPrompts` | - | List all saved prompts |
| `promptBank.deletePrompt` | - | Delete a prompt |
| `promptBank.showStats` | - | Show storage statistics |

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
├── extension.ts          # Main entry point
├── commands/            # Command handlers
├── services/            # Business logic
├── models/              # Type definitions
├── storage/             # Storage abstractions
└── utils/               # Utilities
```

## 🛣️ Roadmap

### Phase 2 (Planned)
- **Sidebar Tree View**: Browse prompts in VS Code sidebar
- **Categories Management**: Better category organization
- **Search & Filter**: Find prompts quickly

### Phase 3 (Planned)
- **Template Variables**: Support `{{filename}}`, `{{selectedText}}`, etc.
- **Import/Export**: Share prompt collections
- **Backup & Sync**: Cloud synchronization

### Phase 4 (Future)
- **Smart Suggestions**: Context-aware prompt recommendations
- **Team Sharing**: Collaborate on prompt libraries
- **Analytics**: Usage insights and optimization

## 🧪 Development

### Prerequisites
- Node.js >= 18
- VS Code >= 1.85.0

### Setup
```bash
# Clone and install
git clone <repository-url>
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
3. Test commands in the new VS Code window

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
5. Submit a pull request

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built with VS Code Extension API
- Inspired by the need for better prompt management in AI-assisted development 