# CI/CD Setup for Prompt Bank

This document describes the Continuous Integration and Continuous Deployment (CI/CD) setup for the Prompt Bank VS Code extension.

## 🏗️ Overview

Our CI/CD pipeline consists of multiple workflows that ensure code quality, run tests, and automate releases:

1. **Main CI Workflow** (`ci.yml`) - Core testing and validation
2. **Code Quality Workflow** (`code-quality.yml`) - Additional quality checks
3. **Dependency Updates** (`dependency-updates.yml`) - Automated dependency management
4. **Dependabot** (`dependabot.yml`) - Security updates and dependency management

## 🔄 Workflows

### 1. Main CI (`ci.yml`)

**Triggers:** Push to `main`/`develop`, Pull Requests to `main`/`develop`

**What it does:**
- Runs tests across Node.js versions 18.x, 20.x, and 22.x
- Performs linting with ESLint
- Builds the extension
- Packages the extension as `.vsix`
- Runs VS Code compatibility tests
- Uploads build artifacts

### 2. Code Quality (`code-quality.yml`)

**Triggers:** Push to `main`/`develop`, Pull Requests to `main`/`develop`

**What it does:**
- TypeScript type checking
- Code formatting validation with Prettier
- Bundle size analysis
- Test coverage reporting
- Checks for TODO/FIXME comments
- Dependency usage analysis
- Performance measurements

### 3. Dependency Updates (`dependency-updates.yml`)

**Triggers:** Weekly schedule (Mondays 8:00 AM UTC), Manual trigger

**What it does:**
- Checks for outdated npm packages
- Updates dependencies automatically
- Runs tests after updates
- Creates Pull Request with changes
- Performs security audit

### 4. Dependabot (`dependabot.yml`)

**What it does:**
- Automatically opens PRs for dependency updates
- Handles both npm and GitHub Actions updates
- Runs weekly on Mondays
- Automatically assigns to maintainers

## 📊 Quality Gates

All PRs must pass these quality gates:

✅ **Tests** - All tests must pass  
✅ **Linting** - Code must pass ESLint rules  
✅ **Type Checking** - TypeScript compilation must succeed  
✅ **Formatting** - Code must be formatted with Prettier   
✅ **Build** - Extension must build successfully  
✅ **Security** - No high/critical security vulnerabilities

## 🛠️ Local Development

### Running Tests Locally
```bash
# Run tests once
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with UI
npm run test:ui
```

### Code Quality Checks
```bash
# Run linter
npm run lint

# Check formatting
npx prettier --check src

# Type checking
npx tsc --noEmit

# Build extension
npm run build

# Package extension
npm run package
```

## 📈 Monitoring & Maintenance

### Workflow Status
Monitor workflow status in the [Actions tab](https://github.com/ShaulAb/prompt-bank/actions).

### Dependency Updates
- Dependabot PRs are created weekly
- Review and merge dependency updates promptly
- Monitor for breaking changes

### Security
- Security audits run automatically
- Address high/critical vulnerabilities immediately
- Review Dependabot security updates
