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

| Type       | Emoji | Description              | Version Bump      |
| ---------- | ----- | ------------------------ | ----------------- |
| `feat`     | ✨    | New feature              | **Minor** (0.x.0) |
| `fix`      | 🐛    | Bug fix                  | **Patch** (0.0.x) |
| `docs`     | 📝    | Documentation only       | No bump           |
| `style`    | 💄    | Code style changes       | No bump           |
| `refactor` | ♻️    | Code refactoring         | No bump           |
| `perf`     | ⚡    | Performance improvements | **Patch**         |
| `test`     | ✅    | Adding/updating tests    | No bump           |
| `build`    | 📦    | Build system changes     | No bump           |
| `ci`       | 👷    | CI/CD changes            | No bump           |
| `chore`    | 🔧    | Maintenance tasks        | No bump           |
| `revert`   | ⏪    | Revert previous commit   | **Patch**         |

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

### Edge Functions Architecture

The extension uses **Supabase Edge Functions** (Deno-based serverless functions) for cloud features.

**Overview:**

- **Platform**: Supabase Edge Functions (Deno runtime)
- **Language**: TypeScript (Deno-flavored)
- **Authentication**: JWT verification using `auth.getUser()` from Supabase client
- **Deployment**: Automated via Supabase CLI or manual deployment

**Available Edge Functions:**

| Function                | Purpose                                 | Methods   | Authentication |
| ----------------------- | --------------------------------------- | --------- | -------------- |
| `share-prompt`          | Create shareable link for single prompt | POST      | Required (JWT) |
| `share-collection`      | Create shareable link for collection    | POST      | Required (JWT) |
| `get-shared-prompt`     | Fetch shared prompt by share ID         | GET       | Public         |
| `get-shared-collection` | Fetch shared collection by share ID     | GET       | Public         |
| `get-user-prompts`      | Sync: fetch user's prompts from cloud   | GET, POST | Required (JWT) |
| `upsert-prompts`        | Sync: upload/update prompts to cloud    | POST      | Required (JWT) |

**Function Structure:**

```typescript
// Edge Function template (supabase/functions/function-name/index.ts)
import { createClient } from 'jsr:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  // 1. CORS handling
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // 2. Authentication (for protected endpoints)
  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
  );

  const {
    data: { user },
    error: authError,
  } = await supabaseClient.auth.getUser();
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 3. Business logic
  // ...

  // 4. Response
  return new Response(JSON.stringify({ data: result }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
```

**Key Implementation Details:**

1. **JWT Verification**: Edge Functions use ECC P-256 (ES256) signed JWTs
   - Extension sends: `Authorization: Bearer <jwt_token>`
   - Function validates: `supabaseClient.auth.getUser()`
   - **Note**: `verify_jwt` setting is disabled (incompatible with ES256)

2. **CORS Headers**: All functions include CORS headers for browser access

   ```typescript
   const corsHeaders = {
     'Access-Control-Allow-Origin': '*',
     'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
   };
   ```

3. **Error Handling**: Consistent error format across all functions

   ```typescript
   { error: 'Error message', code: 'ERROR_CODE' }  // 4xx/5xx status
   ```

4. **Database Access**: Functions use Supabase client with Row Level Security (RLS)
   - Prompts table: `user_id` column for isolation
   - Share links table: `share_id` (public) + `user_id` (owner)
   - Deleted prompts: Soft-delete with tombstones

**Local Development:**

```bash
# Start local Edge Functions
supabase functions serve

# Deploy specific function
supabase functions deploy share-prompt

# Deploy all functions
supabase functions deploy
```

**Testing Edge Functions:**

```bash
# Test with curl (replace with your JWT token)
curl -X POST 'https://xlqtowactrzmslpkzliq.supabase.co/functions/v1/share-prompt' \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Test","content":"Test content"}'
```

**Service Integration:**

- `ShareService` (`src/services/shareService.ts`) - Calls share/get Edge Functions
- `SyncService` (`src/services/syncService.ts`) - Calls sync Edge Functions
- Both services use `AuthService` for JWT token retrieval

**Key Files:**

- `supabase/functions/*/index.ts` - Edge Function implementations
- `src/services/shareService.ts` - Share feature integration
- `src/services/syncService.ts` - Sync feature integration

