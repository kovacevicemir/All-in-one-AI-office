import { describe, expect, it } from 'vitest';
import { RuntimeClient } from '../src/runtime/client.js';
import { createOfficeStore } from '../src/runtime/store.js';

const agentInput = {
  name: 'Ada',
  workingDir: String.raw`C:\Users\emir\Documents\Personal Projects\outwar electron`,
  harnessId: 'pi',
  model: { providerId: 'deepseek', modelId: 'deepseek-flash' },
};

function clientReturning(status: number, body: unknown): RuntimeClient {
  return new RuntimeClient({
    baseUrl: 'http://runtime.test',
    fetchImpl: (async () =>
      new Response(JSON.stringify(body), { status })) as unknown as typeof fetch,
  });
}

describe('store: agent creation feedback', () => {
  it('succeeds, announces it, and selects the new agent', async () => {
    const store = createOfficeStore(clientReturning(201, { id: 'agent_1' }));
    await expect(store.createAgent(agentInput)).resolves.toBe(true);

    expect(store.getState().notice).toContain('Ada');
    expect(store.getState().selectedAgentId).toBe('agent_1');
    expect(store.getState().busy).toBe(false);
  });

  it('surfaces a rejected working directory instead of failing silently', async () => {
    const store = createOfficeStore(
      clientReturning(400, {
        code: 'validation_error',
        message: `Working directory does not exist: ${agentInput.workingDir}`,
      }),
    );

    await expect(store.createAgent(agentInput)).resolves.toBe(false);
    expect(store.getState().notice).toContain('does not exist');
    expect(store.getState().lastError?.code).toBe('validation_error');
    expect(store.getState().notice).not.toBeNull();
  });

  it('surfaces a conflict from the runtime', async () => {
    const store = createOfficeStore(
      clientReturning(409, { code: 'conflict', message: 'Agent "Ada" already has a run in progress' }),
    );
    await store.start('agent_1');
    expect(store.getState().notice).toContain('already has a run in progress');
  });

  it('lets the user dismiss a message', async () => {
    const store = createOfficeStore(clientReturning(400, { code: 'validation_error', message: 'nope' }));
    await store.createAgent(agentInput);
    store.dismissNotice();
    store.dismissError();
    expect(store.getState().notice).toBeNull();
    expect(store.getState().lastError).toBeNull();
  });

  it('reports the delivery semantics when prompting a live session', async () => {
    const store = createOfficeStore(clientReturning(200, { delivery: 'steer' }));
    await expect(store.prompt('agent_1', 'also update the docs')).resolves.toBe('steer');
    expect(store.getState().notice).toContain('steer');
  });
});

describe('store: agent profile', () => {
  it('saves a profile with the documented request shape and records the response', async () => {
    const calls: { method: string; body: unknown }[] = [];
    const client = new RuntimeClient({
      baseUrl: 'http://runtime.test',
      fetchImpl: (async (_input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({
          method: init?.method ?? 'GET',
          body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
        });
        return new Response(JSON.stringify({ description: 'Tech lead', instructions: 'own it' }), {
          status: 200,
        });
      }) as unknown as typeof fetch,
    });
    const store = createOfficeStore(client);
    const profile = { description: 'Tech lead', instructions: 'own it' };

    await expect(store.saveProfile('agent_1', profile)).resolves.toEqual({ ok: true });
    expect(calls[0]).toMatchObject({ method: 'PUT', body: profile });
    expect(store.getState().profiles['agent_1']).toEqual(profile);
    expect(store.getState().notice).toContain('saved');
  });

  it('reports a rejected save without inventing a stored profile', async () => {
    const store = createOfficeStore(
      clientReturning(400, { code: 'validation_error', message: 'Description is too long' }),
    );
    const result = await store.saveProfile('agent_1', { description: 'x', instructions: 'y' });
    expect(result).toEqual({ ok: false, error: 'Description is too long' });
    expect(store.getState().notice).toContain('Description is too long');
    expect(store.getState().profiles['agent_1']).toBeUndefined();
  });
});
