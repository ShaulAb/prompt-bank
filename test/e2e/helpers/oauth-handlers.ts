import { http, HttpResponse } from 'msw';
import * as crypto from 'crypto';

// Test users with deterministic data
export const testUsers = {
  'test-user-001': {
    id: 'test-user-001',
    email: 'test-primary@promptbank.test',
    name: 'Test User Primary',
    accessToken: 'mock-access-token-001',
    refreshToken: 'mock-refresh-token-001',
  },
  'test-user-002': {
    id: 'test-user-002',
    email: 'test-secondary@promptbank.test',
    name: 'Test User Secondary',
    accessToken: 'mock-access-token-002',
    refreshToken: 'mock-refresh-token-002',
  },
};

// Store auth codes and tokens for validation
const authCodes = new Map<string, { userId: string; codeVerifier?: string; expiresAt: number }>();
const validTokens = new Set<string>(Object.values(testUsers).map(u => u.accessToken));

function generateAuthCode(userId: string, codeVerifier?: string): string {
  const code = `code-${crypto.randomBytes(8).toString('hex')}`;
  authCodes.set(code, {
    userId,
    codeVerifier,
    expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
  });
  return code;
}

function verifyPKCE(verifier: string, challenge: string): boolean {
  const hash = crypto.createHash('sha256').update(verifier).digest();
  const computed = hash.toString('base64url');
  return computed === challenge;
}