### WebView Development

The extension uses **LitElement** (Lit 3.x) for building the prompt editor UI with VS Code WebView API.

**Overview:**

- **Framework**: LitElement (Web Components)
- **Location**: `media/` directory (served to WebView)
- **Communication**: Message passing between extension and WebView
- **Styling**: VS Code theme-aware CSS with CSS variables

**WebView Architecture:**

```
Extension Host (Node.js)                    WebView (Browser Context)
─────────────────────────                   ──────────────────────────
PromptEditorPanel                           prompt-form (LitElement)
├─> createWebViewPanel()                    ├─> Render form UI
├─> getHtmlContent()                        ├─> Handle user input
│   └─> Inject <script src="form.js">      ├─> Validate form data
└─> panel.webview.onDidReceiveMessage()     └─> postMessage() to extension
    ↓                                           ↑
    └───────── Message Passing ─────────────────┘
    (save, cancel, getCategoryList)
```

**Key Components:**

1. **PromptEditorPanel** (`src/webview/PromptEditorPanel.ts`)
   - Creates and manages VS Code WebView panel
   - Handles panel lifecycle (create, show, dispose)
   - Implements message passing bridge
   - Manages WebView state (edit mode vs create mode)

2. **WebViewCache** (`src/webview/WebViewCache.ts`)
   - Caches HTML template to avoid repeated file I/O
   - Caches category list with 1-minute expiration
   - DNS prefetching for CDN resources (Lit, VS Code icons)

3. **prompt-form.js** (`media/form.js`)
   - LitElement-based custom element `<prompt-form>`
   - Reactive properties and state management
   - Form validation and submission

**LitElement Component Structure:**

```typescript
// media/form.js (simplified)
import { LitElement, html, css } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';

class PromptForm extends LitElement {
  // 1. Reactive properties (trigger re-render on change)
  static properties = {
    title: { type: String },
    content: { type: String },
    description: { type: String },
    category: { type: String },
    categories: { type: Array },
    mode: { type: String }, // 'create' or 'edit'
  };

  // 2. Component styles (scoped to shadow DOM)
  static styles = css`
    :host {
      display: block;
      padding: 20px;
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
    }
    /* VS Code theme variables available */
  `;

  // 3. Lifecycle: component mounted
  connectedCallback() {
    super.connectedCallback();
    // Request categories from extension
    vscode.postMessage({ command: 'getCategoryList' });
  }

  // 4. Render method (declarative UI)
  render() {
    return html`
      <form @submit=${this._handleSubmit}>
        <vscode-text-field
          label="Title"
          .value=${this.title}
          @input=${(e) => (this.title = e.target.value)}
          required
        ></vscode-text-field>

        <vscode-text-area
          label="Content"
          .value=${this.content}
          @input=${(e) => (this.content = e.target.value)}
          rows="10"
          required
        ></vscode-text-area>

        <!-- Category dropdown with inline creation -->
        <div class="category-field">
          <vscode-dropdown .value=${this.category} @change=${this._handleCategoryChange}>
            ${this.categories.map(
              (cat) => html`<vscode-option value="${cat}">${cat}</vscode-option>`
            )}
            <vscode-option value="__new__">+ Create New Category</vscode-option>
          </vscode-dropdown>
        </div>

        <div class="button-group">
          <vscode-button @click=${this._handleSave}>Save</vscode-button>
          <vscode-button appearance="secondary" @click=${this._handleCancel}>Cancel</vscode-button>
        </div>
      </form>
    `;
  }

  // 5. Event handlers
  _handleSave() {
    if (this._validate()) {
      vscode.postMessage({
        command: 'save',
        prompt: {
          title: this.title,
          content: this.content,
          description: this.description,
          category: this.category,
        },
      });
    }
  }

  _validate() {
    // Validation logic
    return true;
  }
}

// 6. Register custom element
customElements.define('prompt-form', PromptForm);

// 7. Listen for messages from extension
window.addEventListener('message', (event) => {
  const message = event.data;
  if (message.command === 'setCategories') {
    document.querySelector('prompt-form').categories = message.categories;
  }
});
```

**Message Passing Protocol:**

Extension → WebView:

