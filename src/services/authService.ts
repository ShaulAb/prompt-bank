import * as vscode from 'vscode';
import { jwtVerify, createRemoteJWKSet, type JWTPayload } from 'jose';

// Supabase API response types
interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user?: {
    id: string;
    email: string;
  };
}

interface UserResponse {
  id: string;
  email: string;
}

// Supabase JWT payload structure
interface SupabaseJWTPayload extends JWTPayload {
  sub: string;
  email?: string;
  email_verified?: boolean;
  phone?: string;
  aud: string;
  role: string;
  aal?: string;
  session_id?: string;
  user_metadata?: Record<string, unknown>; // Additional user metadata
  app_metadata?: Record<string, unknown>; // Application metadata
}

export class AuthService {
  private static instance: AuthService | undefined;

  private token: string | undefined;
  private refreshToken: string | undefined;
  private expiresAt: number | undefined;
  private userId: string | undefined;
  private userEmail: string | undefined;

  // Supabase project URL and anon key
  private readonly supabaseUrl: string;
  private readonly supabaseAnonKey: string;
  private readonly publisher: string;
  private readonly extensionName: string;

  // SecretStorage keys
  private readonly TOKEN_KEY = 'promptBank.supabase.access_token';
  private readonly REFRESH_KEY = 'promptBank.supabase.refresh_token';
  private readonly EXPIRY_KEY = 'promptBank.supabase.expires_at';
  private readonly USER_ID_KEY = 'promptBank.supabase.user_id';
  private readonly USER_EMAIL_KEY = 'promptBank.supabase.user_email';

  // JWKS verification settings
  private readonly JWKS_CACHE_TTL = 10 * 60 * 1000; // 10 minutes (matches Supabase Edge cache)
  private readonly LAST_VERIFICATION_KEY = 'promptBank.lastTokenVerification';
  private readonly OFFLINE_GRACE_PERIOD = 5 * 60 * 1000; // 5 minutes for offline scenarios

  private constructor(
    private context: vscode.ExtensionContext,
    publisher: string,
    extensionName: string
  ) {
    const cfg = vscode.workspace.getConfiguration('promptBank');
    this.supabaseUrl = cfg.get<string>('supabaseUrl', 'https://xlqtowactrzmslpkzliq.supabase.co');
    this.supabaseAnonKey = cfg.get<string>(
      'supabaseAnonKey',
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhscXRvd2FjdHJ6bXNscGt6bGlxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTIyMDAzMzQsImV4cCI6MjA2Nzc3NjMzNH0.cUVLqlGGWfaxDs49AQ57rHxruj52MphG9jV1e0F1UYo'
    );
    this.publisher = publisher;
    this.extensionName = extensionName;
  }

