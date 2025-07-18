# CI/CD Setup for Prompt Bank

This document describes the Continuous Integration and Continuous Deployment (CI/CD) setup for the Prompt Bank VS Code extension.

## 🏗️ Overview

Our CI/CD pipeline consists of multiple workflows that ensure code quality, run tests, and automate releases:

1. **Main CI Workflow** (`ci.yml`) - Core testing and validation
2. **Release Workflow** (`release.yml`) - Automated publishing
3. **Code Quality Workflow** (`code-quality.yml`) - Additional quality checks
4. **Dependency Updates** (`dependency-updates.yml`) - Automated dependency management
5. **Dependabot** (`dependabot.yml`) - Security updates and dependency management

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

**Badge:** Add this to your README.md:
```markdown
[![CI](https://github.com/ShaulAb/prompt-bank/actions/workflows/ci.yml/badge.svg)](https://github.com/ShaulAb/prompt-bank/actions/workflows/ci.yml)
```

### 2. Release (`release.yml`)

**Triggers:** Push tags matching `v*` (e.g., `v1.0.0`)

**What it does:**
- Runs full test suite
- Builds and packages extension
- Creates GitHub release with release notes
- Uploads `.vsix` file to release
- Publishes to VS Code Marketplace

**Required Secrets:**
- `VSCE_PAT`: Personal Access Token for VS Code Marketplace

**How to trigger a release:**
```bash
# Create and push a version tag
git tag v1.0.0
git push origin v1.0.0
```

### 3. Code Quality (`code-quality.yml`)

**Triggers:** Push to `main`/`develop`, Pull Requests to `main`/`develop`

**What it does:**
- TypeScript type checking
- Code formatting validation with Prettier
- Bundle size analysis
- Test coverage reporting
- Checks for TODO/FIXME comments
- Dependency usage analysis
- Performance measurements

### 4. Dependency Updates (`dependency-updates.yml`)

**Triggers:** Weekly schedule (Mondays 8:00 AM UTC), Manual trigger

**What it does:**
- Checks for outdated npm packages
- Updates dependencies automatically
- Runs tests after updates
- Creates Pull Request with changes
- Performs security audit

### 5. Dependabot (`dependabot.yml`)

**What it does:**
- Automatically opens PRs for dependency updates
- Handles both npm and GitHub Actions updates
- Runs weekly on Mondays
- Automatically assigns to maintainers

## 🚀 Getting Started

### Prerequisites

1. **GitHub Secrets Setup:**
   - `VSCE_PAT`: Get from [Azure DevOps](https://dev.azure.com/) for VS Code Marketplace publishing

2. **Repository Settings:**
   - Enable GitHub Actions in repository settings
   - Set up branch protection rules for `main` branch
   - Require status checks to pass before merging

### Setting up VS Code Marketplace Publishing

1. Create a Personal Access Token:
   - Go to [Azure DevOps](https://dev.azure.com/)
   - Create new organization (if needed)
   - Go to User Settings > Personal Access Tokens
   - Create token with `Marketplace (manage)` scope

2. Add token to GitHub Secrets:
   - Go to Repository Settings > Secrets and variables > Actions
   - Add new secret named `VSCE_PAT`
   - Paste your Azure DevOps PAT

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

## 🔧 Customization

### Adding New Workflows
1. Create new `.yml` file in `.github/workflows/`
2. Define triggers and jobs
3. Test with pull request

### Modifying Existing Workflows
1. Edit the relevant `.yml` file
2. Test changes in a feature branch
3. Ensure all quality gates pass

### Environment-Specific Configuration
- Use GitHub Environments for staging/production
- Set up environment-specific secrets
- Configure deployment protection rules

## 📋 Troubleshooting

### Common Issues

**Tests failing in CI but passing locally:**
- Check Node.js version compatibility
- Verify all dependencies are in `package.json`
- Check for environment-specific paths

**Release workflow failing:**
- Verify `VSCE_PAT` secret is configured
- Check marketplace permissions
- Ensure version in `package.json` is updated

**Dependency update PRs failing:**
- Review breaking changes in dependencies
- Update test configurations if needed
- Check TypeScript compatibility

### Getting Help
- Check workflow logs in GitHub Actions
- Review error messages and stack traces
- Open an issue with the `ci/cd` label

## 📝 Best Practices

1. **Version Management:**
   - Use semantic versioning
   - Update CHANGELOG.md with releases
   - Test releases in staging environment

2. **Code Quality:**
   - Write tests for new features
   - Maintain test coverage above 80%
   - Address linting warnings promptly

3. **Security:**
   - Review dependency updates carefully
   - Keep secrets secure and rotated
   - Monitor for security advisories

4. **Performance:**
   - Monitor bundle size growth
   - Profile extension startup time
   - Optimize build performance

This CI/CD setup ensures high code quality, automated testing, and reliable releases for the Prompt Bank extension.