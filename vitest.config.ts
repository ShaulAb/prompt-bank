import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['./test/test-setup.ts'],
    // You might want to add other Vitest configurations here
    // For example, to enable UI, coverage, etc.
    // ui: true,
    // coverage: {
    //   provider: 'v8',
    // },
  },
});
