import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_PRESSURE_THRESHOLDS,
  ERROR_CODES,
  type PressureThresholds,
  type Task,
} from '@ai-office/contracts';
import { Office, OfficeFailure, type EventSink, type ModelProvider } from '@ai-office/core';
import { MemoryStore, ScriptedHarness, fixedClock, sequenceIds } from '@ai-office/adapter-fake';

const provider: ModelProvider = {
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

function setup(thresholds: PressureThresholds = DEFAULT_PRESSURE_THRESHOLDS) {
  const harness = new ScriptedHarness();
  const other = new ScriptedHarness({ id: 'fake-b', label: 'Scripted B' });
  const store = new MemoryStore();
  const events: { type: string; payload: unknown }[] = [];
  const sink: EventSink = { emit: (type, payload) => events.push({ type, payload }) };
  const office = new Office({
    harnesses: [harness, other],
    providers: [provider],
    store,
    sink,
    thresholds,
    now: fixedClock(),
    newId: sequenceIds(),
    pathExists: async (path) => !path.includes('does-not-exist'),
  });
  return { office, harness, other, store, events };
}

async function withAgent(
  office: Office,
  name: string,
  harnessId = 'fake',
): Promise<string> {
  const agent = await office.createAgent({
    name,
    workingDir: '/tmp/work',
    harnessId,
    model: { providerId: 'fake', modelId: 'fake-1' },
  });
  return agent.id;
}

function eventTypes(events: { type: string }[]): string[] {
  return events.map((event) => event.type);
}

describe('office: workforce', () => {
  let ctx: ReturnType<typeof setup>;

  beforeEach(async () => {
    ctx = setup();
    await ctx.office.init();
  });

  it('creates departments and groups agents', async () => {
    const department = ctx.office.createDepartment('Engineering');
    const agentId = await withAgent(ctx.office, 'Ada');
    ctx.office.updateAgent(agentId, { departmentId: department.id });

    expect(ctx.office.listDepartments()).toHaveLength(1);
    expect(ctx.office.getAgent(agentId).departmentId).toBe(department.id);
  });

  it('rejects duplicate agent and department names', async () => {
    await withAgent(ctx.office, 'Ada');
    await expect(withAgent(ctx.office, 'Ada')).rejects.toThrow(/already exists/);
    ctx.office.createDepartment('Ops');
    expect(() => ctx.office.createDepartment('Ops')).toThrow(/already exists/);
  });

  it('rejects a missing working directory', async () => {
    await expect(
      ctx.office.createAgent({
        name: 'Ghost',
        workingDir: '/does-not-exist',
        harnessId: 'fake',
        model: { providerId: 'fake', modelId: 'fake-1' },
      }),
    ).rejects.toThrow(/does not exist/);
  });

  it('rejects an unknown harness or provider, listing what is registered', async () => {
    await expect(
      ctx.office.createAgent({
        name: 'X',
        workingDir: '/tmp/work',
        harnessId: 'nope',
        model: { providerId: 'fake', modelId: 'fake-1' },
      }),
    ).rejects.toThrow(/Unknown harness adapter/);

    try {
      await ctx.office.createAgent({
        name: 'Y',
        workingDir: '/tmp/work',
        harnessId: 'fake',
        model: { providerId: 'nope', modelId: 'fake-1' },
      });
      throw new Error('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(OfficeFailure);
      expect((error as OfficeFailure).details?.registered).toEqual(['fake']);
    }
  });

  it('keeps agents and unassigns them when their department is deleted', async () => {
    const department = ctx.office.createDepartment('Engineering');
    const agentId = await withAgent(ctx.office, 'Ada');
    ctx.office.updateAgent(agentId, { departmentId: department.id });

    ctx.office.deleteDepartment(department.id);

    expect(ctx.office.listDepartments()).toHaveLength(0);
    expect(ctx.office.getAgent(agentId).departmentId).toBeUndefined();
    expect(ctx.office.listAgents()).toHaveLength(1);
  });
});

describe('office: task queue and dependencies', () => {
  let ctx: ReturnType<typeof setup>;
  let agentId: string;

  beforeEach(async () => {
    ctx = setup();
    await ctx.office.init();
    agentId = await withAgent(ctx.office, 'Ada');
  });

  it('appends tasks in order and reports the first as next', () => {
    const first = ctx.office.createTask({ agentId, title: 'First', instruction: 'first' });
    ctx.office.createTask({ agentId, title: 'Second', instruction: 'second' });

    expect(ctx.office.listTasks(agentId).map((task) => task.title)).toEqual(['First', 'Second']);
    expect(ctx.office.getAgent(agentId).nextTaskId).toBe(first.id);
  });

  it('blocks a dependent task and reports what it waits on', () => {
    const dependency = ctx.office.createTask({ agentId, title: 'Base', instruction: 'base' });
    const dependent = ctx.office.createTask({
      agentId,
      title: 'Follow-up',
      instruction: 'follow up',
      dependsOn: [dependency.id],
    });

    expect(ctx.office.getTask(dependent.id).status).toBe('blocked');
    expect(ctx.office.getTask(dependent.id).blockedBy).toEqual([dependency.id]);
    expect(ctx.office.getAgent(agentId).state).toBe('waiting');
    expect(ctx.office.getAgent(agentId).waitingOn).toEqual([dependency.id]);
    expect(ctx.office.getAgent(agentId).nextTaskId).toBe(dependency.id);
  });

  it('unblocks dependents when the dependency completes, without recreating them', async () => {
    const dependency = ctx.office.createTask({ agentId, title: 'Base', instruction: 'base' });
    const dependent = ctx.office.createTask({
      agentId,
      title: 'Follow-up',
      instruction: 'follow up',
      dependsOn: [dependency.id],
    });

    await ctx.office.startRun(agentId);
    ctx.harness.lastRun.complete('base result');

    expect(ctx.office.getTask(dependency.id).status).toBe('done');
    expect(ctx.office.getTask(dependent.id).status).toBe('queued');
    expect(ctx.office.getTask(dependent.id).id).toBe(dependent.id);
    expect(ctx.office.getAgent(agentId).state).toBe('done');
    expect(ctx.office.getAgent(agentId).waitingOn).toEqual([]);
  });

  it('rejects a dependency cycle and self-dependency', () => {
    const a = ctx.office.createTask({ agentId, title: 'A', instruction: 'a' });
    const b = ctx.office.createTask({ agentId, title: 'B', instruction: 'b', dependsOn: [a.id] });
    const c = ctx.office.createTask({ agentId, title: 'C', instruction: 'c', dependsOn: [b.id] });

    expect(() => ctx.office.setTaskDependencies(a.id, [c.id])).toThrow(/cycle/);
    expect(() => ctx.office.setTaskDependencies(b.id, [b.id])).toThrow(/cycle/);
    expect(ctx.office.getTask(a.id).dependsOn).toEqual([]);
  });

  it('supports cross-agent dependencies', async () => {
    const otherAgent = await withAgent(ctx.office, 'Grace', 'fake-b');
    const base = ctx.office.createTask({ agentId, title: 'Base', instruction: 'base' });
    const dependent = ctx.office.createTask({
      agentId: otherAgent,
      title: 'Consumes base',
      instruction: 'use base',
      dependsOn: [base.id],
    });

    await ctx.office.startRun(agentId);
    ctx.harness.lastRun.complete('the base report');

    expect(ctx.office.getTask(dependent.id).status).toBe('queued');
    await ctx.office.startRun(otherAgent);
    expect(ctx.other.lastRun.request.dependencyResults).toEqual([
      { taskId: base.id, title: 'Base', output: 'the base report' },
    ]);
  });

  it('reorders queued work without displacing a running task', async () => {
    ctx.office.createTask({ agentId, title: 'A', instruction: 'a' });
    const b = ctx.office.createTask({ agentId, title: 'B', instruction: 'b' });
    const c = ctx.office.createTask({ agentId, title: 'C', instruction: 'c' });

    await ctx.office.startRun(agentId); // A is running at position 0
    ctx.office.reorderTask(c.id, 0);

    const ordered = ctx.office.listTasks(agentId);
    expect(ordered[0]?.title).toBe('A');
    expect(ordered[0]?.status).toBe('running');
    expect(ordered[1]?.title).toBe('C');
    expect(ordered[2]?.title).toBe('B');
    expect(ctx.office.getTask(b.id).queuePosition).toBe(2);
  });

  it('re-queues a finished task to run again and clears its result', async () => {
    const task = ctx.office.createTask({ agentId, title: 'Ship it', instruction: 'ship it' });
    await ctx.office.startRun(agentId);
    ctx.harness.lastRun.complete('first pass');
    expect(ctx.office.getTask(task.id).status).toBe('done');

    const reopened = ctx.office.reopenTask(task.id);
    expect(reopened.status).toBe('queued');
    expect(reopened.result).toBeUndefined();
    expect(ctx.office.getAgent(agentId).nextTaskId).toBe(task.id);

    await ctx.office.startRun(agentId);
    expect(ctx.harness.lastRun.request.instruction).toBe('ship it');
  });

  it('refuses to re-queue a task that has not finished', () => {
    const task = ctx.office.createTask({ agentId, title: 'Live', instruction: 'live' });
    expect(() => ctx.office.reopenTask(task.id)).toThrow(/finished/);
  });

  it('records delegation origin', async () => {
    const originator = await withAgent(ctx.office, 'Orchestrator', 'fake-b');
    const delegated = ctx.office.createTask({
      agentId,
      title: 'Delegated',
      instruction: 'do it',
      origin: { kind: 'agent', agentId: originator },
    });
    expect(delegated.origin).toEqual({ kind: 'agent', agentId: originator });
  });
});

describe('office: run loop', () => {
  let ctx: ReturnType<typeof setup>;
  let agentId: string;

  beforeEach(async () => {
    ctx = setup();
    await ctx.office.init();
    agentId = await withAgent(ctx.office, 'Ada');
  });

  it('links task, run, and session and reports a working agent', async () => {
    const task = ctx.office.createTask({ agentId, title: 'Ship it', instruction: 'ship it' });
    const started = await ctx.office.startRun(agentId);

    expect(started.taskId).toBe(task.id);
    const agent = ctx.office.getAgent(agentId);
    expect(agent.state).toBe('working');
    expect(agent.activity).toBe('Working on: Ship it');
    expect(agent.currentTaskId).toBe(task.id);
    expect(agent.sessionId).toBe(started.sessionId);
    expect(ctx.office.getTask(task.id).status).toBe('running');
    expect(ctx.office.getSession(started.sessionId).status).toBe('running');
    expect(ctx.office.listRuns()[0]?.status).toBe('running');
  });

  it('passes the instruction to the harness verbatim', async () => {
    const instruction = 'refactor auth\nwith no wrapper  ';
    ctx.office.createTask({ agentId, title: 'Task', instruction });
    const { sessionId } = await ctx.office.startRun(agentId);

    expect(ctx.harness.lastRun.request.instruction).toBe(instruction);
    const recorded = ctx.office.promptsFor(sessionId).filter((entry) => entry.kind === 'instruction');
    expect(recorded[0]?.text).toBe(instruction);
  });

  it('completes a run, records the result, and does not auto-start the next task', async () => {
    ctx.office.createTask({ agentId, title: 'One', instruction: 'one' });
    const second = ctx.office.createTask({ agentId, title: 'Two', instruction: 'two' });
    const { sessionId } = await ctx.office.startRun(agentId);

    ctx.harness.lastRun.output('working...\n');
    ctx.harness.lastRun.complete('all done');

    const agent = ctx.office.getAgent(agentId);
    expect(agent.state).toBe('done');
    expect(ctx.office.getTask(second.id).status).toBe('queued');
    expect(ctx.office.getSession(sessionId).status).toBe('exited');
    expect(ctx.office.getTask(second.id).status).toBe('queued');

    const first = ctx.office.listTasks(agentId)[0] as Task;
    expect(first.result?.output).toBe('all done');
    expect(first.result?.status).toBe('done');
    expect(ctx.office.getSession(sessionId).telemetry).toBeUndefined();
  });

  it('records failure reason and moves the agent to error', async () => {
    const task = ctx.office.createTask({ agentId, title: 'Doomed', instruction: 'boom' });
    await ctx.office.startRun(agentId);
    ctx.harness.lastRun.fail('model exploded');

    expect(ctx.office.getTask(task.id).status).toBe('failed');
    expect(ctx.office.getTask(task.id).result?.failureReason).toBe('model exploded');
    expect(ctx.office.getAgent(agentId).state).toBe('error');
    expect(ctx.office.listRuns()[0]?.failureReason).toBe('model exploded');
  });

  it('cancels a run', async () => {
    const task = ctx.office.createTask({ agentId, title: 'Cancel me', instruction: 'go' });
    await ctx.office.startRun(agentId);
    await ctx.office.cancelRun(agentId);

    expect(ctx.harness.lastRun.killed).toBe(true);
    expect(ctx.office.getTask(task.id).status).toBe('cancelled');
    expect(ctx.office.getAgent(agentId).state).toBe('idle');
  });

  it('rejects a second run for the same agent but allows different agents in parallel', async () => {
    const other = await withAgent(ctx.office, 'Grace', 'fake-b');
    ctx.office.createTask({ agentId, title: 'A', instruction: 'a' });
    ctx.office.createTask({ agentId: other, title: 'B', instruction: 'b' });

    await ctx.office.startRun(agentId);
    await expect(ctx.office.startRun(agentId)).rejects.toThrow(/already has a run/);
    await ctx.office.startRun(other);

    expect(ctx.office.getAgent(agentId).state).toBe('working');
    expect(ctx.office.getAgent(other).state).toBe('working');
    expect(ctx.office.listRuns().filter((run) => run.status === 'running')).toHaveLength(2);
  });

  it('refuses to start when every task is blocked', async () => {
    const base = ctx.office.createTask({ agentId, title: 'Base', instruction: 'base' });
    const blocker = ctx.office.createTask({
      agentId: (await withAgent(ctx.office, 'Other', 'fake-b')) as string,
      title: 'Blocker',
      instruction: 'block',
    });
    ctx.office.setTaskDependencies(base.id, [blocker.id]);

    await expect(ctx.office.startRun(agentId)).rejects.toThrow(/blocked by dependencies/);
  });

  it('refuses to start with an empty queue', async () => {
    await expect(ctx.office.startRun(agentId)).rejects.toThrow(/no queued task/);
  });

  it('fails the run when the harness reports it is unavailable', async () => {
    ctx.harness.available = false;
    ctx.office.createTask({ agentId, title: 'Task', instruction: 'x' });

    await expect(ctx.office.startRun(agentId)).rejects.toThrow(/not available/);
    expect(ctx.office.getAgent(agentId).state).toBe('idle');
    expect(ctx.office.listSessions()[0]?.status).not.toBe('running');
  });

  it('buffers terminal output for backfill with sequence numbers', async () => {
    ctx.office.createTask({ agentId, title: 'Talker', instruction: 'x' });
    const { sessionId } = await ctx.office.startRun(agentId);
    ctx.harness.lastRun.output('line one\n');
    ctx.harness.lastRun.output('line two\n');

    const slice = ctx.office.sessionOutput(sessionId);
    expect(slice.chunks.map((chunk) => chunk.data)).toEqual(['line one\n', 'line two\n']);
    expect(slice.oldestSeq).toBe(1);
    expect(slice.lastSeq).toBe(2);
    expect(ctx.office.sessionOutput(sessionId, 1).chunks).toHaveLength(1);
    expect(ctx.office.sessionTail(sessionId, 1)).toBe('line two\n');
  });
});

describe('office: context pressure and prompting', () => {
  let ctx: ReturnType<typeof setup>;
  let agentId: string;

  beforeEach(async () => {
    ctx = setup({ warning: 30, critical: 50, hysteresis: 5 });
    await ctx.office.init();
    agentId = await withAgent(ctx.office, 'Ada');
  });

  it('starts unknown, escalates at the thresholds, and never stops the run', async () => {
    ctx.office.createTask({ agentId, title: 'Long task', instruction: 'work' });
    await ctx.office.startRun(agentId);
    expect(ctx.office.getAgent(agentId).pressure).toBe('unknown');

    ctx.harness.lastRun.telemetry(12, 120_000, 1_000_000);
    expect(ctx.office.getAgent(agentId).pressure).toBe('nominal');

    ctx.harness.lastRun.telemetry(30, 300_000, 1_000_000);
    expect(ctx.office.getAgent(agentId).pressure).toBe('warning');
    expect(ctx.office.getAgent(agentId).contextUsage?.percent).toBe(30);

    ctx.harness.lastRun.telemetry(50, 500_000, 1_000_000);
    expect(ctx.office.getAgent(agentId).pressure).toBe('critical');

    // Advisory only: the run keeps going.
    expect(ctx.office.getAgent(agentId).state).toBe('working');
    expect(ctx.harness.lastRun.killed).toBe(false);
  });

  it('emits one pressure event per threshold crossing', async () => {
    ctx.office.createTask({ agentId, title: 'Task', instruction: 'work' });
    await ctx.office.startRun(agentId);
    ctx.events.length = 0;

    ctx.harness.lastRun.telemetry(12);
    ctx.harness.lastRun.telemetry(20);
    ctx.harness.lastRun.telemetry(31);
    ctx.harness.lastRun.telemetry(35);
    ctx.harness.lastRun.telemetry(55);

    const pressureEvents = ctx.events.filter((event) => event.type === 'pressure.changed');
    expect(pressureEvents.map((event) => (event.payload as { pressure: string }).pressure)).toEqual([
      'nominal',
      'warning',
      'critical',
    ]);
  });

  it('reports unknown when telemetry is unavailable', async () => {
    ctx.office.createTask({ agentId, title: 'Task', instruction: 'work' });
    await ctx.office.startRun(agentId);
    ctx.harness.lastRun.telemetry(80);
    expect(ctx.office.getAgent(agentId).pressure).toBe('critical');

    ctx.harness.lastRun.telemetryUnavailable();
    expect(ctx.office.getAgent(agentId).pressure).toBe('unknown');
    expect(ctx.office.getAgent(agentId).contextUsage).toBeNull();
  });

  it('accepts a prompt on a live session and reports the delivery semantics', async () => {
    ctx.office.createTask({ agentId, title: 'Task', instruction: 'work' });
    const { sessionId } = await ctx.office.startRun(agentId);

    const delivery = await ctx.office.prompt(agentId, 'also update the docs');
    expect(delivery).toBe('sent');
    expect(ctx.harness.lastRun.prompts.at(-1)).toEqual({
      text: 'also update the docs',
      delivery: 'sent',
    });
    expect(ctx.office.promptsFor(sessionId).at(-1)).toEqual({
      text: 'also update the docs',
      kind: 'client',
    });
  });

  it('rejects prompting an agent with no live session', async () => {
    await expect(ctx.office.prompt(agentId, 'hello')).rejects.toThrow(/no live session/);
  });

  it('rejects prompting when the adapter cannot accept mid-run input', async () => {
    ctx.harness.capabilities.midRunPrompt = false;
    ctx.office.createTask({ agentId, title: 'Task', instruction: 'work' });
    await ctx.office.startRun(agentId);

    try {
      await ctx.office.prompt(agentId, 'hello');
      throw new Error('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(OfficeFailure);
      expect((error as OfficeFailure).code).toBe(ERROR_CODES.unsupported);
    }
  });

  it('rejects resize when the adapter has not declared it', async () => {
    ctx.office.createTask({ agentId, title: 'Task', instruction: 'work' });
    await ctx.office.startRun(agentId);
    expect(() => ctx.office.resize(agentId, 100, 40)).toThrow(/does not support terminal resize/);
  });
});

describe('office: persistence and recovery', () => {
  it('restores definitions across a restart and marks in-flight runs interrupted', async () => {
    const first = setup();
    await first.office.init();
    const department = first.office.createDepartment('Engineering');
    const agentId = await withAgent(first.office, 'Ada');
    first.office.updateAgent(agentId, { departmentId: department.id });
    const task = first.office.createTask({ agentId, title: 'Long', instruction: 'work' });
    await first.office.startRun(agentId);
    await first.office.flush();

    // Simulate a hard stop: the run never reached a terminal outcome.
    const persisted = first.store.peek();
    expect(persisted?.runs[0]?.status).toBe('running');

    const second = setup();
    second.store.save(persisted ?? { departments: [], agents: [], tasks: [], runs: [], sessions: [], communications: [] });
    await second.office.init();

    expect(second.office.listDepartments()).toHaveLength(1);
    expect(second.office.listAgents()[0]?.id).toBe(agentId);
    expect(second.office.getTask(task.id).title).toBe('Long');
    expect(second.office.listRuns()[0]?.status).toBe('interrupted');
    expect(second.office.getAgent(agentId).state).toBe('idle');
  });

  it('emits events for agents, tasks and sessions', async () => {
    const ctx = setup();
    await ctx.office.init();
    const agentId = await withAgent(ctx.office, 'Ada');
    const task = ctx.office.createTask({ agentId, title: 'Task', instruction: 'x' });
    await ctx.office.startRun(agentId);
    ctx.harness.lastRun.output('some output\n');
    ctx.harness.lastRun.complete('ok');

    const types = eventTypes(ctx.events);
    expect(types).toContain('agent.updated');
    expect(types).toContain('task.updated');
    expect(types).toContain('session.updated');
    expect(types).toContain('run.updated');
    expect(types).toContain('session.output');
    expect(ctx.office.getTask(task.id).status).toBe('done');
  });
});

describe('office: inter-agent communication', () => {
  it('records a delegation and publishes it in the snapshot and stream', async () => {
    const ctx = setup();
    await ctx.office.init();
    const ada = await withAgent(ctx.office, 'Ada');
    const grace = await withAgent(ctx.office, 'Grace', 'fake-b');
    const task = ctx.office.createTask({
      agentId: grace,
      title: 'Write the parser',
      instruction: 'write',
      origin: { kind: 'agent', agentId: ada },
    });

    expect(ctx.office.listCommunications()).toHaveLength(1);
    expect(ctx.office.listCommunications()[0]).toMatchObject({
      kind: 'request',
      status: 'open',
      fromAgentId: ada,
      toAgentId: grace,
      taskId: task.id,
    });
    expect(eventTypes(ctx.events)).toContain('communication.updated');
    expect(ctx.office.snapshot().communications).toHaveLength(1);
  });

  it('anchors a hand-off to the dependent session when it runs', async () => {
    const ctx = setup();
    await ctx.office.init();
    const ada = await withAgent(ctx.office, 'Ada');
    const grace = await withAgent(ctx.office, 'Grace', 'fake-b');
    const base = ctx.office.createTask({ agentId: ada, title: 'Base', instruction: 'base' });
    await ctx.office.startRun(ada);
    ctx.harness.lastRun.complete('base report');

    const dependent = ctx.office.createTask({
      agentId: grace,
      title: 'Use base',
      instruction: 'use',
      dependsOn: [base.id],
    });
    const { sessionId } = await ctx.office.startRun(grace);

    const handoff = ctx.office.listCommunications().find((event) => event.kind === 'handoff');
    expect(handoff).toMatchObject({
      fromAgentId: ada,
      toAgentId: grace,
      relatedTaskId: base.id,
      taskId: dependent.id,
      status: 'answered',
      sessionId,
    });
  });

  it('filters by agent and rejects an unknown agent', async () => {
    const ctx = setup();
    await ctx.office.init();
    const ada = await withAgent(ctx.office, 'Ada');
    const grace = await withAgent(ctx.office, 'Grace', 'fake-b');
    ctx.office.createTask({
      agentId: grace,
      title: 'Delegated',
      instruction: 'x',
      origin: { kind: 'agent', agentId: ada },
    });

    expect(ctx.office.listCommunications(ada)).toHaveLength(1);
    expect(ctx.office.listCommunications(grace)).toHaveLength(1);
    expect(() => ctx.office.listCommunications('missing')).toThrow(/Unknown agent/);
  });

  it('retains communications across a restart', async () => {
    const first = setup();
    await first.office.init();
    const ada = await withAgent(first.office, 'Ada');
    const grace = await withAgent(first.office, 'Grace', 'fake-b');
    first.office.createTask({
      agentId: grace,
      title: 'Delegated',
      instruction: 'x',
      origin: { kind: 'agent', agentId: ada },
    });
    await first.office.flush();

    const second = setup();
    second.store.save(first.store.peek()!);
    await second.office.init();

    expect(second.office.listCommunications()).toHaveLength(1);
    expect(second.office.listCommunications()[0]?.id).toBe(first.office.listCommunications()[0]?.id);
  });
});

describe('office: agent profiles', () => {
  let ctx: ReturnType<typeof setup>;
  let agentId: string;

  beforeEach(async () => {
    ctx = setup();
    await ctx.office.init();
    agentId = await withAgent(ctx.office, 'Ada');
  });

  it('stores a profile and reads it back', async () => {
    await ctx.office.setAgentProfile(agentId, {
      description: 'Tech lead',
      instructions: 'own the build',
    });
    await expect(ctx.office.getAgentProfile(agentId)).resolves.toEqual({
      description: 'Tech lead',
      instructions: 'own the build',
    });
  });

  it('sends an agent instructions to the harness, but never the description', async () => {
    await ctx.office.setAgentProfile(agentId, {
      description: 'Tech lead',
      instructions: 'own the build',
    });
    ctx.office.createTask({ agentId, title: 'Ship it', instruction: 'ship it' });
    await ctx.office.startRun(agentId);

    expect(ctx.harness.lastRun.request.instructions).toBe('own the build');
    expect(JSON.stringify(ctx.harness.lastRun.request)).not.toContain('Tech lead');
    expect(ctx.harness.lastRun.request.instruction).toBe('ship it');
  });

  it('sends no instructions when the agent has no profile', async () => {
    ctx.office.createTask({ agentId, title: 'Ship it', instruction: 'ship it' });
    await ctx.office.startRun(agentId);
    expect(ctx.harness.lastRun.request.instructions).toBeUndefined();
  });

  it('rejects an over-long profile and leaves the stored profile unchanged', async () => {
    await ctx.office.setAgentProfile(agentId, { description: 'original', instructions: 'keep me' });

    await expect(
      ctx.office.setAgentProfile(agentId, { description: 'x'.repeat(1_000), instructions: '' }),
    ).rejects.toThrow(/invalid/);
    await expect(ctx.office.getAgentProfile(agentId)).resolves.toEqual({
      description: 'original',
      instructions: 'keep me',
    });
  });

  it('rejects a profile for an unknown agent', async () => {
    await expect(ctx.office.getAgentProfile('missing')).rejects.toThrow(/Unknown agent/);
    await expect(
      ctx.office.setAgentProfile('missing', { description: '', instructions: '' }),
    ).rejects.toThrow(/Unknown agent/);
  });
});
