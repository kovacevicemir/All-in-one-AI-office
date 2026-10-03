import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { MemoryStore } from '@ai-office/adapter-fake';
import type { ModelProvider } from '@ai-office/core';
import { createRuntime } from '@ai-office/runtime';
import { ControlledHarness } from './controlled-harness.js';

/**
 * E2E runtime host.
 *
 * Boots the real runtime (HTTP + WebSocket + hub + office) with the controllable
 * fake harness and a fake model provider, so the browser suite needs no PI, no
 * DeepSeek credentials, and no network. A second tiny HTTP server exposes a
 * control API used by the Playwright spec to drive individual runs.
 *
 *   runtime  http://127.0.0.1:4318
 *   control  http://127.0.0.1:4319
 */
const RUNTIME_PORT = Number(process.env.AI_OFFICE_E2E_RUNTIME_PORT ?? '4318');
const CONTROL_PORT = Number(process.env.AI_OFFICE_E2E_CONTROL_PORT ?? '4319');

const harness = new ControlledHarness();
const provider: ModelProvider = {
  id: 'fake',
  label: 'Scripted (e2e)',
  listModels: () => ['fake-1'],
  resolve: (ref) => ({
    providerId: ref.providerId,
    modelId: ref.modelId,
    provider: 'fake',
    model: ref.modelId,
  }),
};

const runtime = await createRuntime({
  harnesses: [harness],
  providers: [provider],
  store: new MemoryStore(),
  host: '127.0.0.1',
  port: RUNTIME_PORT,
  persistDebounceMs: 0,
});
const { url } = await runtime.listen(RUNTIME_PORT, '127.0.0.1');
console.log(`[e2e] runtime listening on ${url}`);

const control = createServer((req, res) => {
  void handleControl(req, res).catch((error: unknown) => {
    sendJson(res, 500, { error: (error as Error).message });
  });
});
control.listen(CONTROL_PORT, '127.0.0.1', () => {
  console.log(`[e2e] control listening on http://127.0.0.1:${CONTROL_PORT}`);
});

async function handleControl(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const segments = new URL(req.url ?? '/', 'http://localhost').pathname
    .split('/')
    .filter((segment) => segment.length > 0);

  if (req.method === 'GET' && segments.join('/') === 'control/runs') {
    sendJson(res, 200, harness.list());
    return;
  }

  // Wipes office state between specs so each test starts from an empty office.
  if (req.method === 'POST' && segments.join('/') === 'control/reset') {
    for (const task of runtime.office.listTasks()) {
      try {
        runtime.office.deleteTask(task.id);
      } catch {
        /* already gone */
      }
    }
    for (const agent of runtime.office.listAgents()) {
      try {
        runtime.office.deleteAgent(agent.id);
      } catch {
        /* already gone */
      }
    }
    for (const department of runtime.office.listDepartments()) {
      try {
        runtime.office.deleteDepartment(department.id);
      } catch {
        /* already gone */
      }
    }
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method !== 'POST' || segments[0] !== 'control' || segments[1] !== 'runs' || segments.length !== 4) {
    sendJson(res, 404, { error: 'No control route' });
    return;
  }

  const [, , runId, action] = segments as [string, string, string, string];
  const run = harness.get(runId);
  if (run === undefined) {
    sendJson(res, 404, { error: `No run ${runId}` });
    return;
  }

  const body = (await readJson(req)) as Record<string, unknown>;
  switch (action) {
    case 'activity':
      run.activity(String(body.summary ?? ''));
      break;
    case 'output':
      run.output(String(body.data ?? ''));
      break;
    case 'telemetry':
      run.telemetry(
        Number(body.percent ?? 0),
        Number(body.tokens ?? 1000),
        Number(body.contextWindow ?? 100_000),
      );
      break;
    case 'complete':
      run.complete(typeof body.output === 'string' ? body.output : 'done');
      break;
    case 'fail':
      run.fail(String(body.reason ?? 'failed'));
      break;
    default:
      sendJson(res, 404, { error: `Unknown control action ${action}` });
      return;
  }
  sendJson(res, 200, { ok: true });
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(text);
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString('utf8');
  return text.length === 0 ? {} : JSON.parse(text);
}

const shutdown = async (): Promise<void> => {
  await runtime.close();
  control.close();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
