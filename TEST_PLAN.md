# E2E Authentication Testing Plan

## ✅ IMPLEMENTATION COMPLETE

### Architecture Overview
**Implemented Approach**: GitHub Actions + Mock OAuth Provider + VS Code Extension Host + Test Harness

## Implemented Components

### 1. **Test Environment Setup**
- ✅ **Mock OAuth Provider** (`test/e2e/helpers/mock-oauth-provider.ts`)
  - HTTP server mimicking OAuth 2.0 flow
  - Support for PKCE validation
  - Pre-configured test users
  - Token generation and refresh
- ✅ **Test User Management** (`test/e2e/helpers/test-users.ts`)
  - Primary and secondary test users
  - Unique namespace per test run
  - Test data isolation
  - Cleanup utilities
- ✅ **GitHub Actions Workflows** (`.github/workflows/e2e-auth.yml`)
  - Multi-platform testing (Linux, Windows, macOS)
  - Matrix strategy for VS Code versions (stable, insiders)
  - Optional real OAuth provider support
  - Test result artifacts and reporting

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

#### ✅ **Core Authentication Tests** (`test/e2e/suite/auth.test.ts`)
1. **Full OAuth login flow** - Complete authentication with mock provider
2. **Token refresh mechanism** - Automatic token renewal on expiry
3. **URI callback handling** - VS Code URI handler integration
4. **Authentication cancellation** - User-initiated cancellation handling
5. **Network error recovery** - Graceful failure with retry capability
6. **Authentication persistence** - Token survival across restarts
7. **Logout functionality** - Complete session cleanup
8. **Concurrent authentication** - Race condition prevention
9. **PKCE validation** - Proof Key for Code Exchange security
10. **Expired refresh token** - Re-authentication on refresh failure
11. **Cross-editor compatibility** - Support for VS Code, Cursor, etc.

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

### 6. **Mock OAuth Provider Features**

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

#### **Mock OAuth vs Real OAuth**
- **Default**: Mock OAuth provider for speed and reliability
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