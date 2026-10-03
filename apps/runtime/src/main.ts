import { fileURLToPath } from 'node:url';
import {
  DEFAULT_PRESSURE_THRESHOLDS,
  type PressureThresholds,
} from '@ai-office/contracts';
import { createRuntime } from './index.js';

const envFile = fileURLToPath(new URL('../../../.env', import.meta.url));

if (typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile(envFile);
  } catch {
    // No .env yet: environment variables supplied by the shell still apply.
  }
}

const env = process.env;

function numberFromEnv(name: string, fallback: number): number {
  const raw = env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

const thresholds: PressureThresholds = {
  warning: numberFromEnv('AI_OFFICE_PRESSURE_WARNING', DEFAULT_PRESSURE_THRESHOLDS.warning),
  critical: numberFromEnv('AI_OFFICE_PRESSURE_CRITICAL', DEFAULT_PRESSURE_THRESHOLDS.critical),
  hysteresis: numberFromEnv('AI_OFFICE_PRESSURE_HYSTERESIS', DEFAULT_PRESSURE_THRESHOLDS.hysteresis),
};

const port = numberFromEnv('AI_OFFICE_PORT', 4317);
const host = env.AI_OFFICE_HOST ?? '127.0.0.1';

const runtime = await createRuntime({ port, host, thresholds, env });
const { url } = await runtime.listen();
const capabilities = runtime.office.capabilities();

console.log(`AI Office runtime listening on ${url}`);
console.log(`  harness adapters: ${capabilities.harnessAdapters.map((a) => a.id).join(', ') || 'none'}`);
console.log(`  model providers:  ${capabilities.modelProviders.map((p) => p.id).join(', ') || 'none'}`);
console.log(`  pressure:         warn ${thresholds.warning}% / critical ${thresholds.critical}%`);
console.log(`  data directory:   ${env.AI_OFFICE_DATA_DIR ?? '.ai-office'}`);
console.log(`  websocket:        ${url.replace('http', 'ws')}/ws`);

let shuttingDown = false;
const shutdown = async (signal: string): Promise<void> => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n${signal} received, flushing state and shutting down...`);
  await runtime.close();
  process.exit(0);
};

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
