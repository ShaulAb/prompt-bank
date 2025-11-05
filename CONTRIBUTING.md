# Contributing to Prompt Bank

Thank you for your interest in contributing to Prompt Bank! This document provides guidelines and information for contributors.

## 🚀 Quick Start

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/shaulab/prompt-bank.git
   cd prompt-bank
   ```
3. **Install dependencies**:
   ```bash
   npm install
   ```
4. **Open in VS Code** and start developing!

## 🛠️ Development Setup

### Prerequisites

- **Node.js** 18.x or later
- **VS Code** 1.99.0 or later
- **Git** for version control

### Local Development

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Build the extension**:
   ```bash
   npm run build
   ```

3. **Run all quality checks** (required before submitting PRs):
   ```bash
   # Check code formatting
   npx prettier --check src
   
   # Type checking
   npx tsc --noEmit
   
   # Build extension
   npm run build
   
   # Package extension (optional)
   npm run package
   ```

### Testing the Extension

1. Press `F5` in VS Code to launch a new Extension Development Host
2. Test your changes in the new VS Code window
3. Use the Command Palette (`Ctrl+Shift+P`) to access Prompt Bank commands

## 📁 Project Structure

```
prompt-bank/
├── src/                     # Source code
│   ├── commands/           # VS Code commands (includes syncCommands.ts)
│   ├── models/             # Data models and types (includes syncState.ts)
│   ├── services/           # Business logic (includes syncService.ts)
│   ├── storage/            # Data persistence (includes syncStateStorage.ts)
│   ├── views/              # Tree view providers
│   ├── webview/            # WebView components
│   └── extension.ts        # Main extension entry point
├── test/                   # Test files
├── media/                  # Static assets
├── assets/                 # Extension assets
└── package.json           # Extension manifest
```

## 🧪 Testing

We use [Vitest](https://vitest.dev/) for unit testing.

### Running Tests

```bash
# Run tests in isolated mode (recommended for CI)
npx vitest run --isolate

# Run tests in watch mode
npm run test:watch

# Run tests with UI
npm run test:ui
```

### Writing Tests

We follow a **behavior-based** testing approach:

✅ Improves readability and test organization.  
🧉 Isolates individual behaviors (e.g. creation, deletion, listing).  
🧪 Makes debugging failed tests faster and easier.  

Interested in contributing tests?
1. Add new test files with the `.test.ts` extension inside the `test/` directory.
2. Use the existing test patterns as a reference.

Example test structure:
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { YourService } from '../src/services/yourService';

describe('YourService', () => {
  let service: YourService;
  
  beforeEach(() => {
    service = new YourService();
  });
  
  it('should do something', () => {
    // Arrange
    const input = 'test';
    
    // Act
    const result = service.doSomething(input);
    
    // Assert
    expect(result).toBe('expected');
  });
});
```

## 🎨 Code Style

We use **ESLint** and **Prettier** for code formatting.

### Formatting Commands

```bash
# Check code formatting
npx prettier --check src
```

### Style Guidelines

- Use **TypeScript** for all new code
- Follow existing naming conventions:
  - `camelCase` for variables and functions
  - `PascalCase` for classes and interfaces
  - `UPPER_CASE` for constants
- Add JSDoc comments for public APIs
- Keep functions small and focused
- Use meaningful variable names

## 📝 Commit Guidelines