```typescript
// Send data to WebView
panel.webview.postMessage({
  command: 'setCategories',
  categories: ['General', 'Code', 'Docs'],
});

panel.webview.postMessage({
  command: 'loadPrompt',
  prompt: { title: 'Test', content: '...', category: 'General' },
});
```

WebView → Extension:

```typescript
// WebView sends messages
vscode.postMessage({
  command: 'save',
  prompt: { title: '...', content: '...', category: '...' },
});

vscode.postMessage({ command: 'cancel' });
vscode.postMessage({ command: 'getCategoryList' });
```

**VS Code WebView Components:**

The editor uses VS Code's WebView UI Toolkit for native look and feel:

- `<vscode-text-field>` - Single-line text input
- `<vscode-text-area>` - Multi-line text area
- `<vscode-dropdown>` - Select dropdown
- `<vscode-button>` - Action buttons
- `<vscode-option>` - Dropdown options

**Styling with VS Code Theme:**

```css
/* CSS variables automatically provided by VS Code */
:host {
  --vscode-font-family: 'Segoe UI', sans-serif;
  --vscode-foreground: #cccccc;
  --vscode-background: #1e1e1e;
  --vscode-button-background: #0e639c;
  --vscode-input-background: #3c3c3c;
  /* 100+ theme variables available */
}
```

**Testing WebView Changes:**

1. **Local Development**:

   ```bash
   # Build extension
   npm run build:watch

   # Press F5 in VS Code to launch Extension Development Host
   # Open prompt editor: Ctrl+Alt+P
   ```

2. **Debugging WebView**:

   ```bash
   # Open WebView DevTools
   Command Palette → "Developer: Open Webview Developer Tools"

   # Inspect elements, console logs, network requests
   ```

3. **Hot Reload**: Edit `media/form.js` → Save → Reload WebView panel

**Key Implementation Details:**

1. **Content Security Policy (CSP)**:
   - WebView has strict CSP for security
   - Only whitelisted CDN domains allowed
   - Inline scripts disabled (use `<script src="...">`))

2. **Resource URIs**: Files must use `webview.asWebviewUri()` for proper loading

   ```typescript
   const scriptUri = panel.webview.asWebviewUri(
     vscode.Uri.joinPath(context.extensionUri, 'media', 'form.js')
   );
   ```

3. **State Management**:
   - WebView state persists via `getState()` / `setState()`
   - Form data survives panel hide/show cycles

4. **Performance**: WebViewCache reduces load time by 80% (HTML caching)

**Key Files:**

- `src/webview/PromptEditorPanel.ts` - WebView panel controller
- `src/webview/WebViewCache.ts` - Caching system
- `media/form.js` - LitElement prompt form component
- `media/prompt-editor.html` - HTML template (cached)

### Storage System

The extension supports multiple storage providers:

- **FileStorageProvider** - Local JSON files (default)
- **SyncStateStorage** - Sync metadata and deletion tracking
- Extensible for future cloud providers

### Sync Architecture (Three-Way Merge)

The extension implements **intelligent multi-device synchronization** using a three-way merge algorithm.

**Overview:**

- **Algorithm**: Three-way merge (compares local, remote, and last-synced states)
- **Conflict Resolution**: Automatic resolution for most cases, manual for modify-modify conflicts
- **Deletion Tracking**: Soft-delete with tombstones for 30-day retention
- **Device Tracking**: Each change records the originating device

**Why Three-Way Merge?**

Traditional sync compares only local vs remote (two-way), which can't distinguish:

- "User A added item" vs "User B deleted item"
- Which version is newer when timestamps differ?

Three-way merge compares **three states**:

1. **Local** - Current state on this device
2. **Remote** - Current state in cloud
3. **Base** - Last synced state (what both sides started from)

This allows detection of:

- ✅ **Local changes**: Local ≠ Base, Remote = Base → Upload local
- ✅ **Remote changes**: Remote ≠ Base, Local = Base → Download remote
- ✅ **No changes**: Local = Remote = Base → Skip
- ⚠️ **Conflict**: Local ≠ Base AND Remote ≠ Base → Conflict resolution needed

**Sync Algorithm Flow:**

