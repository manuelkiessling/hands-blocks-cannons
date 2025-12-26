import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    root: __dirname,
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['**/*.ts'],
      exclude: ['main.ts', 'tests/**/*.ts', 'vite.config.ts', 'vitest.config.ts'],
    },
  },
});
