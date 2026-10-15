# CI/CD Setup for Prompt Bank

This document describes the Continuous Integration and Continuous Deployment (CI/CD) setup for the Prompt Bank VS Code extension.

## 🏗️ Overview

Our streamlined CI/CD pipeline consists of **3 core workflows** that ensure code quality and enable automated releases:

1. **CI Workflow** (`main.yml`) - Automated testing and validation
2. **Release Workflow** (`version-bump.yml`) - Version management and packaging
3. **Publish Workflow** (`publish.yml`) - Automated Open VSX publishing

## 🌳 Dev-Centered Branching Strategy

```
Feature Branches → dev → [Version Bump + VSIX] → [Local Test] → dev → main → [🤖 AUTO: Open VSX]
```

- **Feature branches**: Individual feature development
- **dev branch**: Integration branch where all features are merged and tested
- **main branch**: Stable/released code only, represents what users have
- **Automation**: When dev merges to main, automatic publishing to Open VSX

## 🔄 Workflows

### 1. CI Pipeline (`main.yml`)

**Triggers:** Push to `dev`/`main`, Pull Requests to `dev`/`main`

**What it does:**
- ✅ **TypeScript compilation** - Ensures type safety
- ✅ **ESLint validation** - Code quality and consistency
- ✅ **Vitest testing** - Unit and MSW integration tests
- ✅ **Release helper tests** - Tag recovery, registry status, and source verification
- ✅ **Extension build** - Creates production bundle
- ✅ **Node.js 20** - Runtime used by all three workflows

Runtime varies; check the Actions run for current timings.

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
creation and asset upload can be retried for the same tagged commit. An existing
VSIX is downloaded and reused rather than rebuilt or overwritten. If an asset
appears during upload, the upload fails safely instead of replacing it.

Do not rerun `auto` after a version commit has already reached `dev`: it can bump
the version again. Open VSX publishing remains a separate post-testing step.

### 3. Publish Workflow (`publish.yml`)

**Name:** "Publish to Open VSX"
**Triggers:** Push to `main` branch

**What it does:**
- ✅ **Version detection** - Queries the exact version in Open VSX
- ✅ **Quality gates** - Full CI pipeline before publishing
- ✅ **Open VSX Registry** - Automatic publishing via ovsx
- ✅ **Tested artifact** - Publishes the GitHub release VSIX tested locally, without repackaging
- ✅ **Source verification** - Requires the release tag and rejects tracked source changes between the tag and `main`. Release workflows, helper scripts, and Markdown documentation may differ; all other changes require a new version and tested VSIX.
- ✅ **Idempotent** - Skips a version already published to Open VSX

**Branch enforcement:** Only runs on `main`, via push or manual dispatch

**Required Secrets:**
- `OVSX_TOKEN` - Open VSX Registry Access Token

## 📊 Quality Gates

All PRs to `dev` must pass these automated quality gates:

✅ **Tests** - Vitest and release helper tests must pass
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
npm run test:release && npm run lint && npx tsc --noEmit && npm test && npm run build
```

### Individual Commands
```bash
# Testing
npm test                 # Run tests once
npm run test:release     # Release workflow helper tests
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
# 2. Select dev and version type (auto/patch/minor/major/existing)
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
# - Publishes to Open VSX Registry
# - Updates the existing GitHub Release notes
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
- **CI Runtime**: Check the latest Actions run
- **Test Results**: Check the Vitest and release helper output
- **Package Size**: Check the uploaded VSIX asset

### Dependency Management
- **Dependency Updates**: No Dependabot configuration is currently checked in
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

### Distribution policy

Publish registry updates to Open VSX only. VS Code Marketplace publishing is disabled and does not require a Microsoft publishing account or VSCE_TOKEN. GitHub releases retain downloadable VSIX files, which users can install manually in VS Code through Extensions: Install from VSIX. The existing VS Code Marketplace listing is left in place.

The legacy `npm run deploy` command has been removed. Publish through the main
branch workflow so registry uploads use the tested release asset.

Keep `dev` and `main` as permanent branches. Delete merged feature/fix branches
after checking for unique commits and uncommitted work in their worktrees.
