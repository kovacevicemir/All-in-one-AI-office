import { beforeEach, describe, expect, it } from 'vitest';
import { RuntimeClient, type ClientEvent } from '../src/runtime/client.js';
import { snapshot } from './fixtures.js';

/** Minimal scriptable WebSocket so reconnect behaviour is deterministic. */
class FakeSocket {
  static instances: FakeSocket[] = [];
  readyState = 0;
  readonly sent: string[] = [];
  private readonly listeners = new Map<string, ((event: unknown) => void)[]>();

  constructor(readonly url: string) {
    FakeSocket.instances.push(this);
  }

  addEventListener(type: string, listener: (event: unknown) => void): void {
    const existing = this.listeners.get(type) ?? [];
    existing.push(listener);
    this.listeners.set(type, existing);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = 3;
    this.fire('close', {});
  }

  open(): void {
    this.readyState = 1;
    this.fire('open', {});
  }

  deliver(message: unknown): void {
    this.fire('message', { data: JSON.stringify(message) });
  }

  deliverRaw(data: string): void {
    this.fire('message', { data });
  }

  private fire(type: string, event: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

function envelope(type: string, payload: unknown): unknown {
  return { v: 1, seq: 1, type, ts: '2026-01-01T00:00:00.000Z', payload };
}

let timers: (() => void)[];

function makeClient(): { client: RuntimeClient; events: ClientEvent[] } {
  const events: ClientEvent[] = [];
  const client = new RuntimeClient({
    baseUrl: 'http://runtime.test',
    WebSocketImpl: FakeSocket as unknown as typeof WebSocket,
    setTimeoutImpl: ((callback: () => void) => {
      timers.push(callback);
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }) as unknown as typeof setTimeout,
    clearTimeoutImpl: (() => undefined) as unknown as typeof clearTimeout,
  });
  client.on((event) => events.push(event));
  return { client, events };
}

beforeEach(() => {
  FakeSocket.instances = [];
  timers = [];
});

describe('RuntimeClient transport', () => {
  it('reports connecting then connected', () => {
    const { client, events } = makeClient();
    client.connect();
    FakeSocket.instances[0]?.open();
    expect(events.filter((event) => event.kind === 'status').map((event) => (event as { status: string }).status)).toEqual([
      'connecting',
      'connected',
    ]);
  });

  it('delivers a snapshot and tolerates an unknown event type', () => {
    const { client, events } = makeClient();
    client.connect();
    const socket = FakeSocket.instances[0] as FakeSocket;
    socket.open();
    socket.deliver(envelope('snapshot', snapshot()));
    socket.deliver(envelope('a.brand.new.type', { hello: true }));

    expect(events.some((event) => event.kind === 'snapshot')).toBe(true);
    // Unknown types still surface as envelopes (the reducer ignores them).
    expect(events.filter((event) => event.kind === 'envelope')).toHaveLength(1);
  });

  it('ignores malformed frames instead of throwing', () => {
    const { client, events } = makeClient();
    client.connect();
    const socket = FakeSocket.instances[0] as FakeSocket;
    socket.open();
    socket.deliverRaw('{ not json');
    socket.deliver({ nope: true });
    expect(events.filter((event) => event.kind !== 'status')).toHaveLength(0);
  });

  it('reconnects after a drop and never duplicates listeners', () => {
    const { client, events } = makeClient();
    client.connect();
    const first = FakeSocket.instances[0] as FakeSocket;
    first.open();
    first.close();

    expect(events.at(-1)).toMatchObject({ kind: 'status', status: 'disconnected' });
    expect(timers).toHaveLength(1);
    timers[0]?.();
    expect(FakeSocket.instances).toHaveLength(2);
    expect(events.filter((event) => event.kind === 'status').map((event) => (event as { status: string }).status)).toEqual([
      'connecting',
      'connected',
      'disconnected',
      'connecting',
    ]);
  });

  it('does not reconnect after an explicit close', () => {
    const { client } = makeClient();
    client.connect();
    const socket = FakeSocket.instances[0] as FakeSocket;
    socket.open();
    client.close();
    expect(timers).toHaveLength(0);
  });

  it('reports an error when sending while disconnected', () => {
    const { client, events } = makeClient();
    client.send({ type: 'cancel', agentId: 'a' });
    expect(events.at(-1)).toMatchObject({ kind: 'error' });
  });

  it('forwards a subscribe command over the socket', () => {
    const { client } = makeClient();
    client.connect();
    const socket = FakeSocket.instances[0] as FakeSocket;
    socket.open();
    client.send({ type: 'subscribe', agentId: 'agent_1' });
    expect(JSON.parse(socket.sent[0] as string)).toEqual({ type: 'subscribe', agentId: 'agent_1' });
  });
});

describe('RuntimeClient HTTP', () => {
  it('surfaces the runtime error shape on a failed request', async () => {
    const error = { code: 'conflict', message: 'Agent already has a run in progress' };
    const client = new RuntimeClient({
      baseUrl: 'http://runtime.test',
      fetchImpl: (async () =>
        new Response(JSON.stringify(error), { status: 409 })) as unknown as typeof fetch,
    });
    const events: ClientEvent[] = [];
    client.on((event) => events.push(event));

    await expect(client.start('agent_1')).rejects.toMatchObject({ code: 'conflict' });
    expect(events.at(-1)).toMatchObject({ kind: 'error' });
  });

  it('parses a successful response body', async () => {
    const client = new RuntimeClient({
      baseUrl: 'http://runtime.test',
      fetchImpl: (async () =>
        new Response(JSON.stringify({ runId: 'run_1', taskId: 'task_1', sessionId: 'session_1' }), {
          status: 200,
        })) as unknown as typeof fetch,
    });
    await expect(client.start('agent_1')).resolves.toEqual({
      runId: 'run_1',
      taskId: 'task_1',
      sessionId: 'session_1',
    });
  });

  it('fetches retained communications with an optional agent filter', async () => {
    const calls: string[] = [];
    const client = new RuntimeClient({
      baseUrl: 'http://runtime.test',
      fetchImpl: (async (input: RequestInfo | URL) => {
        calls.push(String(input));
        return new Response(JSON.stringify([{ id: 'comm_1' }]), { status: 200 });
      }) as unknown as typeof fetch,
    });

    await expect(client.fetchCommunications()).resolves.toHaveLength(1);
    await client.fetchCommunications('agent_1');
    expect(calls[0]).toBe('http://runtime.test/api/communications');
    expect(calls[1]).toBe('http://runtime.test/api/communications?agentId=agent_1');
  });

  it('reads and saves an agent profile over the documented endpoints', async () => {
    const calls: { url: string; method: string; body: unknown }[] = [];
    const profile = { description: 'Tech lead', instructions: 'own the build' };
    const client = new RuntimeClient({
      baseUrl: 'http://runtime.test',
      fetchImpl: (async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({
          url: String(input),
          method: init?.method ?? 'GET',
          body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
        });
        return new Response(JSON.stringify(profile), { status: 200 });
      }) as unknown as typeof fetch,
    });

    await expect(client.fetchAgentProfile('agent_1')).resolves.toEqual(profile);
    await expect(client.saveAgentProfile('agent_1', profile)).resolves.toEqual(profile);
    expect(calls[0]).toMatchObject({
      url: 'http://runtime.test/api/agents/agent_1/profile',
      method: 'GET',
    });
    expect(calls[1]).toMatchObject({
      url: 'http://runtime.test/api/agents/agent_1/profile',
      method: 'PUT',
      body: profile,
    });
  });
});