  /**
   * Initialise the singleton. Must be called once from extension activation.
   */
  public static initialize(
    context: vscode.ExtensionContext,
    publisher: string,
    extensionName: string
  ): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService(context, publisher, extensionName);
    }
    return AuthService.instance;
  }

  /**
   * Retrieve the existing instance. Throws if not yet initialised.
   */
  public static get(): AuthService {
    if (!AuthService.instance) {
      throw new Error('AuthService not initialised. Call initialize() first.');
    }
    return AuthService.instance;
  }

  /**
   * Return a valid access token, triggering sign-in if required.
   * Now includes JWKS verification for enhanced security.
   */
  public async getValidAccessToken(): Promise<string> {
    await this.loadFromSecretStorage();

    // Check if token exists and verify via JWKS
    if (this.token) {
      try {
        const isValid = await this.verifyToken(this.token);

        // Token is verified and not expired
        if (isValid && this.expiresAt && Date.now() < this.expiresAt) {
          return this.token;
        }
      } catch (error) {
        // Check if this is an invalid JWT error (e.g., after key migration)
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.includes('signature') || errorMessage.includes('invalid')) {
          console.warn(
            '[AuthService] Detected invalid JWT (likely after key migration). Clearing tokens...'
          );
          await this.clearInvalidTokens();
          // Continue to new auth flow below
          return this.beginGoogleAuthFlow();
        }
        // For other errors, continue with refresh attempt
      }
    }

    // Token invalid or expired, try refresh
    if (this.refreshToken) {
      try {
        await this.refreshAccessToken();

        // Verify refreshed token
        if (this.token && (await this.verifyToken(this.token))) {
          return this.token;
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('[AuthService] Failed to refresh token:', errorMessage);

        // If refresh fails with invalid JWT, clear tokens
        if (errorMessage.includes('signature') || errorMessage.includes('invalid')) {
          console.warn('[AuthService] Refresh token also invalid. Clearing all tokens...');
          await this.clearInvalidTokens();
        }
      }
    }

    // Start new auth flow
    return this.beginGoogleAuthFlow();
  }

  /**
   * Verify JWT token via JWKS endpoint
   *
   * Uses jose library with built-in JWKS caching for performance.
   * Implements offline grace period for network failures.
   *
   * @param token - JWT access token to verify
   * @returns true if token is valid and verified
   */
  public async verifyToken(token: string): Promise<boolean> {
    try {
      // Use jose's createRemoteJWKSet with built-in caching
      const JWKS = createRemoteJWKSet(
        new URL(`${this.supabaseUrl}/auth/v1/.well-known/jwks.json`),
        {
          cacheMaxAge: this.JWKS_CACHE_TTL, // 10 minutes
          timeoutDuration: 5000, // 5 second timeout for network requests
        }
      );

      // Verify JWT signature and claims
      const { payload } = await jwtVerify<SupabaseJWTPayload>(token, JWKS, {
        issuer: `${this.supabaseUrl}/auth/v1`,
        audience: 'authenticated',
        clockTolerance: 60, // Allow 1 minute clock skew
      });

      // Extract and cache user info from verified token
      // This is more reliable than stored values
      this.userId = payload.sub;
      // Extract email - could be in payload.email or user_metadata
      this.userEmail =
        (payload.email as string) ||
        (payload.user_metadata?.email as string | undefined) ||
        undefined;
      this.expiresAt = (payload.exp as number) * 1000; // Convert to milliseconds

      // Track last successful verification for offline scenarios
      await this.context.globalState.update(this.LAST_VERIFICATION_KEY, Date.now());

      console.log(
        `[AuthService] JWT verified successfully for user: ${this.userEmail} (expires: ${new Date(this.expiresAt).toISOString()})`
      );

      return true;
    } catch (error) {
      // More descriptive error logging for debugging
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[AuthService] JWT verification failed:', errorMessage);

      // Log specific error types for easier debugging
      if (errorMessage.includes('expired')) {
        console.warn('[AuthService] Token has expired');
      } else if (errorMessage.includes('signature')) {
        console.error('[AuthService] Token signature verification failed - possible key rotation');
      } else if (errorMessage.includes('network') || errorMessage.includes('fetch')) {
        console.warn('[AuthService] Network error during JWKS fetch');
      }

      // Offline/network failure handling: Check for recent verification
      const lastVerification = this.context.globalState.get<number>(this.LAST_VERIFICATION_KEY);

      if (lastVerification && Date.now() - lastVerification < this.OFFLINE_GRACE_PERIOD) {
        // Token was recently verified successfully, allow offline use
        console.warn(
          '[AuthService] Network failure during verification, but token was recently verified. Allowing offline use.'
        );
        return true;
      }

      // Verification failed and no recent verification - token is invalid
      return false;
    }
  }

  /**
   * Get the current user's email if authenticated
   */
  public async getUserEmail(): Promise<string | undefined> {
    // If email is already in memory (e.g., from verifyToken), return it
    if (this.userEmail) {
      return this.userEmail;
    }
    // Otherwise, load from storage
    await this.loadFromSecretStorage();
    return this.userEmail;
  }

  /**
   * Get the current refresh token if authenticated
   */
  public async getRefreshToken(): Promise<string | undefined> {
    await this.loadFromSecretStorage();
    return this.refreshToken;
  }

  /**
   * Sign out and clear stored credentials
   */
  public async signOut(): Promise<void> {
    // Call Supabase signout endpoint
    if (this.token) {
      try {
        await fetch(`${this.supabaseUrl}/auth/v1/logout`, {
          method: 'POST',
          headers: {
            apikey: this.supabaseAnonKey,
            Authorization: `Bearer ${this.token}`,
            'Content-Type': 'application/json',
          },
        });
      } catch (error) {
        console.error('[AuthService] Error during signout:', error);
      }
    }

    // Clear local storage
    this.token = undefined;
    this.refreshToken = undefined;
    this.expiresAt = undefined;
    this.userId = undefined;
    this.userEmail = undefined;

    await this.context.secrets.delete(this.TOKEN_KEY);
    await this.context.secrets.delete(this.REFRESH_KEY);
    await this.context.secrets.delete(this.EXPIRY_KEY);
    await this.context.secrets.delete(this.USER_ID_KEY);
    await this.context.secrets.delete(this.USER_EMAIL_KEY);

    // Clear last verification timestamp to avoid stale state
    await this.context.globalState.update(this.LAST_VERIFICATION_KEY, undefined);

    vscode.window.showInformationMessage('Signed out successfully');
  }

  /**
   * Clear invalid tokens without calling Supabase logout endpoint
   *
   * Used for automatic recovery when tokens become invalid (e.g., after JWT key migration).
   * Unlike signOut(), this doesn't attempt to call Supabase's logout endpoint since
   * the token is already invalid.
   */
  public async clearInvalidTokens(): Promise<void> {
    console.log('[AuthService] Clearing invalid tokens');

    // Clear in-memory state
    this.token = undefined;
    this.refreshToken = undefined;
    this.expiresAt = undefined;
    this.userId = undefined;
    this.userEmail = undefined;

    // Clear stored secrets
    await this.context.secrets.delete(this.TOKEN_KEY);
    await this.context.secrets.delete(this.REFRESH_KEY);
    await this.context.secrets.delete(this.EXPIRY_KEY);
    await this.context.secrets.delete(this.USER_ID_KEY);
    await this.context.secrets.delete(this.USER_EMAIL_KEY);

    // Clear last verification timestamp
    await this.context.globalState.update(this.LAST_VERIFICATION_KEY, undefined);
  }

  // ────────────────────────────────────────────────────────────────────────────────
  // Internal helpers
  // ────────────────────────────────────────────────────────────────────────────────

  private async loadFromSecretStorage(): Promise<void> {
    if (!this.token) {
      this.token = (await this.context.secrets.get(this.TOKEN_KEY)) || undefined;
      this.refreshToken = (await this.context.secrets.get(this.REFRESH_KEY)) || undefined;
      const expiryStr = await this.context.secrets.get(this.EXPIRY_KEY);
      this.expiresAt = expiryStr ? Number(expiryStr) : undefined;
      this.userId = (await this.context.secrets.get(this.USER_ID_KEY)) || undefined;
      this.userEmail = (await this.context.secrets.get(this.USER_EMAIL_KEY)) || undefined;
    }
  }

  private async saveToSecretStorage(): Promise<void> {
    if (this.token) {
      await this.context.secrets.store(this.TOKEN_KEY, this.token);
    }
    if (this.refreshToken) {
      await this.context.secrets.store(this.REFRESH_KEY, this.refreshToken);
    }
    if (this.expiresAt) {
      await this.context.secrets.store(this.EXPIRY_KEY, this.expiresAt.toString());
    }
    if (this.userId) {
      await this.context.secrets.store(this.USER_ID_KEY, this.userId);
    }
    if (this.userEmail) {
      await this.context.secrets.store(this.USER_EMAIL_KEY, this.userEmail);
    }
  }

  private async refreshAccessToken(): Promise<void> {
    if (!this.refreshToken) {
      throw new Error('No refresh token available');
    }

    const response = await fetch(`${this.supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: {
        apikey: this.supabaseAnonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        refresh_token: this.refreshToken,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to refresh token: ${errorText}`);
    }

    const data = (await response.json()) as TokenResponse;

    this.token = data.access_token;
    this.refreshToken = data.refresh_token;
    this.expiresAt = Date.now() + data.expires_in * 1000;

    // Verify the refreshed token immediately
    const isValid = await this.verifyToken(data.access_token);
    if (!isValid) {
      throw new Error('Refreshed token verification failed');
    }

    // User info is now extracted by verifyToken, but keep fallback
    if (data.user) {
      this.userId = data.user.id;
      this.userEmail = data.user.email;
    }

    await this.saveToSecretStorage();
  }

  private async beginGoogleAuthFlow(): Promise<string> {
    const redirectUri = await this.getRedirectUri();

    // Generate PKCE challenge
    const codeVerifier = this.generateCodeVerifier();
    const codeChallenge = await this.generateCodeChallenge(codeVerifier);

    // Store code verifier for later
    await this.context.globalState.update('promptBank.pkce.verifier', codeVerifier);

    // Build Google OAuth URL via Supabase
    const authUrl = new URL(`${this.supabaseUrl}/auth/v1/authorize`);
    authUrl.searchParams.set('provider', 'google');
    authUrl.searchParams.set('redirect_to', redirectUri);
    authUrl.searchParams.set('code_challenge', codeChallenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');

    // Open browser for authentication
    const authUri = vscode.Uri.parse(authUrl.toString());
    await vscode.env.openExternal(authUri);

    // Wait for callback
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Authentication timeout'));
      }, 120000); // 2 minute timeout

      // Register URI handler for callback
      const disposable = vscode.window.registerUriHandler({
        handleUri: async (uri: vscode.Uri) => {
          if (uri.path === '/auth-callback') {
            clearTimeout(timeout);
            disposable.dispose();

            try {
              await this.handleAuthCallback(uri, codeVerifier);
              if (this.token) {
                resolve(this.token);
              } else {
                reject(new Error('Failed to obtain access token'));
              }
            } catch (error) {
              reject(error);
            }
          }
        },
      });
    });
  }

  private async handleAuthCallback(uri: vscode.Uri, codeVerifier: string): Promise<void> {
    const params = new URLSearchParams(uri.query);
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    const expiresIn = params.get('expires_in');
    const error = params.get('error');
    const errorDescription = params.get('error_description');

    if (error) {
      throw new Error(`Authentication failed: ${errorDescription || error}`);
    }

    if (!accessToken) {
      // If no direct token, try to exchange code
      const code = params.get('code');
      if (!code) {
        throw new Error('No access token or authorization code received');
      }

      await this.exchangeCodeForToken(code, codeVerifier);
      return;
    }

    // Store tokens
    this.token = accessToken;
    this.refreshToken = refreshToken || undefined;
    this.expiresAt = expiresIn ? Date.now() + parseInt(expiresIn) * 1000 : undefined;

    // Verify the token immediately after obtaining it
    const isValid = await this.verifyToken(accessToken);
    if (!isValid) {
      throw new Error('Token verification failed after authentication');
    }

    // Get user info (this might be redundant now that verifyToken extracts it)
    await this.fetchUserInfo();

    // Save everything
    await this.saveToSecretStorage();

    vscode.window.showInformationMessage(
      `✅ Signed in successfully as ${this.userEmail || 'user'}`
    );
  }

  private async exchangeCodeForToken(code: string, codeVerifier: string): Promise<void> {
    const redirectUri = await this.getRedirectUri();

    const response = await fetch(`${this.supabaseUrl}/auth/v1/token?grant_type=pkce`, {
      method: 'POST',
      headers: {
        apikey: this.supabaseAnonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        auth_code: code,
        code_verifier: codeVerifier,
        redirect_uri: redirectUri,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to exchange code for token: ${errorText}`);
    }

    const data = (await response.json()) as TokenResponse;

    this.token = data.access_token;
    this.refreshToken = data.refresh_token;
    this.expiresAt = Date.now() + data.expires_in * 1000;

    // Verify the token immediately after obtaining it
    const isValid = await this.verifyToken(data.access_token);
    if (!isValid) {
      throw new Error('Token verification failed after code exchange');
    }

    // User info is now extracted by verifyToken, but keep fallback
    if (data.user) {
      this.userId = data.user.id;
      this.userEmail = data.user.email;
    }

    await this.saveToSecretStorage();

    vscode.window.showInformationMessage(
      `✅ Signed in successfully as ${this.userEmail || 'user'}`
    );
  }

  private async fetchUserInfo(): Promise<void> {
    if (!this.token) return;

    try {
      const response = await fetch(`${this.supabaseUrl}/auth/v1/user`, {
        headers: {
          apikey: this.supabaseAnonKey,
          Authorization: `Bearer ${this.token}`,
        },
      });

      if (response.ok) {
        const data = (await response.json()) as UserResponse;
        this.userId = data.id;
        this.userEmail = data.email;
      }
    } catch (error) {
      console.error('[AuthService] Failed to fetch user info:', error);
    }
  }

  private async getRedirectUri(): Promise<string> {
    const extensionId = `${this.publisher}.${this.extensionName}`;

    // Detect editor type and use appropriate URI scheme
    const uriScheme = this.detectEditorUriScheme();

    console.log('[AuthService] Using extension ID for redirect:', extensionId);
    console.log('[AuthService] Using URI scheme:', uriScheme);

    return `${uriScheme}://${extensionId}/auth-callback`;
  }

  private detectEditorUriScheme(): string {
    // PROPER SOLUTION: Use the official VS Code API to get URI scheme
    // This works correctly in both VS Code and Cursor without system modifications
    try {
      if (vscode.env.uriScheme) {
        console.log('[AuthService] Using official vscode.env.uriScheme:', vscode.env.uriScheme);
        return vscode.env.uriScheme;
      }
    } catch (error) {
      console.log('[AuthService] Could not access vscode.env.uriScheme:', error);
    }

    // Fallback: Check app name for debugging info, but still use vscode scheme
    try {
      if (vscode.env.appName) {
        const appName = vscode.env.appName.toLowerCase();
        console.log('[AuthService] Detected app name:', appName);
      }
    } catch (error) {
      console.log('[AuthService] Could not access vscode.env.appName:', error);
    }

    // Safe fallback to vscode scheme
    console.log('[AuthService] Falling back to vscode URI scheme');
    return 'vscode';
  }

  private generateCodeVerifier(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return this.base64UrlEncode(array);
  }

  private async generateCodeChallenge(verifier: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return this.base64UrlEncode(new Uint8Array(hash));
  }

  private base64UrlEncode(array: Uint8Array): string {
    return btoa(String.fromCharCode(...array))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }
}
