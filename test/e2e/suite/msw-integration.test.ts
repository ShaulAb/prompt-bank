#!/usr/bin/env tsx

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { setupServer } from 'msw/node';
import { oauthHandlers, oauthTestHelpers } from '../helpers/oauth-handlers';
import fetch from 'node-fetch';

// This tests the Vitest + MSW integration without VS Code
const server = setupServer(...oauthHandlers);

beforeAll(() => {
  console.log('🔄 Starting MSW server for Vitest tests...');
  server.listen({ onUnhandledRequest: 'warn' });
});

afterEach(() => {
  server.resetHandlers();
  oauthTestHelpers.resetTokens();
});

afterAll(() => {
  console.log('🔄 Stopping MSW server...');
  server.close();
});

describe('MSW + Vitest Integration Tests', () => {
  it('should handle OAuth authorization flow', async () => {
    const testUser = oauthTestHelpers.getTestUser('test-user-001');
    expect(testUser.email).toBe('test-primary@promptbank.test');

    // Test authorization endpoint
    const authUrl = 'https://test-oauth.local/auth/v1/authorize?' +
      'response_type=code&' +
      'client_id=test-client&' +
      'redirect_uri=vscode://prestissimo.prompt-bank/auth/callback&' +
      'state=test-state';

    const authResponse = await fetch(authUrl, { redirect: 'manual' });
    expect(authResponse.status).toBe(302);

    const location = authResponse.headers.get('location');
    expect(location).toBeTruthy();

    const callbackUrl = new URL(location!);
    const code = callbackUrl.searchParams.get('code');
    const state = callbackUrl.searchParams.get('state');

    expect(code).toBeTruthy();
    expect(state).toBe('test-state');
  });

  it('should exchange authorization code for tokens', async () => {
    // Get auth code first
    const authResponse = await fetch('https://test-oauth.local/auth/v1/authorize?response_type=code&client_id=test&redirect_uri=vscode://test&state=test', { redirect: 'manual' });
    const location = authResponse.headers.get('location');
    const code = new URL(location!).searchParams.get('code');

    // Exchange for tokens
    const tokenBody = new URLSearchParams({
      grant_type: 'authorization_code',
      code: code!,
      client_id: 'test-client',
    });

    const tokenResponse = await fetch('https://test-oauth.local/auth/v1/token', {
      method: 'POST',
      body: tokenBody,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    expect(tokenResponse.ok).toBe(true);

    const tokenData = await tokenResponse.json() as any;
    expect(tokenData.access_token).toBeTruthy();
    expect(tokenData.refresh_token).toBeTruthy();
    expect(tokenData.token_type).toBe('Bearer');
    expect(tokenData.expires_in).toBe(3600);
  });

  it('should retrieve user info with valid token', async () => {
    const testUser = oauthTestHelpers.getTestUser('test-user-001');
    const headers = oauthTestHelpers.getAuthHeaders('test-user-001');

    const userResponse = await fetch('https://test-oauth.local/auth/v1/user', {
      headers,
    });

    expect(userResponse.ok).toBe(true);

    const userData = await userResponse.json() as any;
    expect(userData.id).toBe(testUser.id);
    expect(userData.email).toBe(testUser.email);
    expect(userData.user_metadata.name).toBe(testUser.name);
  });

  it('should handle token refresh correctly', async () => {
    const testUser = oauthTestHelpers.getTestUser('test-user-001');
    const originalToken = testUser.accessToken;

    const refreshBody = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: testUser.refreshToken,
    });

    const refreshResponse = await fetch('https://test-oauth.local/auth/v1/token', {
      method: 'POST',
      body: refreshBody,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    expect(refreshResponse.ok).toBe(true);

    const refreshData = await refreshResponse.json() as any;
    expect(refreshData.access_token).toBeTruthy();
    expect(refreshData.access_token).not.toBe(originalToken); // Should be new token
    expect(refreshData.refresh_token).toBe(testUser.refreshToken); // Should preserve refresh token

    // Verify new token works
    const userResponse = await fetch('https://test-oauth.local/auth/v1/user', {
      headers: {
        'Authorization': `Bearer ${refreshData.access_token}`,
      },
    });
    expect(userResponse.ok).toBe(true);
  });

  it('should reject invalid tokens', async () => {
    const userResponse = await fetch('https://test-oauth.local/auth/v1/user', {
      headers: {
        'Authorization': 'Bearer invalid-token-12345',
      },
    });

    expect(userResponse.status).toBe(401);

    const errorData = await userResponse.json() as any;
    expect(errorData.error).toBe('Unauthorized');
  });

  it('should handle expired tokens', async () => {
    const testUser = oauthTestHelpers.getTestUser('test-user-001');

    // Expire the token
    oauthTestHelpers.expireToken(testUser.accessToken);

    const userResponse = await fetch('https://test-oauth.local/auth/v1/user', {
      headers: {
        'Authorization': `Bearer ${testUser.accessToken}`,
      },
    });

    expect(userResponse.status).toBe(401);
  });

  it('should validate helper functions', () => {
    const stats = oauthTestHelpers.getStats();
    expect(stats.testUsers).toBe(2);
    expect(stats.validTokens).toBeGreaterThan(0);

    const allUsers = oauthTestHelpers.getAllTestUsers();
    expect(allUsers).toHaveLength(2);

    const primaryUser = oauthTestHelpers.getTestUser('test-user-001');
    expect(primaryUser.email).toBe('test-primary@promptbank.test');

    const secondaryUser = oauthTestHelpers.getTestUser('test-user-002');
    expect(secondaryUser.email).toBe('test-secondary@promptbank.test');
  });
});

// Run the tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('🔄 Running Vitest integration tests...');

  import('vitest/node').then(async ({ startVitest }) => {
    const vitest = await startVitest('test', [__filename], {
      reporter: 'verbose',
      run: true,
    });

    if (vitest) {
      await vitest.close();
    }
  });
}