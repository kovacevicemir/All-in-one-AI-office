import { describe, expect, it } from 'vitest';
import type { Task, TaskStatus } from '@ai-office/contracts';
import {
  blockedByFailure,
  computeBlockedBy,
  nextRunnableTask,
  orderQueue,
  recomputeBlocked,
  wouldCreateCycle,
} from '@ai-office/core';

let counter = 0;
function task(partial: Partial<Task> & { id: string }): Task {
  counter += 1;
  return {
    agentId: 'agent_1',
    title: partial.id,
    instruction: partial.id,
    status: 'queued' as TaskStatus,
    dependsOn: [],
    queuePosition: counter,
    origin: { kind: 'client' },
    createdAt: `2026-01-01T00:00:${String(counter).padStart(2, '0')}.000Z`,
    updatedAt: '2026-01-01T00:00:00.000Z',
    blockedBy: [],
    ...partial,
  };
}

describe('queue rules', () => {
  it('orders by queue position', () => {
    const a = task({ id: 'a', queuePosition: 2 });
    const b = task({ id: 'b', queuePosition: 1 });
    expect(orderQueue([a, b]).map((t) => t.id)).toEqual(['b', 'a']);
  });

  it('reports unfinished dependencies as blockedBy', () => {
    const done = task({ id: 'dep', status: 'done' });
    const open = task({ id: 'dep2' });
    const dependent = task({ id: 'child', dependsOn: ['dep', 'dep2'], queuePosition: 0 });
    const index = new Map([done, open, dependent].map((t) => [t.id, t]));
    expect(computeBlockedBy(dependent, index)).toEqual(['dep2']);
  });

  it('selects the earliest runnable task', () => {
    const blocked = task({ id: 'blocked', dependsOn: ['unfinished'], queuePosition: 0, status: 'blocked' });
    const ready = task({ id: 'ready', queuePosition: 1 });
    expect(nextRunnableTask([blocked, ready])?.id).toBe('ready');
  });

  it('never returns a running task as the next task', () => {
    const running = task({ id: 'running', status: 'running', queuePosition: 0 });
    expect(nextRunnableTask([running])).toBeNull();
  });

  it('returns null for an empty queue', () => {
    expect(nextRunnableTask([])).toBeNull();
  });

  it('recomputes blocked and queued without touching terminal or running tasks', () => {
    const dep = task({ id: 'dep' });
    const waiting = task({ id: 'waiting', dependsOn: ['dep'], queuePosition: 1 });
    const running = task({ id: 'running', status: 'running', queuePosition: 2 });
    const done = task({ id: 'done', status: 'done', queuePosition: 3 });

    const first = recomputeBlocked([dep, waiting, running, done]);
    const byId = new Map(first.map((t) => [t.id, t]));
    expect(byId.get('waiting')?.status).toBe('blocked');
    expect(byId.get('waiting')?.blockedBy).toEqual(['dep']);
    expect(byId.get('running')?.status).toBe('running');
    expect(byId.get('done')?.status).toBe('done');

    const completed = first.map((t) => (t.id === 'dep' ? { ...t, status: 'done' as TaskStatus } : t));
    const second = recomputeBlocked(completed);
    expect(new Map(second.map((t) => [t.id, t])).get('waiting')?.status).toBe('queued');
  });

  it('keeps dependents blocked when a dependency failed', () => {
    const failed = task({ id: 'failed', status: 'failed', queuePosition: 0 });
    const waiting = task({ id: 'waiting', dependsOn: ['failed'], queuePosition: 1 });
    const result = recomputeBlocked([failed, waiting]);
    expect(new Map(result.map((t) => [t.id, t])).get('waiting')?.status).toBe('blocked');
  });

  it('detects direct, indirect and self cycles but allows cross-agent chains', () => {
    const a = task({ id: 'a', queuePosition: 0 });
    const b = task({ id: 'b', dependsOn: ['a'], queuePosition: 1 });
    const c = task({ id: 'c', dependsOn: ['b'], queuePosition: 2 });

    expect(wouldCreateCycle([a, b, c], 'a', ['c'])).toBe(true);
    expect(wouldCreateCycle([a, b, c], 'a', ['a'])).toBe(true);
    expect(wouldCreateCycle([a, b, c], 'a', ['b'])).toBe(true);
    expect(wouldCreateCycle([a, b], 'c', ['a'])).toBe(false);
    expect(wouldCreateCycle([a, b], 'c', [])).toBe(false);
  });

  it('marks transitive dependents of a failure', () => {
    const failed = task({ id: 'failed', status: 'failed', queuePosition: 0 });
    const child = task({ id: 'child', dependsOn: ['failed'], queuePosition: 1 });
    const grandchild = task({ id: 'grandchild', dependsOn: ['child'], queuePosition: 2 });
    expect([...blockedByFailure([failed, child, grandchild])].sort()).toEqual(['child', 'grandchild']);
  });
});
