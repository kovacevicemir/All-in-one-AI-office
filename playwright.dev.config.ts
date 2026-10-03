import { defineConfig } from '@playwright/test';

/**
 * Render check against an **already running** dev server.
 *
 * The main e2e config boots its own servers, so it can never catch a dev server
 * that has gone stale (for example, serving an empty transform of a module,
 * which leaves the page white). This config starts nothing: it points at
 * whatever is on the dev URL and fails fast when the page does not render.
 *
 * Usage: start `npm run dev`, then run `npm run check:web`.
 */
const DEV_URL = process.env.AI_OFFICE_DEV_URL ?? 'http://localhost:5173';

export default defineConfig({
  testDir: './e2e',
  testMatch: 'dev-render.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 15_000,
  expect: { timeout: 5_000 },
  reporter: [['list']],
  use: {
    baseURL: DEV_URL,
    headless: true,
    trace: 'off',
    launchOptions: {
      args: ['--disable-webgl', '--disable-webgl2', '--disable-3d-apis'],
    },
  },
});
