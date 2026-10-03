import { describe, expect, it } from 'vitest';
import type { Agent, Run, Task } from '@ai-office/contracts';
import {
  RETAINED_COMMUNICATIONS,
  deriveCommunications,
  describeCommunication,
  type CommunicationState,
} from '@ai-office/core';

const T0 = '2026-01-01T00:00:00.000Z';

function agent(id: string, name: string): Agent {
  return {
    id,
    name,
    workingDir: '/tmp/work',
    harnessId: 'fake',
    model: { providerId: 'fake', modelId: 'fake-1' },
    createdAt: T0,
    updatedAt: T0,
  };
}

function task(overrides: Partial<Task> & Pick<Task, 'id'>): Task {
  return {
    agentId: 'agent_2',
    title: 'A task',
    instruction: 'do it',
    status: 'queued',
    dependsOn: [],
    queuePosition: 0,
    origin: { kind: 'client' },
    createdAt: T0,
    updatedAt: T0,
    blockedBy: [],
    ...overrides,
  };
}

function run(overrides: Partial<Run> & Pick<Run, 'id' | 'taskId'>): Run {
  return {
    agentId: 'agent_2',
    sessionId: 'session_1',
    status: 'running',
    startedAt: T0,
    ...overrides,
  };
}

const ADA = agent('agent_1', 'Ada');
const GRACE = agent('agent_2', 'Grace');
const AGENTS = [ADA, GRACE];

function state(overrides: Partial<CommunicationState>): CommunicationState {
  return { tasks: [], runs: [], agents: AGENTS, ...overrides };
}

describe('deriveCommunications', () => {
  it('records a request for a task delegated by another agent', () => {
    const delegated = task({
      id: 'task_1',
      agentId: GRACE.id,
      title: 'Write the parser',
      origin: { kind: 'agent', agentId: ADA.id },
    });
    const events = deriveCommunications([], state({ tasks: [delegated] }));

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      id: 'comm_req_task_1',
      fromAgentId: ADA.id,
      toAgentId: GRACE.id,
      kind: 'request',
      status: 'open',
      taskId: 'task_1',
    });
    expect(events[0]?.summary).toContain('Ada');
    expect(events[0]?.summary).toContain('Write the parser');
  });

  it('records a hand-off when a dependency result is delivered', () => {
    const producer = task({
      id: 'task_base',
      agentId: ADA.id,
      title: 'Build the thing',
      status: 'done',
      result: { status: 'done', output: 'built', finishedAt: T0 },
    });
    const consumer = task({
      id: 'task_next',
      agentId: GRACE.id,
      title: 'Test the thing',
      dependsOn: [producer.id],
    });
    const events = deriveCommunications(
      [],
      state({ tasks: [producer, consumer], runs: [run({ id: 'run_1', taskId: consumer.id })] }),
    );

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: 'handoff',
      status: 'answered',
      fromAgentId: ADA.id,
      toAgentId: GRACE.id,
      relatedTaskId: producer.id,
      taskId: consumer.id,
    });
    expect(events[0]?.summary).toContain('Build the thing');
    expect(events[0]?.summary).toContain('delivered');
  });

  it('records nothing for unrelated agents', () => {
    const a = task({ id: 'task_a', agentId: ADA.id });
    const b = task({ id: 'task_b', agentId: GRACE.id });
    expect(deriveCommunications([], state({ tasks: [a, b] }))).toEqual([]);
  });

  it('is idempotent across re-derivation, with no duplicates', () => {
    const tasks = [
      task({ id: 'task_1', origin: { kind: 'agent', agentId: ADA.id } }),
      task({
        id: 'task_2',
        origin: { kind: 'agent', agentId: ADA.id },
        createdAt: '2026-01-01T00:00:01.000Z',
      }),
    ];
    const once = deriveCommunications([], state({ tasks }));
    const twice = deriveCommunications(once, state({ tasks }));
    expect(twice).toEqual(once);
    expect(twice).toHaveLength(2);
  });
});