```
┌─────────────────────────────────────────────────────────────┐
│                    SyncService.sync()                        │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 1. Fetch States                                             │
│    - Local prompts (FileStorageProvider)                    │
│    - Remote prompts (Edge Function: get-user-prompts)       │
│    - Last synced state (SyncStateStorage)                   │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. Three-Way Merge (per prompt ID)                          │
│                                                              │
│    For each prompt ID in (Local ∪ Remote ∪ Base):          │
│                                                              │
│    ┌─────────────────────────────────────────────┐         │
│    │ Case 1: Remote = Base, Local ≠ Base         │         │
│    │ → Local change (upload to remote)            │         │
│    └─────────────────────────────────────────────┘         │
│                                                              │
│    ┌─────────────────────────────────────────────┐         │
│    │ Case 2: Local = Base, Remote ≠ Base         │         │
│    │ → Remote change (download to local)          │         │
│    └─────────────────────────────────────────────┘         │
│                                                              │
│    ┌─────────────────────────────────────────────┐         │
│    │ Case 3: Local = Remote = Base               │         │
│    │ → No change (skip)                           │         │
│    └─────────────────────────────────────────────┘         │
│                                                              │
│    ┌─────────────────────────────────────────────┐         │
│    │ Case 4: Local ≠ Base AND Remote ≠ Base      │         │
│    │ → Conflict (see conflict resolution)         │         │
│    └─────────────────────────────────────────────┘         │
│                                                              │
│    ┌─────────────────────────────────────────────┐         │
│    │ Case 5: Deleted on one side, modified other │         │
│    │ → Modified version wins (prevent data loss)  │         │
│    └─────────────────────────────────────────────┘         │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. Apply Changes                                            │
│    - Upload local changes (Edge Function: upsert-prompts)   │
│    - Download remote changes (save to FileStorageProvider)  │
│    - Handle conflicts (see below)                           │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. Update Sync State                                        │
│    - Save new base state (SyncStateStorage)                 │
│    - Update last sync timestamp                             │
│    - Track device name                                       │
└─────────────────────────────────────────────────────────────┘
```

**Conflict Resolution Strategies:**

1. **Modify-Modify Conflict** (same prompt edited on both devices):

   ```typescript
   // Both versions preserved with device identifiers
   Local: 'Prompt Title (Device: Laptop - 2025-11-12 10:30)';
   Remote: 'Prompt Title (Device: Desktop - 2025-11-12 10:25)';

   // User manually reviews and deletes unwanted version
   ```

2. **Delete-Modify Conflict** (deleted on Device A, modified on Device B):

   ```typescript
   // Modified version always wins (prevents accidental data loss)
   Result: Keep modified version from Device B
   ```

3. **Create-Create Conflict** (same title created on both devices):
   ```typescript
   // Both kept with auto-generated unique IDs (UUIDs)
   // Treated as separate prompts
   ```

**Deletion Tracking:**

Deletions are tracked using **tombstones** to sync deletions across devices:

```typescript
interface SyncState {
  baseState: Record<string, Prompt>; // Last synced prompts
  deletedPromptIds: Set<string>; // Locally deleted IDs
  lastSyncTimestamp: number; // Last sync time
  deviceName: string; // Device identifier
}
```

**Tombstone Flow:**

1. User deletes prompt on Device A → Added to `deletedPromptIds`
2. Sync runs → Tombstone sent to server (soft-delete)
3. Device B syncs → Receives tombstone → Removes prompt locally
4. Server keeps soft-deleted prompt for 30 days (restore capability)
5. After 30 days → Permanent deletion via garbage collection

**Edge Cases Handled:**

| Scenario                                  | Resolution                               |
| ----------------------------------------- | ---------------------------------------- |
| Prompt deleted locally, modified remotely | Modified version wins (restore locally)  |
| Prompt modified locally, deleted remotely | Modified version wins (restore remotely) |
| Same prompt edited on 3+ devices          | All versions preserved with device tags  |
| Network failure mid-sync                  | Atomic operations, rollback on error     |
| Corrupted sync state                      | Detect via checksums, force full sync    |
| Clock skew between devices                | Use vector clocks, not timestamps        |

**Implementation Details:**

**Key Files:**

- `src/services/syncService.ts` - Main sync orchestration
- `src/storage/syncStateStorage.ts` - Sync state persistence
- `src/models/syncState.ts` - Data models for sync state

