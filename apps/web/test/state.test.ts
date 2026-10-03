import { describe, expect, it } from 'vitest';
import type { EventEnvelope, Snapshot } from '@ai-office/contracts';
import {
  INITIAL_STATE,
  appendOutput,
  applyEnvelope,
  applySnapshot,
  terminalTail,
} from '../src/runtime/state.js';

import { agentView, communication, session, snapshot, task } from './fixtures.js';

function envelope(type: string, payload: unknown, seq = 1): EventEnvelope {
  return { v: 1, seq, type, ts: '2026-01-01T00:00:00.000Z', payload };
}

const baseSnapshot: Snapshot = snapshot({
  agents: [agentView({ id: 'agent_1', name: 'Ada' })],
  departments: [],
  tasks: [],
  sessions: [],
});

describe('snapshot handling', () => {
  it('replaces state and does not duplicate agents on reconnect', () => {
    const first = applySnapshot(INITIAL_STATE, baseSnapshot);
    const second = applySnapshot(first, baseSnapshot);
    expect(second.agents).toHaveLength(1);
    expect(second.agents[0]?.id).toBe('agent_1');
  });

  it('keeps the current selection when the agent still exists', () => {
    const state = applySnapshot({ ...INITIAL_STATE, selectedAgentId: 'agent_1' }, baseSnapshot);
    expect(state.selectedAgentId).toBe('agent_1');
  });

  it('clears the selection when the selected agent is gone', () => {
    const state = applySnapshot(
      { ...INITIAL_STATE, selectedAgentId: 'agent_deleted' },
      baseSnapshot,
    );
    expect(state.selectedAgentId).toBeNull();
  });
});

describe('event handling', () => {
  it('upserts an updated agent rather than appending', () => {
    const state = applySnapshot(INITIAL_STATE, baseSnapshot);
    const next = applyEnvelope(state, envelope('agent.updated', { ...state.agents[0], state: 'working' }));
    expect(next.agents).toHaveLength(1);
    expect(next.agents[0]?.state).toBe('working');
  });

  it('removes an agent and clears a stale selection', () => {
    const state = { ...applySnapshot(INITIAL_STATE, baseSnapshot), selectedAgentId: 'agent_1' };
    const next = applyEnvelope(state, envelope('agent.removed', { id: 'agent_1' }));
    expect(next.agents).toHaveLength(0);
    expect(next.selectedAgentId).toBeNull();
  });

  it('upserts tasks and sessions', () => {
    let state = applySnapshot(INITIAL_STATE, baseSnapshot);
    state = applyEnvelope(state, envelope('task.updated', task({ id: 'task_1', agentId: 'agent_1' })));
    state = applyEnvelope(state, envelope('session.updated', session({ id: 'session_1', agentId: 'agent_1' })));
    expect(state.tasks).toHaveLength(1);
    expect(state.sessions).toHaveLength(1);
  });

  it('appends terminal output chunks in order', () => {
    let state = applySnapshot(INITIAL_STATE, baseSnapshot);
    state = applyEnvelope(
      state,
      envelope('session.output', { sessionId: 'session_1', agentId: 'agent_1', fromSeq: 1, chunks: ['one\n'] }),
    );
    state = applyEnvelope(
      state,
      envelope('session.output', { sessionId: 'session_1', agentId: 'agent_1', fromSeq: 2, chunks: ['two\n'] }),
    );
    expect(state.output['session_1']).toBe('one\ntwo\n');
  });

  it('updates pressure and percent on the matching agent', () => {
    const state = applySnapshot(INITIAL_STATE, baseSnapshot);
    const next = applyEnvelope(
      state,
      envelope('pressure.changed', { agentId: 'agent_1', pressure: 'critical', previous: 'warning', percent: 55 }),
    );
    expect(next.agents[0]?.pressure).toBe('critical');
  });

  it('ignores an event type it does not recognise', () => {
    const state = applySnapshot(INITIAL_STATE, baseSnapshot);
    const next = applyEnvelope(state, envelope('something.from.the.future', { anything: true }));
    expect(next).toBe(state);
  });

  it('ingests communications from a snapshot and reports the oldest retained', () => {
    const state = applySnapshot(
      INITIAL_STATE,
      snapshot({
        communications: [communication({ id: 'comm_req_task_1' })],
        oldestCommunicationId: 'comm_req_task_1',
      }),
    );
    expect(state.communications).toHaveLength(1);
    expect(state.oldestCommunicationId).toBe('comm_req_task_1');
  });

  it('upserts communication deltas in creation order', () => {
    let state = applySnapshot(INITIAL_STATE, snapshot({}));
    state = applyEnvelope(
      state,
      envelope('communication.updated', communication({ id: 'comm_b', createdAt: '2026-01-01T00:00:02.000Z' })),
    );
    state = applyEnvelope(
      state,
      envelope('communication.updated', communication({ id: 'comm_a', createdAt: '2026-01-01T00:00:01.000Z' })),
    );
    expect(state.communications.map((event) => event.id)).toEqual(['comm_a', 'comm_b']);

    state = applyEnvelope(
      state,
      envelope(
        'communication.updated',
        communication({ id: 'comm_a', createdAt: '2026-01-01T00:00:01.000Z', status: 'answered' }),
      ),
    );
    expect(state.communications).toHaveLength(2);
    expect(state.communications.find((event) => event.id === 'comm_a')?.status).toBe('answered');
  });

  it('ignores a malformed output payload instead of throwing', () => {
    const state = applySnapshot(INITIAL_STATE, baseSnapshot);
    expect(applyEnvelope(state, envelope('session.output', { nope: true }))).toBe(state);
  });

  it('records the last error for display', () => {
    const state = applyEnvelope(INITIAL_STATE, envelope('error', { code: 'conflict', message: 'nope' }));
    expect(state.lastError?.code).toBe('conflict');
  });
});

describe('terminal helpers', () => {
  it('appends without mutating the previous record', () => {
    const before = { s1: 'a' };
    const after = appendOutput(before, { sessionId: 's1', agentId: 'a1', fromSeq: 2, chunks: ['b'] });
    expect(before.s1).toBe('a');
    expect(after.s1).toBe('ab');
  });

  it('tails the requested number of lines, keeping a trailing newline', () => {
    expect(terminalTail('l1\nl2\nl3\n', 2)).toBe('l2\nl3\n');
    expect(terminalTail('only', 5)).toBe('only');
    expect(terminalTail('', 3)).toBe('');
  });
});
