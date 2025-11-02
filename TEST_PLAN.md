# E2E Authentication Testing Plan

## ✅ IMPLEMENTATION COMPLETE (Migrated to MSW)

> **Latest Update**: September 2025 - Migrated from custom Mock OAuth Provider to Mock Service Worker (MSW) for improved reliability and reduced code complexity.

### Architecture Overview
**Current Approach**: MSW (Mock Service Worker) + JWKS-based JWT verification + Vitest + VS Code Extension Host

**Migration Benefits**:
- 🎯 **80% code reduction** (800+ lines → 200 lines)
- ⚡ **Faster CI** (~30s vs 10-15min)
- 🧪 **Better isolation** (network-level mocking)
- 🔒 **JWKS verification** included in tests

## Implemented Components

### 1. **Test Environment Setup (MSW-based)**
- ✅ **MSW Request Handlers** (`test/e2e/helpers/oauth-handlers.ts`, `jwks-handlers.ts`)
  - Network-level request interception (no HTTP server needed)
  - OAuth 2.0 + PKCE flow mocking
  - JWKS endpoint mocking with real JWT generation
  - Pre-configured test users with proper JWT payloads
  - Token generation, refresh, and expiry simulation
- ✅ **MSW Server Setup** (`test/e2e/helpers/msw-setup.ts`)
  - Unified MSW server for all tests
  - Automatic handler lifecycle management
  - Support for both Node.js (Vitest) and Browser environments
- ✅ **JWKS Test Utilities** (`test/e2e/helpers/jwks-handlers.ts`)
  - RSA key pair generation for JWT signing
  - Mock JWKS endpoint with valid public keys
  - Valid/expired/invalid JWT generation
  - Network failure simulation
- ✅ **GitHub Actions Workflows** (`.github/workflows/main.yml`)
  - Fast CI (~30s total runtime)
  - All tests run in isolation
  - No external dependencies

### 2. **Test Infrastructure**
- ✅ **VS Code Extension Test Runner** (`test/e2e/runTests.ts`)
  - Uses `@vscode/test-electron` for real Extension Host
  - Configurable environment variables
  - Isolated extension testing
- ✅ **Extension Helper Utilities** (`test/e2e/helpers/extension-helpers.ts`)
  - Token management helpers
  - URI handler spying
  - Configuration management
  - Authentication flow triggers
- ✅ **Test Suite Index** (`test/e2e/suite/index.ts`)
  - Mocha test runner configuration
  - Test discovery and execution
  - Timeout configuration for E2E tests

### 3. **Implemented Test Scenarios**

#### ✅ **MSW Integration Tests** (`test/e2e/suite/msw-integration.test.ts`)
1. **OAuth authorization flow** - Complete OAuth 2.0 authorization with redirects
2. **Token exchange (PKCE)** - Code exchange with PKCE verification
3. **Token refresh** - Automatic token renewal using refresh tokens
4. **User info retrieval** - Extract user data from authenticated endpoints
5. **Multiple test users** - Support for primary and secondary test accounts
6. **Error handling** - Invalid credentials and network error scenarios
7. **State parameter validation** - CSRF protection verification

#### ✅ **JWKS Verification Tests** (`test/auth-jwks-verification.test.ts`)
1. **Valid JWT verification** - Verify properly signed JWTs
2. **Expired JWT rejection** - Reject tokens past expiration
3. **Invalid signature rejection** - Reject tokens with wrong signatures
4. **User info extraction** - Extract email and metadata from verified tokens
5. **Offline grace period** - Allow recently-verified tokens during network outages
6. **Token refresh verification** - Verify refreshed tokens immediately
7. **OAuth callback verification** - Verify new tokens after OAuth flow
8. **JWKS caching** - Performance optimization with jose library caching

#### ✅ **E2E Tests (VS Code Extension Host)** (`test/e2e/suite/auth-simplified.test.ts`)
1. **Full authentication flow** - Complete auth in real VS Code instance
2. **Token persistence** - SecretStorage integration
3. **Sign-out cleanup** - Complete session cleanup
4. **Cross-editor compatibility** - Support for VS Code, Cursor, etc.
**Note**: These tests are excluded from CI (require real VS Code instance)

### 4. **Test User Strategy**

#### **Pre-configured Test Users**
```typescript
- Primary User: test-user-001 (test-primary@promptbank.test)
- Secondary User: test-user-002 (test-secondary@promptbank.test)
```

#### **Data Isolation**
- Unique namespace per test run (timestamp + random)
- Automatic cleanup after test completion
- No cross-test data pollution

### 5. **CI/CD Integration**

