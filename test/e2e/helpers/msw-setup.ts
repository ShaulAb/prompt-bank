import { setupServer } from 'msw/node';
import { oauthHandlers, oauthTestHelpers } from './oauth-handlers';
import { jwksHandler, jwksTestHelpers } from './jwks-handlers';

// Create MSW server with OAuth and JWKS handlers
export const server = setupServer(...oauthHandlers, jwksHandler);

// Enhanced server with helper methods
export const mswTestServer = {
  ...server,

  /**
   * Start server and reset to clean state
   */
  async startClean() {
    // Initialize JWKS test keys before starting server
    await jwksTestHelpers.initialize();
    server.listen({ onUnhandledRequest: 'warn' });
    oauthTestHelpers.resetTokens();
    oauthTestHelpers.clearAuthCodes();
  },

  /**
   * Reset handlers and clear state
   */
  reset() {
    server.resetHandlers();
    oauthTestHelpers.resetTokens();
    oauthTestHelpers.clearAuthCodes();
  },

  /**
   * Stop server and cleanup
   */
  async stopClean() {
    server.close();
    oauthTestHelpers.clearAuthCodes();
  },

  /**
   * Get server URL for configuration
   */
  getServerUrl() {
    // MSW intercepts at network level, so we can use any URL
    // The actual URL doesn't matter - MSW will intercept based on patterns
    return 'https://test-oauth-provider.local';
  },

  /**
   * Configure VS Code extension to use mock server
   */
  async configureExtension() {
    // This would be called in test setup to point extension to mock server
    const vscode = require('vscode');
    await vscode.workspace
      .getConfiguration('promptBank')
      .update('supabaseUrl', this.getServerUrl(), vscode.ConfigurationTarget.Global);
  },

  // Re-export helpers for convenience
  helpers: {
    oauth: oauthTestHelpers,
    jwks: jwksTestHelpers,
  },
};

// Export individual helpers for direct import
export { oauthTestHelpers, jwksTestHelpers };