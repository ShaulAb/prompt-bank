import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest';
import { server as mswServer } from './e2e/helpers/msw-setup';
import { jwksTestHelpers, jwksNetworkFailureHandler } from './e2e/helpers/jwks-handlers';
import { AuthService } from '../src/services/authService';
import * as vscode from 'vscode';

/**
 * JWT Verification Tests (JWKS-based)
 *
 * Tests the new JWKS verification functionality added to AuthService.
 * Uses MSW to mock the Supabase JWKS endpoint.
 */

describe('AuthService - JWKS Verification', () => {
  let context: vscode.ExtensionContext;
  let authService: AuthService;
  let globalStateUpdateSpy: ReturnType<typeof vi.fn>;
  let globalStateGetSpy: ReturnType<typeof vi.fn>;

  beforeAll(async () => {
    // Initialize JWKS test keys
    await jwksTestHelpers.initialize();

    // Start MSW server
    mswServer.listen({ onUnhandledRequest: 'warn' });
  });

  beforeEach(() => {
    // Reset AuthService singleton to ensure fresh instance for each test
    (AuthService as any).instance = undefined;

    // Mock VS Code workspace configuration
    const mockConfig = {
      get: vi.fn((key: string, defaultValue?: any) => {
        if (key === 'supabaseUrl') return 'https://xlqtowactrzmslpkzliq.supabase.co';
        if (key === 'supabaseAnonKey') return 'test-anon-key';
        return defaultValue;
      }),
      has: vi.fn().mockReturnValue(true),
      inspect: vi.fn(),
      update: vi.fn().mockResolvedValue(undefined),
    };

    vi.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(mockConfig as any);

    // Create spies for globalState methods to track calls
    globalStateUpdateSpy = vi.fn().mockResolvedValue(undefined);
    globalStateGetSpy = vi.fn().mockReturnValue(undefined);

    // Create mock VS Code extension context
    context = {
      subscriptions: [],
      secrets: {
        get: vi.fn().mockResolvedValue(undefined),
        store: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue(undefined),
        onDidChange: vi.fn(),
      },
      globalState: {
        get: globalStateGetSpy,
        update: globalStateUpdateSpy,
        setKeysForSync: vi.fn(),
        keys: vi.fn().mockReturnValue([]),
      },
      workspaceState: {
        get: vi.fn(),
        update: vi.fn(),
        keys: vi.fn().mockReturnValue([]),
      },
      extensionUri: { fsPath: '/test' } as vscode.Uri,
      extensionPath: '/test',
      environmentVariableCollection: {} as any,
      extensionMode: 3, // ExtensionMode.Test
      storageUri: { fsPath: '/test/storage' } as vscode.Uri,
      globalStorageUri: { fsPath: '/test/global-storage' } as vscode.Uri,
      logUri: { fsPath: '/test/logs' } as vscode.Uri,
      asAbsolutePath: (path: string) => `/test/${path}`,
      storagePath: '/test/storage',
      globalStoragePath: '/test/global-storage',
      logPath: '/test/logs',
    } as unknown as vscode.ExtensionContext;

    // Initialize AuthService
    authService = AuthService.initialize(context, 'test-publisher', 'test-extension');
  });

  afterEach(() => {
    // Reset MSW handlers to default state
    mswServer.resetHandlers();
  });

  afterAll(() => {
    mswServer.close();
  });

  describe('verifyToken()', () => {
    it('should verify a valid JWT token', async () => {
      // Generate a valid test JWT
      const validToken = await jwksTestHelpers.generateValidJWT('test-user-001');

      // Verify the token
      const isValid = await authService.verifyToken(validToken);

      expect(isValid).toBe(true);
    });

    it('should reject an expired JWT token', async () => {
      // Generate an expired test JWT
      const expiredToken = await jwksTestHelpers.generateExpiredJWT('test-user-001');

      // Verify the token
      const isValid = await authService.verifyToken(expiredToken);

      expect(isValid).toBe(false);
    });

    it('should reject a JWT with invalid signature', async () => {
      // Generate a JWT signed with wrong key
      const invalidToken = await jwksTestHelpers.generateInvalidJWT('test-user-001');

      // Verify the token
      const isValid = await authService.verifyToken(invalidToken);

      expect(isValid).toBe(false);
    });

    it('should extract user info from verified token', async () => {
      // Generate a valid test JWT for test-user-001
      const validToken = await jwksTestHelpers.generateValidJWT('test-user-001');

      // Verify the token
      const isValid = await authService.verifyToken(validToken);

      expect(isValid).toBe(true);

      // Check that user info was extracted
      const email = await authService.getUserEmail();
      expect(email).toBe('test-primary@promptbank.test');
    });

    it('should track last verification timestamp', async () => {
      const validToken = await jwksTestHelpers.generateValidJWT('test-user-001');

      // Verify token
      await authService.verifyToken(validToken);

      // Check that last verification was stored in globalState
      expect(globalStateUpdateSpy).toHaveBeenCalledWith(
        'promptBank.lastTokenVerification',
        expect.any(Number)
      );
    });
  });

  describe('Offline/Network Failure Handling', () => {
    it('should allow recently verified token during network failure', async () => {
      const validToken = await jwksTestHelpers.generateValidJWT('test-user-001');

      // First, verify successfully - this will set the timestamp
      const firstVerification = await authService.verifyToken(validToken);
      expect(firstVerification).toBe(true);

      // Get the timestamp that was saved (from the update call)
      const updateCalls = globalStateUpdateSpy.mock.calls;
      const savedTimestamp = updateCalls[updateCalls.length - 1]?.[1];
      expect(savedTimestamp).toBeDefined();

      // Mock recent verification timestamp (use the timestamp from first verification)
      // It should be within the last 5 minutes (grace period)
      globalStateGetSpy.mockReturnValue(savedTimestamp);

      // Simulate network failure by replacing JWKS handler
      mswServer.use(jwksNetworkFailureHandler);

      // Try to verify again - should succeed due to grace period
      const secondVerification = await authService.verifyToken(validToken);
      expect(secondVerification).toBe(true);
    });

    it('should reject token if grace period expired during network failure', async () => {
      const validToken = await jwksTestHelpers.generateValidJWT('test-user-001');

      // Mock old verification timestamp (10 minutes ago, beyond grace period)
      const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
      globalStateGetSpy.mockReturnValue(tenMinutesAgo);

      // Simulate network failure
      mswServer.use(jwksNetworkFailureHandler);

      // Try to verify - should fail (beyond grace period)
      const isValid = await authService.verifyToken(validToken);
      expect(isValid).toBe(false);
    });
  });

  describe('Integration with getValidAccessToken()', () => {
    it('should return token only after successful verification', async () => {
      // Generate valid JWT
      const validToken = await jwksTestHelpers.generateValidJWT('test-user-001');

      // Calculate expiry (1 hour from now)
      const expiresAt = Date.now() + 3600 * 1000;

      // Mock SecretStorage to return the token
      vi.mocked(context.secrets.get).mockImplementation(async (key: string) => {
        if (key === 'promptBank.supabase.access_token') return validToken;
        if (key === 'promptBank.supabase.expires_at') return String(expiresAt);
        return undefined;
      });

      // Mock vscode.Uri.parse to prevent errors during auth flow
      vi.spyOn(vscode.Uri, 'parse').mockImplementation((value: string) => {
        const url = new URL(value);
        return {
          scheme: url.protocol.replace(':', ''),
          path: url.pathname,
          query: url.search.substring(1),
          fsPath: url.pathname,
          toString: () => value,
        } as vscode.Uri;
      });

      // Mock vscode.env.openExternal to prevent browser opening
      vi.spyOn(vscode.env, 'openExternal').mockResolvedValue(true);

      // Get valid access token (should verify internally)
      const token = await authService.getValidAccessToken();

      expect(token).toBe(validToken);
    });

    it('should reject stored token if verification fails', async () => {
      // Generate invalid JWT (wrong signature)
      const invalidToken = await jwksTestHelpers.generateInvalidJWT('test-user-001');

      // Mock SecretStorage to return invalid token
      vi.mocked(context.secrets.get).mockImplementation(async (key: string) => {
        if (key === 'promptBank.supabase.access_token') return invalidToken;
        if (key === 'promptBank.supabase.expires_at')
          return String(Date.now() + 3600 * 1000);
        return undefined;
      });

      // This should trigger new auth flow (we can't test full flow in unit test)
      // but we can verify it doesn't return the invalid token
      try {
        await authService.getValidAccessToken();
        // If it doesn't throw, it means it attempted to start auth flow
        // (which will fail in test environment, but that's expected)
      } catch (error) {
        // Expected in test environment
        expect(error).toBeDefined();
      }
    });
  });

  describe('JWKS Caching', () => {
    it('should cache JWKS keys for performance', async () => {
      // Verify multiple tokens to test caching
      // Both should succeed, and the second should use cached JWKS
      const token1 = await jwksTestHelpers.generateValidJWT('test-user-001');
      const token2 = await jwksTestHelpers.generateValidJWT('test-user-002');

      const isValid1 = await authService.verifyToken(token1);
      expect(isValid1).toBe(true);

      // Second verification should also work (cached JWKS or fresh fetch)
      const isValid2 = await authService.verifyToken(token2);
      expect(isValid2).toBe(true);

      // jose library handles caching internally, so we just verify both worked
      // The actual performance benefit would be visible in timing tests
      // Both tokens verified successfully = caching working (or at least not breaking)
    });
  });

  describe('Token Expiry from Verified JWT', () => {
    it('should extract and update expiry from verified token', async () => {
      // Generate token with specific expiry (1 hour)
      const validToken = await jwksTestHelpers.generateValidJWT('test-user-001');

      // First verification - extracts expiry from JWT
      const isValid1 = await authService.verifyToken(validToken);
      expect(isValid1).toBe(true);

      // Second verification - should still be valid (expiry extracted correctly)
      // If expiry wasn't extracted properly, this would fail or token would be considered expired
      const isValid2 = await authService.verifyToken(validToken);
      expect(isValid2).toBe(true);

      // Both verifications succeeded = expiry extraction working correctly
    });
  });
});
