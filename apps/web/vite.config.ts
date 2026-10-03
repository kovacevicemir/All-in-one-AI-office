import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const contracts = fileURLToPath(
  new URL('../../packages/contracts/src/index.ts', import.meta.url),
);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@ai-office/contracts': contracts,
    },
  },
  server: {
    port: 5173,
    strictPort: false,
    watch: {
      // On Windows, `fs.watch` can miss change events (or read a file while it
      // is being rewritten), which leaves Vite serving an empty module until a
      // restart — the classic white screen. Polling trades a little CPU for a
      // watcher that actually sees every save.
      ...(process.platform === 'win32' ? { usePolling: true, interval: 300 } : {}),
      ignored: ['**/dist/**', '**/test-results/**', '**/playwright-report/**'],
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
