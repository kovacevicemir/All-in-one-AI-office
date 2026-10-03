import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { ERROR_CODES, type AgentCommunication, type EventEnvelope, type Snapshot } from '@ai-office/contracts';
import { MemoryStore, ScriptedHarness } from '@ai-office/adapter-fake';
import type { ModelProvider } from '@ai-office/core';
import { createRuntime, type Runtime } from '@ai-office/runtime';

const fakeProvider: ModelProvider = {
  id: 'fake',
  label: 'Fake Provider',
  listModels: () => ['fake-1'],
  resolve: (ref) => ({
    providerId: ref.providerId,
    modelId: ref.modelId,
    provider: 'fake',
    model: ref.modelId,
  }),
};

let runtime: Runtime;
let harness: ScriptedHarness;
let base: string;

beforeEach(async () => {
  harness = new ScriptedHarness();
  runtime = await createRuntime({
    harnesses: [harness],
    providers: [fakeProvider],
    store: new MemoryStore(),
    persistDebounceMs: 0,
    port: 0,
  });
  const address = await runtime.listen(0, '127.0.0.1');
  base = address.url;
});

afterEach(async () => {
  await runtime.close();
});

async function api<T>(path: string, init?: RequestInit): Promise<{ status: number; body: T }> {
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const text = await response.text();
  return { status: response.status, body: (text.length > 0 ? JSON.parse(text) : null) as T };
}

async function seed(): Promise<{ departmentId: string; agentId: string; taskId: string }> {
  const department = await api<{ id: string }>('/api/departments', {
    method: 'POST',
    body: JSON.stringify({ name: 'Engineering' }),
  });
  const agent = await api<{ id: string }>('/api/agents', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Ada',
      departmentId: department.body.id,
      workingDir: tmpdir(),
      harnessId: 'fake',
      model: { providerId: 'fake', modelId: 'fake-1' },
    }),
  });
  const task = await api<{ id: string }>('/api/tasks', {
    method: 'POST',
    body: JSON.stringify({ agentId: agent.body.id, title: 'Ship it', instruction: 'ship it' }),
  });
  return { departmentId: department.body.id, agentId: agent.body.id, taskId: task.body.id };
}

