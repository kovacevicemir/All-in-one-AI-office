import type {
  AgentCommunication,
  AgentView,
  Department,
  Session,
  Snapshot,
  Task,
} from '@ai-office/contracts';

let counter = 0;

export function communication(
  partial: Partial<AgentCommunication> & { id: string },
): AgentCommunication {
  return {
    fromAgentId: 'agent_1',
    toAgentId: 'agent_2',
    kind: 'request',
    status: 'open',
    summary: 'Ada → Grace: a task',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

export function department(name: string, id = `dept_${++counter}`): Department {
  return { id, name, createdAt: '2026-01-01T00:00:00.000Z' };
}

export function agentView(partial: Partial<AgentView> & { id: string }): AgentView {
  return {
    name: partial.id,
    workingDir: '/tmp/work',
    harnessId: 'fake',
    model: { providerId: 'fake', modelId: 'fake-1' },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    state: 'idle',
    activity: 'Idle',
    pressure: 'unknown',
    contextUsage: null,
    currentTaskId: null,
    nextTaskId: null,
    waitingOn: [],
    sessionId: null,
    runId: null,
    ...partial,
  };
}

export function task(partial: Partial<Task> & { id: string; agentId: string }): Task {
  return {
    title: partial.id,
    instruction: partial.id,
    status: 'queued',
    dependsOn: [],
    queuePosition: ++counter,
    origin: { kind: 'client' },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    blockedBy: [],
    ...partial,
  };
}

export function session(partial: Partial<Session> & { id: string; agentId: string }): Session {
  return {
    taskId: 'task_1',
    runId: 'run_1',
    status: 'running',
    backing: 'pipe',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

export function snapshot(partial: Partial<Snapshot> = {}): Snapshot {
  return {
    agents: [],
    departments: [],
    tasks: [],
    sessions: [],
    capabilities: { harnessAdapters: [], modelProviders: [] },
    pressureThresholds: { warning: 30, critical: 50, hysteresis: 5 },
    communications: [],
    oldestCommunicationId: null,
    ...partial,
  };
}
