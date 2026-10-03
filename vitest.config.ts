import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const pkg = (name: string) =>
  fileURLToPath(new URL(`./packages/${name}/src/index.ts`, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@ai-office/contracts': pkg('contracts'),
      '@ai-office/core': pkg('core'),
      '@ai-office/adapter-fake': pkg('adapter-fake'),
      '@ai-office/adapter-store-file': pkg('adapter-store-file'),
      '@ai-office/adapter-session': pkg('adapter-session'),
      '@ai-office/adapter-pi': pkg('adapter-pi'),
    },
  },
  test: {
    include: [
      'packages/*/test/**/*.test.ts',
      'apps/*/test/**/*.test.ts',
      'apps/*/test/**/*.test.tsx',
      'test/**/*.test.ts',
    ],
    environment: 'node',
  },
});