describe('runtime HTTP API', () => {
  it('reports health, capabilities and the pressure thresholds', async () => {
    expect((await api<{ ok: boolean }>('/api/health')).body.ok).toBe(true);

    const capabilities = await api<{
      harnessAdapters: { id: string; capabilities: Record<string, boolean> }[];
      modelProviders: { id: string; models: string[] }[];
    }>('/api/capabilities');
    expect(capabilities.body.harnessAdapters.map((adapter) => adapter.id)).toEqual(['fake']);
    expect(capabilities.body.harnessAdapters[0]?.capabilities.cancel).toBe(true);

    const snapshot = await api<Snapshot>('/api/snapshot');
    expect(snapshot.body.pressureThresholds).toEqual({ warning: 30, critical: 50, hysteresis: 5 });
  });

  it('creates a department, agent, and task, and reflects them in the snapshot', async () => {
    const { agentId, taskId } = await seed();
    const snapshot = await api<Snapshot>('/api/snapshot');

    expect(snapshot.body.departments).toHaveLength(1);
    expect(snapshot.body.agents[0]?.id).toBe(agentId);
    expect(snapshot.body.agents[0]?.departmentId).toBe(snapshot.body.departments[0]?.id);
    expect(snapshot.body.tasks[0]?.id).toBe(taskId);
    expect(snapshot.body.agents[0]?.state).toBe('idle');
    expect(snapshot.body.agents[0]?.pressure).toBe('unknown');
  });

  it('names the offending fields on an invalid payload and applies no partial change', async () => {
    const result = await api<{ code: string; details: { fields: { path: string }[] } }>('/api/agents', {
      method: 'POST',
      body: JSON.stringify({ name: '', workingDir: tmpdir() }),
    });
    expect(result.status).toBe(400);
    expect(result.body.code).toBe(ERROR_CODES.validation);
    expect(result.body.details.fields.some((field) => field.path === 'name')).toBe(true);
    expect((await api<Snapshot>('/api/snapshot')).body.agents).toHaveLength(0);
  });

  it('returns not-found for unknown resources and rejects duplicate names', async () => {
    const missing = await api<{ code: string }>('/api/agents/nope');
    expect(missing.status).toBe(404);
    expect(missing.body.code).toBe(ERROR_CODES.notFound);

    await seed();
    const duplicate = await api<{ code: string }>('/api/agents', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Ada',
        workingDir: tmpdir(),
        harnessId: 'fake',
        model: { providerId: 'fake', modelId: 'fake-1' },
      }),
    });
    expect(duplicate.status).toBe(400);
  });

  it('rejects an unknown adapter with the registered ids', async () => {
    const result = await api<{ code: string; details: { registered: string[] } }>('/api/agents', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Ghost',
        workingDir: tmpdir(),
        harnessId: 'does-not-exist',
        model: { providerId: 'fake', modelId: 'fake-1' },
      }),
    });
    expect(result.status).toBe(400);
    expect(result.body.details.registered).toEqual(['fake']);
  });

  it('rejects a non-existent working directory', async () => {
    const result = await api<{ code: string }>('/api/agents', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Homeless',
        workingDir: `${tmpdir()}/definitely-not-here-${Date.now()}`,
        harnessId: 'fake',
        model: { providerId: 'fake', modelId: 'fake-1' },
      }),
    });
    expect(result.status).toBe(400);
  });

  it('starts a run, links the ids, and refuses a second concurrent run', async () => {
    const { agentId, taskId } = await seed();

    const started = await api<{ runId: string; taskId: string; sessionId: string }>(
      `/api/agents/${agentId}/run`,
      { method: 'POST' },
    );
    expect(started.status).toBe(200);
    expect(started.body.taskId).toBe(taskId);

    const conflict = await api<{ code: string }>(`/api/agents/${agentId}/run`, { method: 'POST' });
    expect(conflict.status).toBe(409);
    expect(conflict.body.code).toBe(ERROR_CODES.conflict);

    const agent = await api<{ state: string; sessionId: string }>(`/api/agents/${agentId}`);
    expect(agent.body.state).toBe('working');
    expect(agent.body.sessionId).toBe(started.body.sessionId);

    await api(`/api/agents/${agentId}/cancel`, { method: 'POST' });
    expect((await api<{ state: string }>(`/api/agents/${agentId}`)).body.state).toBe('idle');
  });

  it('exposes session output with sequence numbers for backfill', async () => {
    const { agentId } = await seed();
    const started = await api<{ sessionId: string }>(`/api/agents/${agentId}/run`, { method: 'POST' });
    harness.lastRun.output('hello\n');
    harness.lastRun.output('world\n');

    const output = await api<{ chunks: { seq: number; data: string }[]; oldestSeq: number; lastSeq: number }>(
      `/api/sessions/${started.body.sessionId}/output`,
    );
    expect(output.body.chunks.map((chunk) => chunk.data)).toEqual(['hello\n', 'world\n']);
    expect(output.body.lastSeq).toBe(2);

    const page = await api<{ chunks: { data: string }[] }>(
      `/api/sessions/${started.body.sessionId}/output?fromSeq=1`,
    );
    expect(page.body.chunks.map((chunk) => chunk.data)).toEqual(['world\n']);
  });

  it('reports unsupported operations explicitly instead of silently ignoring them', async () => {
    const { agentId } = await seed();
    await api(`/api/agents/${agentId}/run`, { method: 'POST' });

    const resized = await api<{ code: string }>(`/api/agents/${agentId}/resize`, {
      method: 'POST',
      body: JSON.stringify({ cols: 100, rows: 40 }),
    });
    expect(resized.status).toBe(422);
    expect(resized.body.code).toBe(ERROR_CODES.unsupported);

    const input = await api<{ code: string }>(`/api/agents/${agentId}/input`, {
      method: 'POST',
      body: JSON.stringify({ data: 'x' }),
    });
    expect(input.status).toBe(422);
  });

  it('rejects a dependency cycle', async () => {
    const { agentId, taskId } = await seed();
    const second = await api<{ id: string }>('/api/tasks', {
      method: 'POST',
      body: JSON.stringify({
        agentId,
        title: 'Second',
        instruction: 'second',
        dependsOn: [taskId],
      }),
    });

    const cycle = await api<{ code: string }>(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      body: JSON.stringify({ dependsOn: [second.body.id] }),
    });
    expect(cycle.status).toBe(400);
    expect(cycle.body.code).toBe(ERROR_CODES.cycle);
  });

  it('reports a blocked task and its unfinished dependencies', async () => {
    const { agentId, taskId } = await seed();
    const dependent = await api<{ id: string; status: string; blockedBy: string[] }>('/api/tasks', {
      method: 'POST',
      body: JSON.stringify({
        agentId,
        title: 'Dependent',
        instruction: 'after',
        dependsOn: [taskId],
      }),
    });
    expect(dependent.body.status).toBe('blocked');
    expect(dependent.body.blockedBy).toEqual([taskId]);
  });

  it('re-queues a finished task so it can run again', async () => {
    const { agentId, taskId } = await seed();
    await api(`/api/agents/${agentId}/run`, { method: 'POST' });
    harness.lastRun.complete('first pass');

    expect((await api<{ status: string }>(`/api/tasks/${taskId}`)).body.status).toBe('done');

    const reopened = await api<{ status: string; result?: unknown }>(`/api/tasks/${taskId}/reopen`, {
      method: 'POST',
    });
    expect(reopened.status).toBe(200);
    expect(reopened.body.status).toBe('queued');
    expect(reopened.body.result).toBeUndefined();

    const again = await api<{ runId: string; taskId: string }>(`/api/agents/${agentId}/run`, {
      method: 'POST',
    });
    expect(again.status).toBe(200);
    expect(again.body.taskId).toBe(taskId);
  });

  it('exposes retained communications with an optional agent filter', async () => {
    const { departmentId, agentId } = await seed();
    const originator = await api<{ id: string }>('/api/agents', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Orchestrator',
        departmentId,
        workingDir: tmpdir(),
        harnessId: 'fake',
        model: { providerId: 'fake', modelId: 'fake-1' },
      }),
    });
    const delegated = await api<{ id: string }>('/api/tasks', {
      method: 'POST',
      body: JSON.stringify({
        agentId,
        title: 'Delegated by the orchestrator',
        instruction: 'do it',
        originAgentId: originator.body.id,
      }),
    });

    const all = await api<AgentCommunication[]>('/api/communications');
    expect(all.status).toBe(200);
    expect(all.body).toHaveLength(1);
    expect(all.body[0]).toMatchObject({
      kind: 'request',
      fromAgentId: originator.body.id,
      toAgentId: agentId,
      taskId: delegated.body.id,
    });
    expect(all.body[0]?.summary).toContain('Orchestrator');

    const filtered = await api<AgentCommunication[]>(
      `/api/communications?agentId=${originator.body.id}`,
    );
    expect(filtered.body).toHaveLength(1);

    const unknown = await api<{ code: string }>('/api/communications?agentId=missing');
    expect(unknown.status).toBe(404);
    expect(unknown.body.code).toBe(ERROR_CODES.notFound);
  });

  it('never returns credential-shaped values in any response', async () => {
    await seed();
    const snapshot = await api<unknown>('/api/snapshot');
    const capabilities = await api<unknown>('/api/capabilities');
    const text = JSON.stringify(snapshot.body) + JSON.stringify(capabilities.body);
    expect(text).not.toMatch(/sk-[a-z0-9]/i);
    expect(text.toLowerCase()).not.toContain('apikey');
    expect(text.toLowerCase()).not.toContain('api_key');
  });
});

