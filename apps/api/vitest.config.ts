import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    // Each test file starts its own in-memory MongoDB; keep files isolated.
    pool: 'forks',
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      // Use the locally installed mongod instead of downloading a binary.
      MONGOMS_SYSTEM_BINARY: process.env.MONGOMS_SYSTEM_BINARY ?? '/usr/bin/mongod',
    },
  },
});
