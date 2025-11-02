import { http, HttpResponse } from 'msw';
import { SignJWT, exportJWK, generateKeyPair } from 'jose';
import { testUsers } from './oauth-handlers';

/**
 * JWKS Mock Handlers for Testing JWT Verification
 *
 * Provides mock JWKS endpoint and JWT generation utilities that match
 * the Supabase Auth JWKS format for testing purposes.
 */

// Generate a test RSA key pair (RS256) for signing JWTs
let testKeyPair: { publicKey: CryptoKey; privateKey: CryptoKey } | null = null;
let testPublicJWK: any = null;

const TEST_KEY_ID = 'test-key-id-001';
const SUPABASE_URL = 'https://xlqtowactrzmslpkzliq.supabase.co';

/**
 * Initialize test key pair (call once before tests)
 */
export async function initializeTestKeys(): Promise<void> {
  if (testKeyPair) {
    return; // Already initialized
  }

  testKeyPair = await generateKeyPair('RS256', { extractable: true });
  testPublicJWK = await exportJWK(testKeyPair.publicKey);
  testPublicJWK.kid = TEST_KEY_ID;
  testPublicJWK.use = 'sig';
  testPublicJWK.alg = 'RS256';
}

/**
 * Generate a signed JWT for a test user
 *
 * @param userId - Test user ID (e.g., 'test-user-001')
 * @param expiresIn - Expiration time in seconds (default: 3600 = 1 hour)
 * @returns Signed JWT token
 */
export async function generateTestJWT(
  userId: keyof typeof testUsers,
  expiresIn: number = 3600
): Promise<string> {
  await initializeTestKeys();

  if (!testKeyPair) {
    throw new Error('Test key pair not initialized');
  }

  const user = testUsers[userId];
  if (!user) {
    throw new Error(`Unknown test user: ${userId}`);
  }

  const now = Math.floor(Date.now() / 1000);

  const jwt = await new SignJWT({
    sub: user.id,
    email: user.email,
    aud: 'authenticated',
    role: 'authenticated',
    aal: 'aal1',
    session_id: `session-${user.id}-${now}`,
  })
    .setProtectedHeader({
      alg: 'RS256',
      kid: TEST_KEY_ID,
      typ: 'JWT',
    })
    .setIssuer(`${SUPABASE_URL}/auth/v1`)
    .setIssuedAt(now)
    .setExpirationTime(now + expiresIn)
    .sign(testKeyPair.privateKey);

  return jwt;
}

/**
 * Generate an expired JWT for testing expiration scenarios
 */
export async function generateExpiredJWT(userId: keyof typeof testUsers): Promise<string> {
  await initializeTestKeys();

  if (!testKeyPair) {
    throw new Error('Test key pair not initialized');
  }

  const user = testUsers[userId];
  const now = Math.floor(Date.now() / 1000);
  const pastTime = now - 7200; // 2 hours ago

  const jwt = await new SignJWT({
    sub: user.id,
    email: user.email,
    aud: 'authenticated',
    role: 'authenticated',
  })
    .setProtectedHeader({
      alg: 'RS256',
      kid: TEST_KEY_ID,
      typ: 'JWT',
    })
    .setIssuer(`${SUPABASE_URL}/auth/v1`)
    .setIssuedAt(pastTime)
    .setExpirationTime(pastTime + 3600) // Expired 1 hour ago
    .sign(testKeyPair.privateKey);

  return jwt;
}

/**
 * Generate a JWT with invalid signature (for testing verification failures)
 */
export async function generateInvalidSignatureJWT(
  userId: keyof typeof testUsers
): Promise<string> {
  // Generate a different key pair for this token
  const invalidKeyPair = await generateKeyPair('RS256', { extractable: true });

  const user = testUsers[userId];
  const now = Math.floor(Date.now() / 1000);

  const jwt = await new SignJWT({
    sub: user.id,
    email: user.email,
    aud: 'authenticated',
    role: 'authenticated',
  })
    .setProtectedHeader({
      alg: 'RS256',
      kid: TEST_KEY_ID, // Same kid, but different key!
      typ: 'JWT',
    })
    .setIssuer(`${SUPABASE_URL}/auth/v1`)
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(invalidKeyPair.privateKey); // Signed with wrong key

  return jwt;
}

