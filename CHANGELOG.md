# Changelog

All notable changes to the Prompt Bank VS Code extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Save from Selection Context Menu**: New right-click context menu item "Save Selection as Prompt" in the editor
- **Improved WebView Modal**: Support for both create and edit modes with prefilled content
- **Enhanced Test Coverage**: Comprehensive tests for new features (60 tests passing)

### Changed
- **Command Visibility**: `savePromptFromSelection` command is now hidden from command palette (context menu only)
- **WebView Editor**: Can now accept initial content when creating new prompts

### Fixed
- **TypeScript Errors**: Fixed type checking issues in promptService
- **ESLint Configuration**: Fixed ESLint TypeScript plugin configuration

## [0.5.5] - 2025-07-22

### Added
- **Sharing Functionality**: Share individual prompts and entire collections via public links
- **Import Functionality**: Import prompts and collections from shared links
- **Category Management**: Create, rename, and organize prompts into categories
- **Drag & Drop**: Reorder categories and prompts with intuitive drag & drop interface
- **Tree View**: Hierarchical display of prompts organized by categories
- **Context Menus**: Right-click actions for all prompt operations
- **Search**: Find prompts quickly with integrated search functionality
- **Webview Editor**: Modern Lit-based editor for creating and editing prompts
- **Authentication**: GitHub OAuth integration for sharing features
- **Persistence**: All data persists across VS Code sessions
- **Empty State**: Helpful guidance when no prompts exist

### Changed
- **UI/UX**: Complete visual overhaul with modern, professional styling
- **Architecture**: Refactored to use storage provider pattern for better maintainability
- **Category Handling**: Centralized category management through `getAllCategories()` method

### Fixed
- **Security**: Removed debug logging that exposed JWT tokens in terminal output
- **Command Registration**: Fixed missing `promptBank.shareCollection` command registration
- **Type Safety**: Improved TypeScript types for sharing functionality
- **Error Handling**: Enhanced error handling throughout the extension

### Technical Details
- **Storage**: File-based JSON storage with atomic operations
- **Webview**: LitElement-based editor with VS Code theme integration
- **Testing**: Comprehensive test suite with 32 passing tests
- **Bundle Size**: Optimized extension bundle at 32.4kb
- **Compatibility**: Supports VS Code 1.99.0 and later

---

## Previous Test Versions

### [0.5.3 - 0.5.4] - Test Releases
These versions were used for testing and development purposes. Version 0.5.5 represents the first production-ready release with all core features implemented and tested.

---

### Added
- **Contribution Documentation**: Comprehensive CONTRIBUTING.md with development setup, coding guidelines, and PR process

### Changed
- **Keyboard Shortcuts**: Updated to avoid conflicts with Cursor built-ins
  - Save Prompt: `Ctrl+Alt+P` (Mac: `Cmd+Alt+P`)
  - Insert Prompt: `Ctrl+Alt+I` (Mac: `Cmd+Alt+I`)

### Planned
- Template variables support
- Improved import UX
- Cloud sync

[0.5.5]: https://github.com/ShaulAb/prompt-bank/releases/tag/v0.5.5 