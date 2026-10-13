import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    globalSetup: ['test/globalSetup.ts'],
    setupFiles: ['test/setup.ts'],
    // Integration tests share one in-memory replica set; run files sequentially.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