// OAuth 2.0 handlers for MSW
export const oauthHandlers = [
  // Authorization endpoint - handles OAuth login initiation
  http.get('*/auth/v1/authorize', ({ request }) => {
    const url = new URL(request.url);
    const redirectUri = url.searchParams.get('redirect_uri');
    const state = url.searchParams.get('state');
    const codeChallenge = url.searchParams.get('code_challenge');
    const userId = url.searchParams.get('test_user_id') || 'test-user-001';

    if (!redirectUri || !state) {
      return HttpResponse.json(
        { error: 'invalid_request', error_description: 'Missing required parameters' },
        { status: 400 }
      );
    }

    // Generate auth code
    const code = generateAuthCode(userId, codeChallenge || undefined);

    // Redirect back with authorization code
    const callbackUrl = new URL(redirectUri);
    callbackUrl.searchParams.set('code', code);
    callbackUrl.searchParams.set('state', state);

    return HttpResponse.redirect(callbackUrl.toString());
  }),

  // Token endpoint - handles authorization code exchange and refresh
  http.post('*/auth/v1/token', async ({ request }) => {
    const body = await request.formData();
    const grantType = body.get('grant_type');

    if (grantType === 'authorization_code') {
      const code = body.get('code') as string;
      const codeVerifier = body.get('code_verifier') as string;

      if (!code) {
        return HttpResponse.json(
          { error: 'invalid_request', error_description: 'Missing authorization code' },
          { status: 400 }
        );
      }

      const authCode = authCodes.get(code);
      if (!authCode || authCode.expiresAt < Date.now()) {
        return HttpResponse.json(
          { error: 'invalid_grant', error_description: 'Invalid or expired authorization code' },
          { status: 400 }
        );
      }

      // Verify PKCE if present (note: codeVerifier is the challenge, we verify against the verifier)
      if (authCode.codeVerifier && codeVerifier && !verifyPKCE(codeVerifier, authCode.codeVerifier)) {
        return HttpResponse.json(
          { error: 'invalid_grant', error_description: 'Invalid code verifier' },
          { status: 400 }
        );
      }

      const user = testUsers[authCode.userId as keyof typeof testUsers];
      if (!user) {
        return HttpResponse.json(
          { error: 'server_error', error_description: 'User not found' },
          { status: 500 }
        );
      }

      // Clean up used auth code
      authCodes.delete(code);

      return HttpResponse.json({
        access_token: user.accessToken,
        refresh_token: user.refreshToken,
        expires_in: 3600,
        token_type: 'Bearer',
        user: {
          id: user.id,
          email: user.email,
        },
      });
    }

    if (grantType === 'refresh_token') {
      const refreshToken = body.get('refresh_token') as string;

      if (!refreshToken) {
        return HttpResponse.json(
          { error: 'invalid_request', error_description: 'Missing refresh token' },
          { status: 400 }
        );
      }

      // Find user by refresh token
      const user = Object.values(testUsers).find(u => u.refreshToken === refreshToken);
      if (!user) {
        return HttpResponse.json(
          { error: 'invalid_grant', error_description: 'Invalid refresh token' },
          { status: 400 }
        );
      }

      // Generate new access token (in real scenario)
      const newAccessToken = `mock-access-token-${user.id}-${Date.now()}`;

      // Update valid tokens
      validTokens.delete(user.accessToken);
      validTokens.add(newAccessToken);
      user.accessToken = newAccessToken;

      return HttpResponse.json({
        access_token: newAccessToken,
        refresh_token: user.refreshToken,
        expires_in: 3600,
        token_type: 'Bearer',
        user: {
          id: user.id,
          email: user.email,
        },
      });
    }

    return HttpResponse.json(
      { error: 'unsupported_grant_type' },
      { status: 400 }
    );
  }),

  // User info endpoint - returns authenticated user details
  http.get('*/auth/v1/user', ({ request }) => {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json(
        { error: 'Unauthorized', error_description: 'Missing or invalid authorization header' },
        { status: 401 }
      );
    }

    const token = authHeader.substring(7);
    if (!validTokens.has(token)) {
      return HttpResponse.json(
        { error: 'Unauthorized', error_description: 'Invalid or expired token' },
        { status: 401 }
      );
    }

    // Find user by token
    const user = Object.values(testUsers).find(u => u.accessToken === token);
    if (!user) {
      return HttpResponse.json(
        { error: 'Internal Server Error', error_description: 'User not found' },
        { status: 500 }
      );
    }

    return HttpResponse.json({
      id: user.id,
      email: user.email,
      user_metadata: {
        name: user.name,
      },
    });
  }),

  // Special test endpoint for triggering OAuth callbacks
  http.get('*/test/trigger-callback', ({ request }) => {
    const url = new URL(request.url);
    const redirectUri = url.searchParams.get('redirect_uri');
    const userId = url.searchParams.get('user_id') || 'test-user-001';

    if (!redirectUri) {
      return HttpResponse.json(
        { error: 'Missing redirect_uri parameter' },
        { status: 400 }
      );
    }

    const code = generateAuthCode(userId);
    const state = `test-state-${Date.now()}`;

    const callbackUrl = new URL(redirectUri);
    callbackUrl.searchParams.set('code', code);
    callbackUrl.searchParams.set('state', state);

    return HttpResponse.json({
      callback_url: callbackUrl.toString(),
      code,
      state,
    });
  }),
];

// Helper functions for tests
export const oauthTestHelpers = {
  /**
   * Get test user by ID
   */
  getTestUser(id: keyof typeof testUsers) {
    return testUsers[id];
  },

  /**
   * Get all test users
   */
  getAllTestUsers() {
    return Object.values(testUsers);
  },

  /**
   * Simulate token expiry
   */
  expireToken(token: string) {
    validTokens.delete(token);
  },

  /**
   * Reset all tokens to initial state
   */
  resetTokens() {
    validTokens.clear();
    Object.values(testUsers).forEach(user => {
      validTokens.add(user.accessToken);
    });
  },

  /**
   * Generate authentication headers for a test user
   */
  getAuthHeaders(userId: keyof typeof testUsers) {
    const user = testUsers[userId];
    return {
      'Authorization': `Bearer ${user.accessToken}`,
      'Content-Type': 'application/json',
    };
  },

  /**
   * Clear all auth codes (for cleanup)
   */
  clearAuthCodes() {
    authCodes.clear();
  },

  /**
   * Get stats for debugging
   */
  getStats() {
    return {
      validTokens: validTokens.size,
      authCodes: authCodes.size,
      testUsers: Object.keys(testUsers).length,
    };
  },
};