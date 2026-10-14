import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@hancad\/(.+)$/,
        replacement: `${fileURLToPath(new URL('./packages/', import.meta.url))}$1/src/index.ts`,
      },
    ],
  },
  test: {
    include: ['packages/**/*.test.ts', 'apps/**/src/**/*.test.ts'],
    environment: 'node',
    testTimeout: 15000,
  },
});