/* -------------------------------------------------------------------- ws */

async function connect(query = ''): Promise<{
  socket: WebSocket;
  next: (predicate: (envelope: EventEnvelope) => boolean, timeoutMs?: number) => Promise<EventEnvelope>;
  close: () => void;
}> {
  const socket = new WebSocket(`${base.replace('http', 'ws')}${query}`);
  const queue: EventEnvelope[] = [];
  const waiters: { predicate: (envelope: EventEnvelope) => boolean; resolve: (e: EventEnvelope) => void }[] =
    [];

  socket.on('message', (raw: Buffer) => {
    const envelope = JSON.parse(String(raw)) as EventEnvelope;
    const safe = (predicate: (envelope: EventEnvelope) => boolean): boolean => {
      try {
        return predicate(envelope);
      } catch {
        return false;
      }
    };
    const index = waiters.findIndex((waiter) => safe(waiter.predicate));
    if (index >= 0) {
      const [waiter] = waiters.splice(index, 1);
      waiter?.resolve(envelope);
      return;
    }
    queue.push(envelope);
  });

  await new Promise<void>((resolve, reject) => {
    socket.once('open', () => resolve());
    socket.once('error', reject);
  });

  return {
    socket,
    next: (predicate, timeoutMs = 3_000) =>
      new Promise<EventEnvelope>((resolve, reject) => {
        const safe = (envelope: EventEnvelope): boolean => {
          try {
            return predicate(envelope);
          } catch {
            return false;
          }
        };
        const existing = queue.findIndex(safe);
        if (existing >= 0) {
          const [found] = queue.splice(existing, 1);
          resolve(found as EventEnvelope);
          return;
        }
        const timer = setTimeout(() => reject(new Error('timed out waiting for event')), timeoutMs);
        waiters.push({
          predicate: safe,
          resolve: (envelope) => {
            clearTimeout(timer);
            resolve(envelope);
          },
        });
      }),
    close: () => socket.close(),
  };
}

