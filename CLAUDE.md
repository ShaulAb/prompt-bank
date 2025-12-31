# CLAUDE.md

This file provides workflow guidance and development patterns for Claude Code when working with this repository.

> **Note**: For comprehensive documentation on architecture, features, and contribution guidelines, see [README.md](README.md) and [CONTRIBUTING.md](CONTRIBUTING.md).

## Project Overview

Prompt Bank is a VS Code extension for managing, reusing, and sharing AI prompts with features including:

- Local storage in `.vscode/prompt-bank/`
- Multi-device sync with three-way merge algorithm
- Cloud sharing via Google OAuth
- Prompt versioning with history
- WebView editor with LitElement

**Current Version**: v0.7.0
**Latest Release**: November 7, 2025

## Git Workflow Rules

### Branch Strategy

- **main**: Stable releases only - DO NOT develop directly here
- **dev**: Integration branch - DO NOT develop directly here
- **feature branches**: All development happens here

### Feature Development Workflow

```bash
# 1. Start from dev
git checkout dev
git pull origin dev

# 2. Create feature branch
git checkout -b feature/your-feature-name
# or: fix/bug-description, docs/doc-update, chore/maintenance-task

# 3. Develop and commit (use conventional commits!)
git add .
git commit -m "feat(scope): ✨ description"

# 4. Push and create PR to dev
git push -u origin feature/your-feature-name
gh pr create --base dev --title "..." --body "..."

# 5. After PR is merged, cleanup
git checkout dev
git pull origin dev
git branch -d feature/your-feature-name
git push origin --delete feature/your-feature-name
```

### Commit Conventions

Follow [Conventional Commits](https://www.conventionalcommits.org/) with emojis:

| Type       | Emoji | Version Impact | Use For                      |
| ---------- | ----- | -------------- | ---------------------------- |
| `feat`     | ✨    | Minor (0.x.0)  | New features                 |
| `fix`      | 🐛    | Patch (0.0.x)  | Bug fixes                    |
| `docs`     | 📝    | None           | Documentation only           |
| `chore`    | 🔧    | None           | Maintenance, gitignore, etc. |
| `refactor` | ♻️    | None           | Code restructuring           |
| `test`     | ✅    | None           | Tests only                   |

**Breaking changes**: Add `!` after type or `BREAKING CHANGE:` in body → Major (x.0.0)

**Examples**:

```bash
feat(sync): ✨ add auto-sync feature          # Minor bump
fix(editor): 🐛 resolve loading bug           # Patch bump
docs(readme): 📝 update installation guide    # No bump
chore(gitignore): 🙈 add test files          # No bump
```

## Development Patterns

### 1. Storage Locations

- **Production**: `.vscode/prompt-bank/prompts.json` (gitignored)
- **Sync state**: `.vscode/prompt-bank/sync-state.json` (gitignored)
- **Test files**: Root-level test files are gitignored (prompts.json, metadata.json)

### 2. Service Architecture

All services use **dependency injection** via `ServicesContainer`:

- Never use global singletons
- Always inject dependencies via constructor
- Add `dispose()` method for cleanup

### 3. Testing Approach

- Framework: Vitest with behavior-based tests
- Run before PR: `npx vitest run --isolate`
- Each feature has separate test file
- Mock external dependencies (Auth, Edge Functions)

### 4. WebView Development

- Edit files in `media/`
- Press `F5` to test in Extension Development Host
- Use Command Palette → "Developer: Open Webview Developer Tools" for debugging
- WebView uses LitElement and VS Code theme variables

### 5. Edge Functions (Supabase)

- Located in `supabase/functions/`
- Use Deno runtime with TypeScript
- Deploy: `supabase functions deploy <function-name>`
- All use ECC P-256 (ES256) JWT verification

## Key Commands

```bash
# Development
npm install                    # Install dependencies
npm run build                  # Production build
npm run build:watch            # Watch mode for development
F5                             # Launch Extension Development Host

# Testing
npm run test                   # Run all tests
npm run test:watch             # Watch mode

# Quality checks (run before PR)
npx prettier --check src       # Code formatting
npx tsc --noEmit              # Type checking
npm run build                  # Build verification

# Version management (maintainers only)
npm run release:dry-run        # Preview version bump
```

## Architecture Quick Reference

### Core Services

- `PromptService` - CRUD operations, versioning
- `AuthService` - Google OAuth, JWT verification (ES256)
- `ShareService` - Share prompts/collections
- `SyncService` - Multi-device sync (three-way merge)
- `ServicesContainer` - Dependency injection container

### Storage

- `FileStorageProvider` - Local JSON persistence
- `SyncStateStorage` - Sync metadata and tombstones

### UI

- `PromptTreeProvider` - Tree view with drag-and-drop
- `PromptEditorPanel` - WebView editor controller

## Common Tasks

### Adding a New Feature

1. Create feature branch from dev
2. Implement with tests
3. Run quality checks locally
4. Create PR with clear description
5. Address review feedback
6. After merge, cleanup branches

### Fixing a Bug

1. Create fix branch from dev
2. Write failing test first (if possible)
3. Fix the bug
4. Verify test passes
5. Follow PR process

### Updating Documentation

1. Create docs branch from dev
2. Update README.md, CONTRIBUTING.md, or CHANGELOG.md
3. Use `docs(scope):` commit type (no version bump)
4. PR to dev

### Making Non-User-Facing Changes

Use `chore:` type for:

- Updating .gitignore
- Dependency updates
- CI/CD tweaks
- Code cleanup without behavior changes

These won't trigger version bumps or appear prominently in release notes.

## Release Process (Maintainers)

**Normal workflow** (automated):

1. Features merged to dev via PRs
2. Maintainer triggers "Version Bump and Release" workflow
3. Workflow analyzes commits and bumps version
4. VSIX created and attached to GitHub release
5. Download and test VSIX locally
6. Merge dev → main
7. Publish to marketplace: `vsce publish`

**Version is determined automatically** from commit types since last release!

## Important Notes

- **Never commit directly to main or dev** - always use feature branches
- **Test files**: Root-level test files (prompts.json, etc.) are gitignored - safe to ignore
- **Version numbers**: Never edit manually in package.json - use release scripts
- **Sync architecture**: Uses three-way merge to handle conflicts intelligently
- **JWT tokens**: Use ES256 (ECC P-256) with JWKS for verification
- **Prompt versioning**: Already implemented in v0.7.0 with history UI

## For More Information

- **Architecture details**: See [CONTRIBUTING.md](CONTRIBUTING.md) - Advanced Development section
- **Feature documentation**: See [README.md](README.md)
- **Release history**: See [CHANGELOG.md](CHANGELOG.md)
- **Commit guidelines**: See [CONTRIBUTING.md](CONTRIBUTING.md) - Commit Guidelines section
