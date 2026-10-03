import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { TEST_GROUPS } from './scripts/test-groups.js';

const pkg = (name: string) =>
  fileURLToPath(new URL(`./packages/${name}/src/index.ts`, import.meta.url));

const alias = {
  '@ai-office/contracts': pkg('contracts'),
  '@ai-office/core': pkg('core'),
  '@ai-office/adapter-fake': pkg('adapter-fake'),
  '@ai-office/adapter-store-file': pkg('adapter-store-file'),
  '@ai-office/adapter-session': pkg('adapter-session'),
  '@ai-office/adapter-pi': pkg('adapter-pi'),
};

/**
 * One Vitest project per group in `scripts/test-groups.ts`. A project is how
 * `npm run test:group -- <name>` selects a slice of the suite, and how
 * `npm test` keeps every group inside its time budget.
 */
export default defineConfig({
  resolve: { alias },
  test: {
    environment: 'node',
    projects: TEST_GROUPS.map((group) => ({
      extends: true,
      test: {
        name: group.name,
        include: [...group.include],
        ...(group.exclude === undefined ? {} : { exclude: [...group.exclude] }),
        environment: 'node',
      },
    })),
  },
});
