import { defineConfig } from '@playwright/test';

const RUNTIME_URL = 'http://127.0.0.1:4318';
const WEB_URL = 'http://127.0.0.1:5273';

const environment: Record<string, string> = Object.fromEntries(
  Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
);

/**
 * Browser end-to-end suite. It boots a real runtime (HTTP + WebSocket + office)
 * against the controllable fake harness, plus the real web app, and drives the
 * UI in Chromium with no PI, no DeepSeek credentials, and no WebGL.
 */
export default defineConfig({
  testDir: './e2e',
  // The render check targets a separately running dev server; it is run by
  // `npm run check:web` with playwright.dev.config.ts.
  testIgnore: 'dev-render.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: {
    baseURL: WEB_URL,
    headless: true,
    trace: 'retain-on-failure',
    launchOptions: {
      // Force the documented "no WebGL" path so the suite exercises the
      // accessible list view the way a machine without 3D support would.
      args: ['--disable-webgl', '--disable-webgl2', '--disable-3d-apis'],
    },
  },
  webServer: [
    {
      command: 'npx tsx e2e/runtime-server.ts',
      url: `${RUNTIME_URL}/api/health`,
      reuseExistingServer: false,
      timeout: 40_000,
      env: environment,
    },
    {
      command: 'npx vite --port 5273 --strictPort --host 127.0.0.1',
      cwd: 'apps/web',
      url: WEB_URL,
      reuseExistingServer: false,
      timeout: 40_000,
      env: { ...environment, VITE_RUNTIME_URL: RUNTIME_URL, VITE_VOICE_FAKE: '1' },
    },
  ],
});
