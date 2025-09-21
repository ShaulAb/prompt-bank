import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['./test/test-setup.ts'],
    // Exclude E2E tests that require VS Code Extension Host
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/test/e2e/suite/auth-simplified.test.ts', // Requires VS Code Extension Host
    ],
    include: [
      'test/**/*.test.ts',
      'test/e2e/suite/msw-integration.test.ts', // Pure MSW test without VS Code
    ],
  },
});
