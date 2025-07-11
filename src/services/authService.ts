import * as vscode from 'vscode';

export class AuthService implements vscode.UriHandler {
  private static instance: AuthService | undefined;

  private token: string | undefined;
  private expiresAt: number | undefined;
  private pendingAuth?: {
    resolve: (token: string) => void;
    reject: (err: any) => void;
  };

  // Supabase project URL is loaded from extension settings (promptBank.supabaseUrl)
  private readonly supabaseUrl: string;

  // SecretStorage keys
  private readonly TOKEN_KEY = 'promptBank.supabase.access_token';
  private readonly EXPIRY_KEY = 'promptBank.supabase.access_token.expires_at';

  /** Output channel for verbose logging */
  private readonly debug = vscode.window.createOutputChannel('Prompt Bank Auth');

  private constructor(private context: vscode.ExtensionContext) {
    const cfg = vscode.workspace.getConfiguration('promptBank');
    this.supabaseUrl = cfg.get<string>('supabaseUrl', 'https://xlqtowactrzmslpkzliq.supabase.co');
  }

  /**
   * Initialise the singleton. Must be called once from extension activation.
   */
  public static initialize(context: vscode.ExtensionContext): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService(context);
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

    if (this.token && this.expiresAt && Date.now() < this.expiresAt) {
      return this.token;
    }

    return this.beginAuthFlow();
  }

  /**
   * vscode.UriHandler implementation – called when the browser redirects back to the vscode:// URI.
   */
  public async handleUri(uri: vscode.Uri): Promise<void> {
    // Provide verbose diagnostics to aid troubleshooting
    this.debug.appendLine(`[AuthService] handleUri invoked with: ${uri.toString()}`);
    try {
      // Supabase implicit flow returns parameters in the URL fragment (#...),
      // whereas VS Code's deep-link handler exposes the fragment via uri.fragment.
      // Prefer query string first (to support future code flow), otherwise fall back to fragment.
      const rawParams = uri.query || uri.fragment;
      const params = new URLSearchParams(rawParams);
      const accessToken = params.get('access_token');
      const expiresIn = params.get('expires_in');

      if (!accessToken || !expiresIn) {
        throw new Error('Missing access_token or expires_in in callback URI');
      }

      this.token = accessToken;
      this.expiresAt = Date.now() + Number(expiresIn) * 1000;

      this.debug.appendLine(`[AuthService] Received access_token of length ${accessToken.length}`);
      this.debug.appendLine(`[AuthService] Expires in: ${expiresIn}s (epoch ms ${this.expiresAt})`);

      await this.context.secrets.store(this.TOKEN_KEY, this.token);
      await this.context.secrets.store(this.EXPIRY_KEY, this.expiresAt.toString());

      this.debug.appendLine('[AuthService] Token stored in SecretStorage');

      this.pendingAuth?.resolve(this.token);
    } catch (err) {
      this.debug.appendLine(`[AuthService] Error during handleUri: ${String(err)}`);
      this.pendingAuth?.reject(err);
      vscode.window.showErrorMessage(`Prompt Bank: Authentication failed – ${err}`);
    } finally {
      delete this.pendingAuth;
    }
  }

  // ────────────────────────────────────────────────────────────────────────────────
  // Internal helpers
  // ────────────────────────────────────────────────────────────────────────────────

  private async loadFromSecretStorage(): Promise<void> {
    if (!this.token) {
      this.token = await this.context.secrets.get(this.TOKEN_KEY) || undefined;
      const expiryStr = await this.context.secrets.get(this.EXPIRY_KEY);
      this.expiresAt = expiryStr ? Number(expiryStr) : undefined;
    }
  }

  private async beginAuthFlow(): Promise<string> {
    this.debug.appendLine('[AuthService] Starting authentication flow');
    if (this.pendingAuth) {
      // Another auth flow already in progress – return its promise.
      return new Promise<string>((resolve, reject) => {
        const { resolve: res, reject: rej } = this.pendingAuth!;
        // Chain resolution so multiple callers all get the same result.
        this.pendingAuth!.resolve = (t) => {
          res(t);
          resolve(t);
        };
        this.pendingAuth!.reject = (e) => {
          rej(e);
          reject(e);
        };
      });
    }

    const authPromise = new Promise<string>((resolve, reject) => {
      this.pendingAuth = { resolve, reject };
    });

    // Construct vscode:// deep link for redirect
    const handlerUri = vscode.Uri.parse(`${vscode.env.uriScheme}://promptbank.prompt-bank/auth`);

    const loginUrl = `${this.supabaseUrl}/auth/v1/authorize?provider=github&redirect_to=${encodeURIComponent(
      handlerUri.toString()
    )}`;

    this.debug.appendLine(`[AuthService] Opening external auth URL: ${loginUrl}`);

    vscode.env.openExternal(vscode.Uri.parse(loginUrl));

    this.debug.show(true); // bring the output channel to front once

    return authPromise;
  }
} 