describe('runtime realtime stream', () => {
  it('sends a snapshot before deltas so no change is missed', async () => {
    const { agentId } = await seed();
    const client = await connect();
    const snapshot = await client.next((envelope) => envelope.type === 'snapshot');
    expect((snapshot.payload as Snapshot).agents).toHaveLength(1);

    const update = client.next((envelope) => envelope.type === 'task.updated');
    await api(`/api/tasks`, {
      method: 'POST',
      body: JSON.stringify({ agentId, title: 'More', instruction: 'more' }),
    });
    expect((await update).type).toBe('task.updated');
    client.close();
  });

  it('increments sequence numbers monotonically', async () => {
    const { agentId } = await seed();
    const client = await connect();
    const first = await client.next((envelope) => envelope.type === 'snapshot');

    const seen: number[] = [first.seq];
    const collect = client.next(() => true);
    await api(`/api/tasks`, {
      method: 'POST',
      body: JSON.stringify({ agentId, title: 'Two', instruction: 'two' }),
    });
    seen.push((await collect).seq);
    expect(seen[1]).toBeGreaterThan(seen[0] as number);
    client.close();
  });

  it('coalesces terminal output into bounded frames', async () => {
    const { agentId } = await seed();
    const client = await connect();
    await client.next((envelope) => envelope.type === 'snapshot');
    await api(`/api/agents/${agentId}/run`, { method: 'POST' });

    for (let i = 0; i < 50; i += 1) harness.lastRun.output(`line ${i}\n`);
    runtime.hub.flushOutput();

    const frame = await client.next((envelope) => envelope.type === 'session.output');
    const payload = frame.payload as { chunks: string[]; sessionId: string };
    expect(payload.chunks.length).toBeGreaterThan(1);
    expect(payload.chunks.join('')).toContain('line 49');
    client.close();
  });

  it('filters a subscription to a single agent', async () => {
    const first = await seed();
    const second = await api<{ id: string }>('/api/agents', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Grace',
        workingDir: tmpdir(),
        harnessId: 'fake',
        model: { providerId: 'fake', modelId: 'fake-1' },
      }),
    });

    const client = await connect(`?agentId=${first.agentId}`);
    const snapshot = await client.next((envelope) => envelope.type === 'snapshot');
    expect((snapshot.payload as Snapshot).agents).toHaveLength(1);

    const scoped = client.next((envelope) => envelope.type === 'task.updated');
    await api('/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ agentId: second.body.id, title: 'Elsewhere', instruction: 'x' }),
    });
    await api('/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ agentId: first.agentId, title: 'Here', instruction: 'x' }),
    });

    const event = await scoped;
    expect((event.payload as { agentId: string }).agentId).toBe(first.agentId);
    client.close();
  });

  it('delivers a delegation as a communication delta after the snapshot', async () => {
    const { departmentId, agentId } = await seed();
    const originator = await api<{ id: string }>('/api/agents', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Orchestrator',
        departmentId,
        workingDir: tmpdir(),
        harnessId: 'fake',
        model: { providerId: 'fake', modelId: 'fake-1' },
      }),
    });

    const client = await connect();
    const snapshot = await client.next((envelope) => envelope.type === 'snapshot');
    expect((snapshot.payload as Snapshot).communications).toEqual([]);

    const update = client.next((envelope) => envelope.type === 'communication.updated');
    await api('/api/tasks', {
      method: 'POST',
      body: JSON.stringify({
        agentId,
        title: 'Delegated',
        instruction: 'x',
        originAgentId: originator.body.id,
      }),
    });

    const delta = await update;
    expect(delta.seq).toBeGreaterThan(snapshot.seq);
    expect((delta.payload as AgentCommunication).kind).toBe('request');
    client.close();
  });

  it('accepts prompt and cancel commands over the socket', async () => {
    const { agentId } = await seed();
    const client = await connect();
    await client.next((envelope) => envelope.type === 'snapshot');
    await api(`/api/agents/${agentId}/run`, { method: 'POST' });

    const prompted = client.next(
      (envelope) => (envelope.payload as { command?: string }).command === 'prompt',
    );
    client.socket.send(JSON.stringify({ type: 'prompt', agentId, text: 'also update docs' }));
    expect((await prompted).payload).toMatchObject({ success: true, data: { delivery: 'sent' } });
    expect(harness.lastRun.prompts.at(-1)?.text).toBe('also update docs');

    const cancelled = client.next(
      (envelope) => (envelope.payload as { command?: string }).command === 'cancel',
    );
    client.socket.send(JSON.stringify({ type: 'cancel', agentId }));
    expect((await cancelled).payload).toMatchObject({ success: true });
    client.close();
  });

  it('reports a failed command instead of throwing', async () => {
    const client = await connect();
    await client.next((envelope) => envelope.type === 'snapshot');

    const failed = client.next(
      (envelope) => (envelope.payload as { success?: boolean }).success === false,
    );
    client.socket.send(JSON.stringify({ type: 'cancel', agentId: 'nobody' }));
    expect((await failed).payload).toMatchObject({ command: 'cancel', success: false });
    client.close();
  });
});

