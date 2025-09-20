import * as vscode from 'vscode';

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
   */
  public async getValidAccessToken(): Promise<string> {
    await this.loadFromSecretStorage();

    // Check if token is valid and not expired
    if (this.token && this.expiresAt && Date.now() < this.expiresAt) {
      return this.token;
    }

    // Try to refresh if we have a refresh token
    if (this.refreshToken) {
      try {
        await this.refreshAccessToken();
        if (this.token) {
          return this.token;
        }
      } catch (error) {
        console.error('[AuthService] Failed to refresh token:', error);
      }
    }

    // Start new auth flow
    return this.beginGoogleAuthFlow();
  }

  /**
   * Get the current user's email if authenticated
   */
  public async getUserEmail(): Promise<string | undefined> {
    await this.loadFromSecretStorage();
    return this.userEmail;
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

    vscode.window.showInformationMessage('Signed out successfully');
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

    // Get user info
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
    // Use VS Code's URI handler
    const extensionId = `${this.publisher}.${this.extensionName}`;
    console.log('[AuthService] Using extension ID for redirect:', extensionId);
    return `vscode://${extensionId}/auth-callback`;
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
