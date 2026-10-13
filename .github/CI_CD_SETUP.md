# CI/CD Setup for Prompt Bank

This document describes the Continuous Integration and Continuous Deployment (CI/CD) setup for the Prompt Bank VS Code extension.

## 🏗️ Overview

Our streamlined CI/CD pipeline consists of **3 core workflows** that ensure code quality and enable automated releases:

1. **CI Workflow** (`main.yml`) - Automated testing and validation
2. **Release Workflow** (`version-bump.yml`) - Version management and packaging
3. **Publish Workflow** (`publish.yml`) - Automated marketplace publishing

## 🌳 Dev-Centered Branching Strategy

```
Feature Branches → dev → [Version Bump + VSIX] → [Local Test] → dev → main → [🤖 AUTO: Marketplaces]
```

- **Feature branches**: Individual feature development
- **dev branch**: Integration branch where all features are merged and tested
- **main branch**: Stable/released code only, represents what users have
- **Automation**: When dev merges to main, automatic publishing to VS Code Marketplace and Open VSX

## 🔄 Workflows

### 1. CI Pipeline (`main.yml`)

**Triggers:** Push to `dev`/`main`, Pull Requests to `dev`

**What it does:**
- ✅ **TypeScript compilation** - Ensures type safety
- ✅ **ESLint validation** - Code quality and consistency
- ✅ **Vitest testing** - 67 tests with comprehensive coverage
- ✅ **Extension build** - Creates production bundle
- ✅ **Multi-Node support** - Tests on Node.js 18.x and 20.x

**Runtime:** ~30 seconds (optimized for speed)

### 2. Release Workflow (`version-bump.yml`)

**Name:** "Version Bump and Release"
**Triggers:** Manual workflow dispatch (dev branch only)

**What it does:**
- ✅ **Quality gates** - Full CI pipeline before packaging
- ✅ **Version management** - Automatic or manual version bumping
- ✅ **Changelog generation** - Uses conventional commits
- ✅ **VSIX packaging** - Creates installable extension package
- ✅ **GitHub release** - With downloadable VSIX for testing
- ✅ **Dev branch updates** - Commits changes back to dev

**Branch enforcement:** Only runs from `dev` branch (`if: github.ref == 'refs/heads/dev'`)

**Resume a partial release:** Choose `existing` to package the version already in
`package.json` without another bump or changelog commit. The workflow refuses to
move an existing tag to a different commit. Branch and tag pushes are atomic,
and the VSIX is retained as an Actions artifact before publishing. Release
creation and asset upload can be retried for the same tagged commit.

Do not rerun `auto` after a version commit has already reached `dev`: it can bump
the version again. Marketplace publishing remains a separate post-testing step.

### 3. Publish Workflow (`publish.yml`)

**Name:** "Publish to Marketplaces"
**Triggers:** Push to `main` branch

**What it does:**
- ✅ **Version detection** - Compares current version with latest git tag
- ✅ **Quality gates** - Full CI pipeline before publishing
- ✅ **VS Code Marketplace** - Automatic publishing via vsce
- ✅ **Open VSX Registry** - Automatic publishing via ovsx
- ✅ **GitHub Release** - Creates release with VSIX artifact
- ✅ **Idempotent** - Skips if version already published

**Branch enforcement:** Only runs on `main` branch pushes

**Required Secrets:**
- `VSCE_TOKEN` - VS Code Marketplace Personal Access Token
- `OVSX_TOKEN` - Open VSX Registry Access Token

### 4. Dependabot

**Configuration:** `.github/dependabot.yml`

**What it does:**
- Automatically opens PRs for dependency updates
- Handles both npm and GitHub Actions updates
- Runs weekly security audits
- Automatically assigns to maintainers

## 📊 Quality Gates

All PRs to `dev` must pass these automated quality gates:

✅ **Tests** - All 67 tests must pass (Vitest)
✅ **Linting** - Code must pass ESLint rules
✅ **Type Checking** - TypeScript compilation must succeed
✅ **Build** - Extension must build successfully

**Additional Release Gates** (when creating releases):
✅ **VSIX Creation** - Package must build without errors
✅ **Local Testing** - Manual verification before main merge

## 🛠️ Local Development

### Quick Quality Check
```bash
# Run all quality checks (same as CI)
npm run lint && npx tsc --noEmit && npm test && npm run build
```

### Individual Commands
```bash
# Testing
npm test                 # Run tests once
npm run test:watch       # Run tests in watch mode
npm run test:ui          # Run tests with UI

# Code Quality
npm run lint             # ESLint validation
npx tsc --noEmit         # TypeScript type checking
npm run build            # Build extension

# Release Preparation
npm run package          # Create VSIX package
npm run release:dry-run  # Preview version changes
```

## 🚀 Release Process

### 1. Create Release (from dev branch)
```bash
# Via GitHub Actions (Recommended)
# 1. Go to Actions → "Version Bump and Release"
# 2. Select version type (auto/patch/minor/major)
# 3. Workflow creates VSIX and GitHub release
```

### 2. Local Testing
```bash
# Download VSIX from GitHub release
code --install-extension prompt-bank-X.X.X.vsix
# Test all functionality
```

### 3. Production Release
```bash
# Create PR: dev → main
gh pr create --base main --head dev --title "Release vX.X.X"

# After merge to main:
# 🤖 Automatic publishing happens via GitHub Actions!
# - Publishes to VS Code Marketplace
# - Publishes to Open VSX Registry
# - Creates GitHub Release with VSIX
```

### 4. Monitor Publishing
```bash
# Check workflow status
gh run list --workflow=publish.yml

# View specific run
gh run view [run-id]
```

## 📈 Monitoring & Maintenance

### Workflow Status
Monitor workflow status in the [Actions tab](https://github.com/ShaulAb/prompt-bank/actions).

### Key Metrics
- **CI Runtime**: ~30 seconds (optimized)
- **Test Coverage**: 67 tests with comprehensive scenarios
- **Bundle Size**: ~40KB (minified)

### Dependency Management
- **Dependabot**: Creates weekly PRs for updates
- **Security**: Automatic vulnerability scanning
- **Review Process**: All dependency updates reviewed before merge

## 🔧 Troubleshooting

### Common Issues

**"Workflow not visible in Actions"**
- Workflows are discovered from the default branch (main)
- Ensure workflow files are merged to main

**"403 Permission Error in Workflow"**
- Check workflow has proper `permissions: contents: write`
- Verify workflow runs from correct branch

**"Release Workflow Fails"**
- Ensure running from `dev` branch only
- Check all quality gates pass before packaging

### Getting Help
- Check [CLAUDE.md](../CLAUDE.md) for comprehensive development guide
- Review workflow logs in GitHub Actions
- Ensure conventional commit format for version detection
