import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PipeSpawnPort } from '@ai-office/adapter-session';
import type { SpawnedProcess } from '@ai-office/core';
import { createRuntime } from '@ai-office/runtime';

/**
 * Opt-in smoke test against a real PI install and DeepSeek credentials.
 *
 * It is skipped unless `AI_OFFICE_REAL_SMOKE=1` AND `DEEPSEEK_API_KEY` are set,
 * so the default `npm test` never touches the network, a browser, or credentials.
 *
 * What it proves: a task run through the office reaches the harness with the
 * same prompt as a direct `pi --mode rpc` invocation, and reports the same
 * prompt-token usage. That is the "zero prompt overhead" claim, checked against
 * the vendor rather than a double.
 *
 * Run it locally with:
 *   AI_OFFICE_REAL_SMOKE=1 DEEPSEEK_API_KEY=sk-... npm test
 */
const ENABLED =
  process.env.AI_OFFICE_REAL_SMOKE === '1' &&
  (process.env.DEEPSEEK_API_KEY ?? '').trim().length > 0;

const MODEL = { providerId: 'deepseek', modelId: 'deepseek-flash' } as const;
const INSTRUCTION = 'Reply with exactly one word: pong. Do not use any tools.';
const PI = process.env.PI_COMMAND ?? 'pi';
const TIMEOUT_MS = 180_000;

/** Total tokens the direct CLI run reports for a prompt. */
interface Usage {
  input: number;
  output: number;
  total: number;
}

const suite = ENABLED ? describe : describe.skip;

suite('real PI + DeepSeek smoke (opt-in)', () => {
  it(
    'matches a direct CLI run prompt-for-prompt and token-for-token',
    async () => {
      const dataDir = await mkdtemp(join(tmpdir(), 'ai-office-smoke-'));
      try {
        const [officeUsage, directUsage] = await Promise.all([
          officeRun(dataDir),
          directRun(dataDir),
        ]);

        // The instruction is byte-identical in both runs, so the prompt tokens
        // PI charges for must be identical; only the sampled completion can vary.
        expect(officeUsage.input).toBe(directUsage.input);
        expect(directUsage.total).toBeGreaterThan(0);
        const drift = Math.abs(officeUsage.total - directUsage.total) / directUsage.total;
        expect(drift, `token drift ${(drift * 100).toFixed(1)}%`).toBeLessThan(0.2);
      } finally {
        await rm(dataDir, { recursive: true, force: true });
      }
    },
    TIMEOUT_MS,
  );
});

/** Drives the whole office stack: HTTP create → start run → task result usage. */
async function officeRun(dataDir: string): Promise<Usage> {
  const runtime = await createRuntime({ dataDir, port: 0, persistDebounceMs: 0 });
  try {
    const { url } = await runtime.listen(0, '127.0.0.1');
    const department = await api<{ id: string }>(url, '/api/departments', { name: 'Smoke' });
    const agent = await api<{ id: string }>(url, '/api/agents', {
      name: 'Smoke',
      departmentId: department.id,
      workingDir: dataDir,
      harnessId: 'pi',
      model: MODEL,
    });
    const task = await api<{ id: string }>(url, '/api/tasks', {
      agentId: agent.id,
      title: 'Smoke',
      instruction: INSTRUCTION,
    });
    await api(url, `/api/agents/${agent.id}/run`, {});

    const finished = await waitForTerminal(url, task.id);
    const usage = finished.result?.usage;
    expect(finished.status, finished.result?.failureReason ?? 'run failed').toBe('done');
    expect(usage, 'the completed task must report usage').toBeDefined();
    return { input: usage!.input, output: usage!.output, total: usage!.total };
  } finally {
    await runtime.close();
  }
}

/**
 * Runs `pi --mode rpc` directly, sends the same prompt, and reads PI's own
 * usage stats. Deliberately does not use the adapter: this is the control.
 */
async function directRun(cwd: string): Promise<Usage> {
  const spawn = new PipeSpawnPort();
  const sessionId = `direct-${Date.now()}`;
  const child: SpawnedProcess = await spawn.spawn({
    sessionId,
    command: PI,
    args: ['--mode', 'rpc', '--provider', MODEL.providerId, '--model', MODEL.modelId, '--session-id', sessionId],
    cwd,
    env: {},
    cols: 120,
    rows: 30,
  });

  const lines = new TabbedProtocol(child);
  try {
    await lines.send({ type: 'prompt', message: INSTRUCTION });
    await lines.waitFor((record) => record.type === 'agent_settled');
    const stats = await lines.send({ type: 'get_session_stats' });
    const data = (stats.data ?? {}) as { tokens?: { input?: number; output?: number; totalTokens?: number } };
    const input = data.tokens?.input ?? 0;
    const output = data.tokens?.output ?? 0;
    return { input, output, total: data.tokens?.totalTokens ?? input + output };
  } finally {
    child.kill();
  }
}

/** Minimal PI JSONL client for the control run. */
class TabbedProtocol {
  private buffer = '';
  private counter = 0;
  private readonly waiters = new Map<string, (record: PiRecord) => void>();
  private readonly watchers = new Set<(record: PiRecord) => boolean>();

  constructor(private readonly child: SpawnedProcess) {
    child.onEvent((event) => {
      if (event.type === 'output') this.consume(event.data);
    });
  }

  async send(command: Record<string, unknown>): Promise<PiRecord> {
    const id = `direct-${++this.counter}`;
    return await new Promise<PiRecord>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters.delete(id);
        reject(new Error(`PI did not answer ${String(command.type)} in time`));
      }, TIMEOUT_MS);
      this.waiters.set(id, (record) => {
        clearTimeout(timer);
        resolve(record);
      });
      this.child.write(`${JSON.stringify({ id, ...command })}\n`);
    });
  }

  async waitFor(match: (record: PiRecord) => boolean): Promise<void> {
    await new Promise<void>((resolve) => {
      this.watchers.add((record) => {
        if (!match(record)) return false;
        resolve();
        return true;
      });
    });
  }

  private consume(data: string): void {
    this.buffer += data;
    let index = this.buffer.indexOf('\n');
    while (index >= 0) {
      const raw = this.buffer.slice(0, index).replace(/\r$/, '');
      this.buffer = this.buffer.slice(index + 1);
      if (raw.trim().length > 0) this.handle(raw);
      index = this.buffer.indexOf('\n');
    }
  }

  private handle(line: string): void {
    let record: PiRecord;
    try {
      record = JSON.parse(line) as PiRecord;
    } catch {
      return;
    }
    if (typeof record.id === 'string') {
      const waiter = this.waiters.get(record.id);
      if (waiter !== undefined) {
        this.waiters.delete(record.id);
        waiter(record);
      }
    }
    for (const watcher of [...this.watchers]) {
      if (watcher(record)) this.watchers.delete(watcher);
    }
  }
}

interface PiRecord {
  type?: string;
  id?: string;
  [key: string]: unknown;
}

async function api<T>(base: string, path: string, body: unknown): Promise<T> {
  const response = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${path} → ${response.status}: ${text}`);
  return (text.length > 0 ? JSON.parse(text) : null) as T;
}

interface TaskView {
  status: string;
  result?: { usage?: Usage; failureReason?: string };
}

async function waitForTerminal(base: string, taskId: string): Promise<TaskView> {
  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    const response = await fetch(`${base}/api/tasks/${taskId}`);
    const task = (await response.json()) as TaskView;
    if (['done', 'failed', 'cancelled', 'interrupted'].includes(task.status)) return task;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`task ${taskId} did not finish within ${TIMEOUT_MS}ms`);
}