#### **Test Execution Commands**
```bash
# Run E2E tests with mock OAuth
npm run test:e2e

# Run E2E tests in watch mode
npm run test:e2e:watch

# Run all tests (unit + E2E)
npm run test:integration
```

#### **GitHub Actions Triggers**
- Push to main/master/develop branches
- Pull requests
- Manual workflow dispatch with real OAuth option

### 6. **Production JWKS Validation Script**

For validating the real Supabase JWKS endpoint:

```bash
npx tsx scripts/test-real-jwks.ts
```

**What it validates**:
- ✅ JWKS endpoint accessibility
- ✅ ECC (P-256) public key presence
- ✅ Key algorithm (ES256)
- ✅ Key properties (kid, use, alg, crv)
- ✅ jose library integration
- ✅ Key ID matches expected value

**When to run**:
- After Supabase JWT key migration
- Before releasing JWKS-related changes
- When debugging JWT verification issues

### 7. **MSW vs Custom Mock Provider**

#### **Endpoints Implemented**
- `/auth/v1/authorize` - Authorization endpoint with PKCE support
- `/auth/v1/token` - Token exchange and refresh
- `/auth/v1/user` - User info retrieval
- `/test/trigger-callback` - Testing helper for callbacks

#### **Security Features**
- PKCE challenge verification
- Token expiry simulation
- Bearer token validation
- State parameter verification

### 7. **Benefits Achieved**
- ✅ **Deterministic Testing**: Mock provider ensures consistent test results
- ✅ **Fast Execution**: No external API dependencies for CI runs
- ✅ **Cross-Platform Support**: Tests run on Linux, Windows, and macOS
- ✅ **Security Validation**: PKCE and token handling thoroughly tested
- ✅ **Easy Debugging**: Comprehensive logging and artifact collection
- ✅ **Scalable Architecture**: Easy to add new test scenarios

### 8. **Key Design Decisions**

#### **Why MSW over Custom Mock Provider?**

**Before (Custom Mock Provider)**:
- ❌ 800+ lines of custom HTTP server code
- ❌ Complex setup and teardown
- ❌ Separate process management
- ❌ Port conflicts in CI
- ❌ Hard to debug network issues

**After (MSW)**:
- ✅ 200 lines of handler configuration
- ✅ Zero HTTP server setup
- ✅ Network-level interception
- ✅ No port management needed
- ✅ Better error messages
- ✅ Works seamlessly with Vitest

#### **MSW vs Real OAuth**
- **Default**: MSW for speed and reliability
- **Optional**: Real OAuth for release validation (manual trigger)
- **Rationale**: Avoids Google OAuth complexity (2FA, captchas, rate limits)

#### **Test User Management**
- **Pre-configured users** instead of dynamic creation
- **Namespace isolation** for concurrent test runs
- **Automatic cleanup** to prevent data accumulation

#### **Extension Testing Approach**
- **Real VS Code Extension Host** for accurate testing
- **Environment variables** for configuration
- **Spy utilities** for internal state verification

## Running the Tests

### Local Development
```bash
# Install dependencies
npm install

# Build the extension
npm run build:dev

# Run E2E tests locally
npm run test:e2e

# Run in watch mode for development
npm run test:e2e:watch
```

### CI/CD Pipeline
Tests automatically run on:
- Push to protected branches
- Pull requests
- Manual workflow dispatch

### Environment Variables
```bash
# Use mock OAuth provider (default)
MOCK_OAUTH_ENABLED=true

# Use real OAuth provider (requires secrets)
MOCK_OAUTH_ENABLED=false
SUPABASE_TEST_URL=<your-test-url>
SUPABASE_TEST_ANON_KEY=<your-test-key>
TEST_USER_REFRESH_TOKEN=<test-user-token>
```

## Troubleshooting

### Common Issues
1. **Test timeout**: Increase timeout in `test/e2e/suite/index.ts`
2. **Port conflicts**: Mock provider uses random port, but check for conflicts
3. **Display issues on Linux**: Ensure Xvfb is running in CI
4. **Extension not found**: Check `publisher` and `name` in package.json

### Debug Mode
```typescript
// Enable verbose logging in tests
process.env.DEBUG = 'true';
```

## Future Enhancements

1. **Performance Testing**: Measure authentication flow timing
2. **Load Testing**: Concurrent user authentication stress tests
3. **Integration with Supabase Test Project**: Real backend validation
4. **Visual Testing**: Screenshot comparisons for WebView components
5. **API Mocking**: Intercept and validate all HTTP requests
6. **Coverage Reporting**: Integrate with code coverage tools