**Sync State Storage:**

```json
// .vscode/prompt-bank/sync-state.json
{
  "baseState": {
    "uuid-1": { "title": "Prompt 1", "content": "...", "updatedAt": 1699000000 }
  },
  "deletedPromptIds": ["uuid-2", "uuid-3"],
  "lastSyncTimestamp": 1699000000,
  "deviceName": "Laptop"
}
```

**Testing Sync:**

```bash
# Run sync tests
npx vitest run test/sync-three-way-merge.test.ts

# Test scenarios:
# - Local changes only
# - Remote changes only
# - Modify-modify conflicts
# - Delete-modify conflicts
# - Network failures
```

**Performance Considerations:**

1. **Incremental Sync**: Only changed prompts transferred (not full dataset)
2. **Batch Operations**: Multiple prompts uploaded in single request
3. **Compression**: Prompt content compressed before upload (gzip)
4. **Caching**: Sync state cached in memory, persisted to disk
5. **Rate Limiting**: Max 1 sync per 30 seconds (auto-sync mode)

**Manual Sync vs Auto-Sync:**

| Mode          | Trigger                          | Use Case                                  |
| ------------- | -------------------------------- | ----------------------------------------- |
| **Manual**    | Command Palette → "Sync Prompts" | On-demand sync before/after major changes |
| **Auto-Sync** | Every 5 minutes (configurable)   | Seamless background sync                  |

Enable auto-sync: `"promptBank.sync.autoSync": true` in settings.

**Debugging Sync Issues:**

```bash
# View sync status
Command Palette → "Prompt Bank: View Sync Status"

# Clear sync state (force full sync)
Command Palette → "Prompt Bank: Clear Sync State"

# Check sync state file
cat .vscode/prompt-bank/sync-state.json
```

**Further Reading:**

- [Three-Way Merge Algorithm](<https://en.wikipedia.org/wiki/Merge_(version_control)#Three-way_merge>)
- [Conflict-Free Replicated Data Types (CRDTs)](https://crdt.tech/)
- [Operational Transformation](https://en.wikipedia.org/wiki/Operational_transformation)

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

**The release process is fully automated via CI/CD - contributors don't need to manage versions manually!**

### How It Works

Our release workflow uses **conventional commits** to automatically determine version bumps:

1. **Development**: Work on feature branches and create PRs to `dev`
2. **Commit Convention**: Follow the commit format (see [Commit Guidelines](#-commit-guidelines))
3. **Automated Versioning**: When ready to release, the CI/CD workflow:
   - Analyzes commits since last release
   - Determines version bump (major/minor/patch) based on commit types
   - Updates `package.json` and generates `CHANGELOG.md` automatically
   - Creates Git tag and GitHub release with VSIX package
4. **Testing**: Download and test the VSIX locally from the GitHub release
5. **Publishing**: Merge `dev` → `main` and manually publish to marketplace

### Version Bump Rules

The system automatically determines version bumps based on your commits:

```bash
# Commits since last release:
fix(editor): 🐛 resolve loading bug     → Patch (0.0.x)
feat(sync): ✨ add auto-sync            → Minor (0.x.0)
feat(api)!: ✨ redesign storage API     → Major (x.0.0)

# Result: Major bump to next x.0.0
```

### Preview Changes Locally

Want to see how your commits will affect the next version?

```bash
npm run release:dry-run  # Preview version bump and changelog
```

### For Maintainers: Manual Release

Maintainers can trigger releases via GitHub Actions:

1. Go to **Actions** → **"Version Bump and Release"**
2. Select version type (auto/patch/minor/major)
3. Workflow automatically creates version bump, VSIX, and GitHub release
4. Test VSIX locally: `code --install-extension prompt-bank-x.x.x.vsix`
5. If tests pass, merge `dev` → `main`
6. Publish to marketplace: `vsce publish`

**Key Point**: Contributors should focus on writing good conventional commits - the CI/CD handles versioning!

## 📚 Resources

- [VS Code Extension API](https://code.visualstudio.com/api)
- [VS Code Extension Guidelines](https://code.visualstudio.com/api/references/extension-guidelines)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Vitest Documentation](https://vitest.dev/)

Thank you for contributing to Prompt Bank! 🎉