We follow [Conventional Commits](https://www.conventionalcommits.org/) with [gitmoji](https://gitmoji.dev/) for clear, semantic version management.

### Commit Format

```
<type>(<scope>): <emoji> <description>
```

### Types and Their Impact on Versioning

| Type | Emoji | Description | Version Bump |
|------|--------|-------------|--------------|
| `feat` | ✨ | New feature | **Minor** (0.x.0) |
| `fix` | 🐛 | Bug fix | **Patch** (0.0.x) |
| `docs` | 📝 | Documentation only | No bump |
| `style` | 💄 | Code style changes | No bump |
| `refactor` | ♻️ | Code refactoring | No bump |
| `perf` | ⚡ | Performance improvements | **Patch** |
| `test` | ✅ | Adding/updating tests | No bump |
| `build` | 📦 | Build system changes | No bump |
| `ci` | 👷 | CI/CD changes | No bump |
| `chore` | 🔧 | Maintenance tasks | No bump |
| `revert` | ⏪ | Revert previous commit | **Patch** |

**Breaking Changes**: Add `BREAKING CHANGE:` in commit body or `!` after type → **Major** (x.0.0)

### Examples

```bash
# Features (Minor bump)
feat(tree-view): ✨ add drag and drop support
feat(auth): ✨ implement OAuth authentication

# Bug fixes (Patch bump)
fix(editor): 🐛 resolve WebView loading issue
fix(sync): 🐛 fix data persistence bug

# Breaking changes (Major bump)
feat(api)!: ✨ redesign storage API
# or with body:
feat(api): ✨ new storage system

BREAKING CHANGE: The storage API has been completely redesigned.
Old methods are no longer available.

# Other commits (No version bump)
docs(readme): 📝 update installation guide
test(service): ✅ add unit tests for PromptService
chore(deps): 🔧 update dependencies
```

### Why This Matters

Our CI/CD pipeline uses these conventions to:
1. **Automatically determine version bumps** based on commit types
2. **Generate changelogs** with organized sections
3. **Create meaningful release notes** for users

Use `npm run release:dry-run` to preview how your commits will affect the next version!  


## 🔄 Pull Request Process

### Before Submitting

1. **Create a new branch** for your feature:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes** following the guidelines above

3. **Test your changes**:
   ```bash
   # Run all quality checks
   npx vitest run --isolate
   npx prettier --check src
   npx tsc --noEmit
   npm run build
   ```

4. **Update documentation** if needed

5. **Commit your changes** using conventional commit format

### Submitting a PR

1. **Push your branch** to your fork:
   ```bash
   git push origin feature/your-feature-name
   ```

2. **Create a Pull Request** on GitHub with:
   - Clear title describing the change
   - Detailed description of what was changed and why
   - Link to any related issues
   - Screenshots if UI changes are involved

### PR Review Process

1. **Automated checks** must pass (tests & code quality checks)
2. **Code review** by maintainers
3. **Address feedback** if any
4. **Merge** after approval

## 📊 Quality Gates

All PRs must pass these quality gates before merging:

✅ **Tests** - All tests must pass (`npx vitest run --isolate`)
✅ **Type Checking** - TypeScript compilation must succeed (`npx tsc --noEmit`)
✅ **Formatting** - Code must be formatted with Prettier (`npx prettier --check src`)
✅ **Build** - Extension must build successfully (`npm run build`)
✅ **Security** - No high/critical security vulnerabilities

These checks are automatically run in our CI/CD pipeline, but you should run them locally before submitting your PR.

## 🐛 Reporting Issues

### Bug Reports

When reporting bugs, please include:

- **VS Code version**
- **Extension version**
- **Operating system**
- **Steps to reproduce**
- **Expected vs actual behavior**
- **Screenshots or logs** if applicable

### Feature Requests

For feature requests, please describe:

- **Use case** - What problem does this solve?
- **Proposed solution** - How should it work?
- **Alternatives considered** - What other options did you consider?


## 🤝 Community Guidelines

### Code of Conduct

- Be respectful and inclusive
- Focus on constructive feedback
- Help others learn and grow
- Maintain a positive environment

### Getting Help

- **GitHub Issues** - For bugs and feature requests
- **GitHub Discussions** - For questions and general discussion
- **Code Reviews** - For feedback on implementation

## 🔧 Advanced Development

### Authentication Architecture

The extension uses **JWKS-based JWT verification** for secure authentication:

**Overview:**
- **OAuth Provider**: Google OAuth via Supabase Auth
- **Token Type**: JWT (JSON Web Token) signed with ECC (P-256) asymmetric keys
- **Verification**: Public-key cryptography using JWKS endpoint
- **Library**: [`jose`](https://github.com/panva/jose) for industry-standard JWT verification

**How It Works:**
1. User authenticates via Google OAuth (PKCE flow)
2. Supabase Auth issues JWT signed with **ECC P-256 private key**
3. AuthService verifies JWT using **public key** from JWKS endpoint
4. Tokens cached with 5-minute offline grace period

**JWKS Endpoint:**
```
https://xlqtowactrzmslpkzliq.supabase.co/auth/v1/.well-known/jwks.json
```

**Testing Strategy:**
- **Unit Tests**: Mock JWKS responses (MSW)
- **Integration Tests**: Full auth flow with test keys (CI/CD)
- **Manual Validation**: Real Supabase endpoint verification
- **Script**: Run `npx tsx scripts/test-real-jwks.ts` to verify JWKS endpoint

**Key Benefits:**
- ✅ Zero-downtime key rotation
- ✅ No shared secrets exposed
- ✅ Fast local JWT verification
- ✅ Offline-capable with grace period

**For Developers:**
- AuthService (`src/services/authService.ts`) handles all verification
- JWKS keys cached for 10 minutes (Supabase Edge cache)
- Tokens auto-refresh when expired
- See `test/auth-jwks-verification.test.ts` for test examples

### Dependency Injection Architecture

The extension uses **constructor-based dependency injection** for all services, managed by `ServicesContainer`.

**Overview:**
- **Pattern**: Constructor injection (no singletons)
- **Container**: `ServicesContainer` manages service lifecycle
- **Benefits**: Better testability, explicit dependencies, proper cleanup

**How It Works:**
1. Extension activates → `ServicesContainer` created
2. Services instantiated with dependencies via constructor
3. Services passed to commands/handlers
4. Extension deactivates → all services disposed

**Service Initialization:**
```typescript
// Production: via ServicesContainer
const services = await servicesContainer.getOrCreate(context, workspaceRoot);
const authService = services.auth;
const syncService = services.sync;
const promptService = services.prompt;

// Tests: direct instantiation with DI
const authService = new AuthService(context, publisher, extensionName);
const syncStateStorage = new SyncStateStorage(workspaceRoot);
const syncService = new SyncService(context, workspaceRoot, authService, syncStateStorage);
```

**Dependency Graph:**
```
ServicesContainer
├─> AuthService(context, publisher, extension)
├─> SupabaseClientManager (static singleton - global resource)
├─> FileStorageProvider(workspaceRoot)
│   └─> injected into PromptService
├─> SyncStateStorage(workspaceRoot)
│   └─> injected into SyncService
├─> PromptService(storage, authService)
└─> SyncService(context, root, auth, syncStorage)
```

**Adding a New Service:**
1. Create service with constructor dependencies
2. Add `dispose()` method for cleanup
3. Update `ServicesContainer.getOrCreate()` to instantiate it
4. Update `WorkspaceServices` interface
5. Update `disposeServices()` to clean it up
6. Write tests using direct instantiation

**Key Files:**
- `src/services/servicesContainer.ts` - Container implementation
- `src/extension.ts` - Container usage in activation
- `test/sync-*.test.ts` - Examples of DI in tests

### WebView Development

The extension uses LitElement for the prompt editor:

1. WebView files are in `media/`
2. Use `webview.postMessage()` for communication
3. Test UI changes by opening the prompt editor

### Storage System

The extension supports multiple storage providers:

- **FileStorageProvider** - Local JSON files (default)
- **SyncStateStorage** - Sync metadata and deletion tracking
- Extensible for future cloud providers

## 📦 Building and Packaging

### Development Build

```bash
npm run build:dev
```

### Production Build

```bash
npm run build
```

### Package Extension

```bash
npm run package
```

This creates a `.vsix` file that can be installed locally.

## 🚀 Release Process

1. Update version in `package.json`
2. Update `CHANGELOG.md`
3. Create git tag
4. Build and publish to VS Code Marketplace

## 📚 Resources

- [VS Code Extension API](https://code.visualstudio.com/api)
- [VS Code Extension Guidelines](https://code.visualstudio.com/api/references/extension-guidelines)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Vitest Documentation](https://vitest.dev/)

Thank you for contributing to Prompt Bank! 🎉