/**
 * MSW handler for JWKS endpoint
 *
 * Returns the public keys in JWKS format matching Supabase's structure
 */
export const jwksHandler = http.get('*/auth/v1/.well-known/jwks.json', async () => {
  await initializeTestKeys();

  if (!testPublicJWK) {
    return HttpResponse.json(
      { error: 'JWKS not initialized' },
      { status: 500 }
    );
  }

  // Return JWKS format matching Supabase structure
  return HttpResponse.json({
    keys: [testPublicJWK],
  });
});

/**
 * MSW handler for simulating JWKS network failures
 *
 * Use this to test offline/network failure scenarios
 */
export const jwksNetworkFailureHandler = http.get(
  '*/auth/v1/.well-known/jwks.json',
  () => {
    return HttpResponse.error();
  }
);

/**
 * MSW handler for simulating JWKS timeout
 */
export const jwksTimeoutHandler = http.get(
  '*/auth/v1/.well-known/jwks.json',
  async () => {
    // Simulate long delay (longer than 5s timeout)
    await new Promise(resolve => setTimeout(resolve, 10000));
    return HttpResponse.json({ keys: [] });
  }
);

/**
 * Enhanced OAuth token handler that returns signed JWTs
 *
 * Use this to replace the token endpoint in oauth-handlers.ts for JWKS testing
 */
export const enhancedTokenHandler = http.post('*/auth/v1/token', async ({ request }) => {
  const body = await request.json();
  const grantType = body.grant_type;

  if (grantType === 'pkce') {
    const authCode = body.auth_code;
    const codeVerifier = body.code_verifier;

    if (!authCode || !codeVerifier) {
      return HttpResponse.json(
        { error: 'invalid_request', error_description: 'Missing parameters' },
        { status: 400 }
      );
    }

    // For testing, assume test-user-001
    const userId = 'test-user-001' as keyof typeof testUsers;
    const user = testUsers[userId];

    // Generate real JWT token
    const accessToken = await generateTestJWT(userId);

    return HttpResponse.json({
      access_token: accessToken,
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
    const refreshToken = body.refresh_token;

    // Find user by refresh token
    const userEntry = Object.entries(testUsers).find(
      ([, user]) => user.refreshToken === refreshToken
    );

    if (!userEntry) {
      return HttpResponse.json(
        { error: 'invalid_grant', error_description: 'Invalid refresh token' },
        { status: 400 }
      );
    }

    const [userId, user] = userEntry;

    // Generate new JWT token
    const accessToken = await generateTestJWT(userId as keyof typeof testUsers);

    return HttpResponse.json({
      access_token: accessToken,
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
});

/**
 * Test utilities for JWKS-based auth testing
 */
export const jwksTestHelpers = {
  /**
   * Initialize test keys (call before running tests)
   */
  async initialize() {
    await initializeTestKeys();
  },

  /**
   * Generate a valid JWT for testing
   */
  async generateValidJWT(userId: keyof typeof testUsers = 'test-user-001') {
    return await generateTestJWT(userId);
  },

  /**
   * Generate an expired JWT for testing
   */
  async generateExpiredJWT(userId: keyof typeof testUsers = 'test-user-001') {
    return await generateExpiredJWT(userId);
  },

  /**
   * Generate JWT with invalid signature
   */
  async generateInvalidJWT(userId: keyof typeof testUsers = 'test-user-001') {
    return await generateInvalidSignatureJWT(userId);
  },

  /**
   * Get the test key ID
   */
  getTestKeyId() {
    return TEST_KEY_ID;
  },

  /**
   * Get the public JWK for manual verification
   */
  async getPublicJWK() {
    await initializeTestKeys();
    return testPublicJWK;
  },
};
