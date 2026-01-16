import * as vscode from 'vscode';
import { jwtVerify, createRemoteJWKSet, type JWTPayload } from 'jose';
import { getSupabaseConfig } from '../config/supabase';

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

  /**
   * Create a new AuthService instance using dependency injection.
   *
   * @param context - VS Code extension context
   * @param publisher - Extension publisher name
   * @param extensionName - Extension name
   */
  constructor(
    private context: vscode.ExtensionContext,
    publisher: string,
    extensionName: string
  ) {
    const config = getSupabaseConfig();
    this.supabaseUrl = config.url;
    this.supabaseAnonKey = config.publishableKey;
    this.publisher = publisher;
    this.extensionName = extensionName;
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

  /**
   * Begin Device Flow authentication
   *
   * Uses OAuth Device Flow (RFC 8628) for reliable authentication:
   * 1. Request device code from website API
   * 2. Open browser to website's device auth page
   * 3. Poll for completion while user authenticates
   * 4. Return access token once complete
   */
  private async beginGoogleAuthFlow(): Promise<string> {
    const config = getSupabaseConfig();
    const websiteUrl = config.websiteUrl;

    // Step 1: Initiate device flow
    console.log('[AuthService] Initiating device flow...');
    const initiateResponse = await fetch(`${websiteUrl}/api/auth/device/initiate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'PromptBank-VSCode/0.10.0',
      },
    });

    if (!initiateResponse.ok) {
      // Handle rate limiting
      if (initiateResponse.status === 429) {
        const errorData = await initiateResponse.json().catch(() => ({}));
        const retryAfter = errorData.retry_after || 600;
        throw new Error(
          `Too many authentication requests. Please wait ${Math.ceil(retryAfter / 60)} minutes and try again.`
        );
      }
      const error = await initiateResponse.text();
      throw new Error(`Failed to initiate device flow: ${error}`);
    }

    const deviceData = await initiateResponse.json();
    const { device_code, verification_url, expires_in, interval } = deviceData;

    console.log('[AuthService] Device flow initiated, opening browser...');

    // Step 2: Open browser to verification URL
    const verificationUri = vscode.Uri.parse(verification_url);
    await vscode.env.openExternal(verificationUri);

    // Show user instructions
    vscode.window.showInformationMessage(
      'A browser window has opened. Please sign in with Google to connect your account.'
    );

    // Step 3: Poll for completion with validated parameters
    // Validate polling parameters to prevent malformed data issues
    const rawInterval = typeof interval === 'number' ? interval : 2;
    const rawExpiresIn = typeof expires_in === 'number' ? expires_in : 600;
    const pollIntervalSeconds = Math.max(1, Math.min(rawInterval, 10)); // 1-10 seconds
    const expiresInSeconds = Math.max(60, Math.min(rawExpiresIn, 3600)); // 1-60 minutes
    const pollInterval = pollIntervalSeconds * 1000;
    const maxAttempts = Math.floor(expiresInSeconds / pollIntervalSeconds);
    let attempts = 0;

    console.log(
      `[AuthService] Starting to poll (interval: ${pollIntervalSeconds}s, max attempts: ${maxAttempts})...`
    );

    return new Promise((resolve, reject) => {
      const poll = async () => {
        attempts++;

        if (attempts > maxAttempts) {
          reject(new Error('Authentication timeout. Please try again.'));
          return;
        }

        try {
          const pollResponse = await fetch(
            `${websiteUrl}/api/auth/device/poll?device_code=${device_code}`,
            {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'PromptBank-VSCode/0.10.0',
              },
            }
          );

          const pollData = await pollResponse.json();

          if (pollResponse.ok) {
            // Authentication complete! Store tokens
            console.log('[AuthService] Device flow completed successfully!');

            this.token = pollData.access_token;
            this.refreshToken = pollData.refresh_token;
            this.expiresAt = Date.now() + (pollData.expires_in || 3600) * 1000;

            // Verify the token
            const isValid = await this.verifyToken(this.token);
            if (!isValid) {
              reject(new Error('Token verification failed after device flow'));
              return;
            }

            // Save to storage
            await this.saveToSecretStorage();

            vscode.window.showInformationMessage(
              `✅ Signed in successfully as ${this.userEmail || 'user'}`
            );

            resolve(this.token);
            return;
          }

          // Check error type
          if (pollData.error === 'authorization_pending') {
            // User hasn't completed auth yet, keep polling
            setTimeout(poll, pollInterval);
            return;
          }

          if (pollData.error === 'expired_token') {
            reject(new Error('Authorization link expired. Please try again.'));
            return;
          }

          // Unknown error
          reject(new Error(pollData.error_description || pollData.error || 'Authentication failed'));
        } catch (error) {
          console.error('[AuthService] Poll error:', error);
          // Network error, retry
          setTimeout(poll, pollInterval);
        }
      };

      // Start polling
      setTimeout(poll, pollInterval);
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

  // ────────────────────────────────────────────────────────────────────────────
  // Lifecycle Management
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Dispose of this service and clean up resources
   *
   * Should be called when the workspace is closed or the extension is deactivated.
   * Clears all authentication state from memory (not from SecretStorage).
   */
  public async dispose(): Promise<void> {
    // Clear in-memory authentication state
    this.token = undefined;
    this.refreshToken = undefined;
    this.expiresAt = undefined;
    this.userId = undefined;
    this.userEmail = undefined;

    // Note: We intentionally do NOT clear SecretStorage here
    // Users expect their auth to persist across extension reloads
  }
}