describe('communication lifecycle', () => {
  function statusFor(status: Task['status']): string {
    const delegated = task({
      id: 'task_1',
      origin: { kind: 'agent', agentId: ADA.id },
      status,
    });
    return deriveCommunications([], state({ tasks: [delegated] }))[0]?.status ?? 'missing';
  }

  it('maps each terminal task status to the matching communication status', () => {
    expect(statusFor('queued')).toBe('open');
    expect(statusFor('blocked')).toBe('open');
    expect(statusFor('running')).toBe('open');
    expect(statusFor('done')).toBe('answered');
    expect(statusFor('failed')).toBe('failed');
    expect(statusFor('cancelled')).toBe('cancelled');
  });

  it('keeps the same event when its task moves to a terminal status', () => {
    const open = deriveCommunications(
      [],
      state({ tasks: [task({ id: 'task_1', origin: { kind: 'agent', agentId: ADA.id } })] }),
    );
    const answered = deriveCommunications(
      open,
      state({
        tasks: [task({ id: 'task_1', origin: { kind: 'agent', agentId: ADA.id }, status: 'done' })],
      }),
    );
    expect(answered).toHaveLength(1);
    expect(answered[0]?.id).toBe(open[0]?.id);
    expect(answered[0]?.status).toBe('answered');
  });
});

describe('describeCommunication', () => {
  const delegated = task({
    id: 'task_1',
    agentId: GRACE.id,
    title: 'Write the parser',
    origin: { kind: 'agent', agentId: ADA.id },
  });
  const event = deriveCommunications([], state({ tasks: [delegated] }))[0]!;

  it('names both agents and the ask for a request', () => {
    const description = describeCommunication(event, AGENTS, [delegated]);
    expect(description.title).toBe('Ada → Grace: Write the parser');
  });

  it('names both agents and the delivery for a hand-off', () => {
    const producer = task({
      id: 'task_base',
      agentId: ADA.id,
      title: 'Build the thing',
      status: 'done',
      result: { status: 'done', output: 'built', finishedAt: T0 },
    });
    const consumer = task({ id: 'task_next', agentId: GRACE.id, dependsOn: [producer.id] });
    const handoff = deriveCommunications(
      [],
      state({ tasks: [producer, consumer], runs: [run({ id: 'run_1', taskId: consumer.id })] }),
    )[0]!;
    const description = describeCommunication(handoff, AGENTS, [producer, consumer]);
    expect(description.title).toBe("Ada → Grace: results of 'Build the thing' delivered");
  });

  it('discloses an unknown agent instead of inventing a name', () => {
    const orphan = { ...event, fromAgentId: 'agent_gone' };
    expect(describeCommunication(orphan, AGENTS, [delegated]).title).toContain('Unknown agent (agent_gone)');
  });

  it('discloses an unknown task instead of inventing a title', () => {
    const orphan = { ...event, taskId: 'task_gone' };
    expect(describeCommunication(orphan, AGENTS, []).title).toContain('Unknown task (task_gone)');
  });
});

describe('communication retention', () => {
  it('bounds the history and advances the oldest retained id while tasks remain', () => {
    const total = RETAINED_COMMUNICATIONS + 5;
    const tasks = Array.from({ length: total }, (_, index) =>
      task({
        id: `task_${index}`,
        origin: { kind: 'agent', agentId: ADA.id },
        createdAt: new Date(Date.parse(T0) + index * 1000).toISOString(),
      }),
    );
    const events = deriveCommunications([], state({ tasks }));

    expect(events).toHaveLength(RETAINED_COMMUNICATIONS);
    expect(events[0]?.id).toBe('comm_req_task_5');
    expect(events.at(-1)?.id).toBe(`comm_req_task_${total - 1}`);
    expect(tasks).toHaveLength(total);
  });

  it('re-derives the same events from retained state after a restart', () => {
    const tasks = [task({ id: 'task_1', origin: { kind: 'agent', agentId: ADA.id } })];
    const before = deriveCommunications([], state({ tasks }));
    const after = deriveCommunications([], state({ tasks }));
    expect(after).toEqual(before);
  });
});
