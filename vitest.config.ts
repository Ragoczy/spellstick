import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // The full-match tests take a few seconds each; on a busy machine (tests run in parallel)
    // the 5 s default was too tight. A real hang still fails.
    testTimeout: 20_000,
    include: ['src/**/*.test.ts', 'tools/**/*.test.ts', 'server/**/*.test.ts'],
  },
});
