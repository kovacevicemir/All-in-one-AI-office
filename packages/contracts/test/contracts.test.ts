import { describe, expect, it } from 'vitest';
import {
  AGENT_PROFILE_MAX_DESCRIPTION,
  AGENT_PROFILE_MAX_INSTRUCTIONS,
  AgentCommunicationSchema,
  AgentProfileSchema,
  AgentViewSchema,
  CONTRACT_VERSION,
  ContextUsageSchema,
  ERROR_CODES,
  EventEnvelopeSchema,
  SnapshotSchema,
  TelemetrySchema,
  TaskSchema,
  parseOrError,
} from '@ai-office/contracts';

const AGENT_VIEW = {
  id: 'agent_1',
  name: 'Ada',
  workingDir: '/tmp/work',
  harnessId: 'pi',
  model: { providerId: 'deepseek', modelId: 'deepseek-flash' },
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  state: 'idle' as const,
  activity: 'Idle',
  pressure: 'unknown' as const,
  contextUsage: null,
  currentTaskId: null,
  nextTaskId: null,
  waitingOn: [],
  sessionId: null,
  runId: null,
};

function snapshotWithoutCommunications() {
  return {
    agents: [AGENT_VIEW],
    departments: [],
    tasks: [],
    sessions: [],
    capabilities: { harnessAdapters: [], modelProviders: [] },
    pressureThresholds: { warning: 30, critical: 50, hysteresis: 5 },
  };
}

describe('contracts', () => {
  it('declares a contract version', () => {
    expect(CONTRACT_VERSION).toBeGreaterThan(0);
  });

  it('rejects a malformed task with a field-naming error', () => {
    const result = parseOrError(TaskSchema, { id: 't1', title: '' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe(ERROR_CODES.validation);
    const fields = result.error.details?.fields as { path: string }[];
    expect(fields.some((field) => field.path.includes('title'))).toBe(true);
  });

  it('round-trips a task with dependencies and a result', () => {
    const task = {
      id: 'task_1',
      agentId: 'agent_1',
      title: 'Build the thing',
      instruction: 'Build the thing',
      status: 'blocked' as const,
      dependsOn: ['task_0'],
      queuePosition: 1,
      origin: { kind: 'agent' as const, agentId: 'agent_2' },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:01.000Z',
      blockedBy: ['task_0'],
      result: {
        status: 'done' as const,
        output: 'ok',
        finishedAt: '2026-01-01T00:00:02.000Z',
      },
    };
    expect(TaskSchema.parse(TaskSchema.parse(task))).toEqual(task);
  });

  it('tolerates an unknown event type while reporting it', () => {
    const envelope = {
      v: CONTRACT_VERSION,
      seq: 12,
      type: 'something.from.the.future',
      ts: '2026-01-01T00:00:00.000Z',
      payload: { agentId: 'agent_1' },
    };
    const result = parseOrError(EventEnvelopeSchema, envelope);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.type).toBe('something.from.the.future');
  });

  it('models unavailable telemetry without coercing it to zero', () => {
    const telemetry = {
      available: false,
      contextUsage: { tokens: null, contextWindow: null, percent: null },
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0, cost: 0 },
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const parsed = TelemetrySchema.parse(telemetry);
    expect(parsed.available).toBe(false);
    expect(parsed.contextUsage.percent).toBeNull();
  });

  it('requires all three context usage fields to be explicit', () => {
    expect(ContextUsageSchema.safeParse({ tokens: 100 }).success).toBe(false);
    expect(ContextUsageSchema.safeParse({ tokens: null, contextWindow: null, percent: null }).success).toBe(
      true,
    );
  });

  it('validates a full snapshot', () => {
    const snapshot = {
      ...snapshotWithoutCommunications(),
      agents: [AGENT_VIEW],
    };
    expect(SnapshotSchema.safeParse(snapshot).success).toBe(true);
    expect(() => AgentViewSchema.parse(snapshot.agents[0])).not.toThrow();
  });

  it('round-trips an inter-agent communication', () => {
    const communication = {
      id: 'comm_req_task_1',
      fromAgentId: 'agent_1',
      toAgentId: 'agent_2',
      kind: 'request' as const,
      status: 'open' as const,
      summary: 'Ada → Grace: Write the parser',
      taskId: 'task_1',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:01.000Z',
    };
    expect(AgentCommunicationSchema.parse(AgentCommunicationSchema.parse(communication))).toEqual(
      communication,
    );
  });

  it('rejects a malformed communication with a field-naming error', () => {
    const result = parseOrError(AgentCommunicationSchema, {
      id: 'comm_1',
      fromAgentId: 'agent_1',
      toAgentId: 'agent_2',
      kind: 'request',
      status: 'shouting',
      summary: '',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const fields = result.error.details?.fields as { path: string }[];
    expect(fields.some((field) => field.path.includes('status'))).toBe(true);
  });

  it('carries the communication event type through the envelope schema', () => {
    const envelope = {
      v: CONTRACT_VERSION,
      seq: 7,
      type: 'communication.updated',
      ts: '2026-01-01T00:00:00.000Z',
      payload: { id: 'comm_req_task_1' },
    };
    const result = parseOrError(EventEnvelopeSchema, envelope);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.type).toBe('communication.updated');
  });

  it('accepts a snapshot without communications and invents none', () => {
    const parsed = SnapshotSchema.parse(snapshotWithoutCommunications());
    expect(parsed.communications).toEqual([]);
    expect(parsed.oldestCommunicationId).toBeNull();
  });

  it('accepts a snapshot with a bounded communications list', () => {
    const communication = {
      id: 'comm_req_task_1',
      fromAgentId: 'agent_1',
      toAgentId: 'agent_2',
      kind: 'request' as const,
      status: 'open' as const,
      summary: 'Ada → Grace: Write the parser',
      taskId: 'task_1',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:01.000Z',
    };
    const parsed = SnapshotSchema.parse({
      ...snapshotWithoutCommunications(),
      communications: [communication],
      oldestCommunicationId: communication.id,
    });
    expect(parsed.communications).toHaveLength(1);
    expect(parsed.oldestCommunicationId).toBe(communication.id);
  });
});

describe('agent profile contract', () => {
  it('round-trips a profile, including empty strings', () => {
    const profile = { description: 'Tech lead', instructions: 'Own the build.' };
    expect(AgentProfileSchema.parse(AgentProfileSchema.parse(profile))).toEqual(profile);
    expect(AgentProfileSchema.parse({ description: '', instructions: '' })).toEqual({
      description: '',
      instructions: '',
    });
  });

  it('rejects a non-string field with a field-naming error', () => {
    const result = parseOrError(AgentProfileSchema, { description: 42, instructions: '' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe(ERROR_CODES.validation);
    const fields = result.error.details?.fields as { path: string }[];
    expect(fields.some((field) => field.path === 'description')).toBe(true);
  });

  it('rejects an over-long value with a field-naming error', () => {
    const result = parseOrError(AgentProfileSchema, {
      description: 'x'.repeat(AGENT_PROFILE_MAX_DESCRIPTION + 1),
      instructions: 'y'.repeat(AGENT_PROFILE_MAX_INSTRUCTIONS + 1),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const fields = (result.error.details?.fields as { path: string }[]).map((field) => field.path);
    expect(fields).toContain('description');
    expect(fields).toContain('instructions');
  });
});