describe('runtime HTTP API: agent profiles', () => {
  it('reads an unset profile as empty strings', async () => {
    const { agentId } = await seed();
    const result = await api<{ description: string; instructions: string }>(
      `/api/agents/${agentId}/profile`,
    );
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ description: '', instructions: '' });
  });

  it('updates a profile and returns the stored values on a later read', async () => {
    const { agentId } = await seed();
    const updated = await api<{ description: string; instructions: string }>(
      `/api/agents/${agentId}/profile`,
      {
        method: 'PUT',
        body: JSON.stringify({ description: 'Tech lead', instructions: 'own the build' }),
      },
    );
    expect(updated.status).toBe(200);
    expect(updated.body).toEqual({ description: 'Tech lead', instructions: 'own the build' });

    const read = await api<{ description: string; instructions: string }>(
      `/api/agents/${agentId}/profile`,
    );
    expect(read.body).toEqual({ description: 'Tech lead', instructions: 'own the build' });
  });

  it('rejects an invalid payload and leaves the stored profile unchanged', async () => {
    const { agentId } = await seed();
    await api(`/api/agents/${agentId}/profile`, {
      method: 'PUT',
      body: JSON.stringify({ description: 'original', instructions: 'keep me' }),
    });

    const invalid = await api<{ code: string }>(`/api/agents/${agentId}/profile`, {
      method: 'PUT',
      body: JSON.stringify({ description: 42, instructions: 'x' }),
    });
    expect(invalid.status).toBe(400);
    expect(invalid.body.code).toBe(ERROR_CODES.validation);

    const read = await api<{ description: string; instructions: string }>(
      `/api/agents/${agentId}/profile`,
    );
    expect(read.body).toEqual({ description: 'original', instructions: 'keep me' });
  });

  it('returns not-found for an unknown agent', async () => {
    const read = await api<{ code: string }>('/api/agents/nope/profile');
    expect(read.status).toBe(404);
    expect(read.body.code).toBe(ERROR_CODES.notFound);

    const update = await api<{ code: string }>('/api/agents/nope/profile', {
      method: 'PUT',
      body: JSON.stringify({ description: '', instructions: '' }),
    });
    expect(update.status).toBe(404);
    expect(update.body.code).toBe(ERROR_CODES.notFound);
  });

  it('delivers saved instructions to the harness on the next run', async () => {
    const { agentId } = await seed();
    await api(`/api/agents/${agentId}/profile`, {
      method: 'PUT',
      body: JSON.stringify({ description: 'Tech lead', instructions: 'own the build' }),
    });
    await api(`/api/agents/${agentId}/run`, { method: 'POST' });
    expect(harness.lastRun.request.instructions).toBe('own the build');
  });
});
