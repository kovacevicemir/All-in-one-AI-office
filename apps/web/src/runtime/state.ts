import type {
  AgentCommunication,
  AgentProfile,
  AgentView,
  Capabilities,
  Department,
  EventEnvelope,
  OfficeError,
  PressureThresholds,
  Session,
  SessionOutputPayload,
  Snapshot,
  Task,
} from '@ai-office/contracts';
import { SessionOutputPayloadSchema } from '@ai-office/contracts';
import type { ConnectionStatus } from './client.js';
import type { TranscriptTextChunk } from './transcript.js';

export type ViewMode = 'list' | 'office';

export interface OfficeUiState {
  status: ConnectionStatus;
  agents: AgentView[];
  departments: Department[];
  tasks: Task[];
  sessions: Session[];
  capabilities: Capabilities;
  thresholds: PressureThresholds;
  /** sessionId -> accumulated terminal text, kept across reconnects. */
  output: Record<string, string>;
  /** The same text with its sequence boundaries kept, for marker interleaving. */
  outputChunks: Record<string, TranscriptTextChunk[]>;
  communications: AgentCommunication[];
  oldestCommunicationId: string | null;
  /** agentId -> the profile last read from or saved to the runtime. */
  profiles: Record<string, AgentProfile>;
  selectedAgentId: string | null;
  view: ViewMode;
  lastError: OfficeError | null;
}

export const INITIAL_STATE: OfficeUiState = {
  status: 'disconnected',
  agents: [],
  departments: [],
  tasks: [],
  sessions: [],
  capabilities: { harnessAdapters: [], modelProviders: [] },
  thresholds: { warning: 30, critical: 50, hysteresis: 5 },
  output: {},
  outputChunks: {},
  communications: [],
  oldestCommunicationId: null,
  profiles: {},
  selectedAgentId: null,
  view: 'list',
  lastError: null,
};

function upsert<T extends { id: string }>(list: T[], item: T): T[] {
  const index = list.findIndex((existing) => existing.id === item.id);
  if (index < 0) return [...list, item];
  const next = [...list];
  next[index] = { ...list[index], ...item } as T;
  return next;
}

/**
 * Pure reducer for realtime events. Keeps selection and buffered terminal output
 * across a snapshot so a reconnect neither duplicates agents nor resets the UI.
 */
export function applySnapshot(state: OfficeUiState, snapshot: Snapshot): OfficeUiState {
  return {
    ...state,
    agents: snapshot.agents,
    departments: snapshot.departments,
    tasks: snapshot.tasks,
    sessions: snapshot.sessions,
    capabilities: snapshot.capabilities,
    thresholds: snapshot.pressureThresholds,
    communications: snapshot.communications,
    oldestCommunicationId: snapshot.oldestCommunicationId,
    selectedAgentId:
      state.selectedAgentId !== null &&
      snapshot.agents.some((agent) => agent.id === state.selectedAgentId)
        ? state.selectedAgentId
        : null,
  };
}

export function applyEnvelope(state: OfficeUiState, envelope: EventEnvelope): OfficeUiState {
  switch (envelope.type) {
    case 'agent.updated':
      return { ...state, agents: upsert(state.agents, envelope.payload as AgentView) };

    case 'agent.removed': {
      const { id } = envelope.payload as { id: string };
      return {
        ...state,
        agents: state.agents.filter((agent) => agent.id !== id),
        selectedAgentId: state.selectedAgentId === id ? null : state.selectedAgentId,
      };
    }

    case 'department.updated':
      return { ...state, departments: upsert(state.departments, envelope.payload as Department) };

    case 'department.removed': {
      const { id } = envelope.payload as { id: string };
      return { ...state, departments: state.departments.filter((department) => department.id !== id) };
    }

    case 'task.updated':
      return { ...state, tasks: upsert(state.tasks, envelope.payload as Task) };

    case 'task.removed': {
      const { id } = envelope.payload as { id: string };
      return { ...state, tasks: state.tasks.filter((task) => task.id !== id) };
    }

    case 'session.updated':
      return { ...state, sessions: upsert(state.sessions, envelope.payload as Session) };

    case 'session.telemetry': {
      const { sessionId, telemetry } = envelope.payload as {
        sessionId: string;
        telemetry: Session['telemetry'];
      };
      const session = state.sessions.find((candidate) => candidate.id === sessionId);
      if (session === undefined) return state;
      return { ...state, sessions: upsert(state.sessions, { ...session, telemetry }) };
    }

    case 'session.output': {
      const payload = SessionOutputPayloadSchema.safeParse(envelope.payload);
      if (!payload.success) return state;
      return {
        ...state,
        output: appendOutput(state.output, payload.data),
        outputChunks: appendOutputChunks(state.outputChunks, payload.data),
      };
    }

    case 'pressure.changed': {
      const { agentId, pressure, percent } = envelope.payload as {
        agentId: string;
        pressure: AgentView['pressure'];
        percent: number | null;
      };
      const agent = state.agents.find((candidate) => candidate.id === agentId);
      if (agent === undefined) return state;
      return {
        ...state,
        agents: upsert(state.agents, {
          ...agent,
          pressure,
          contextUsage:
            agent.contextUsage === null
              ? null
              : { ...agent.contextUsage, percent: percent ?? agent.contextUsage.percent },
        }),
      };
    }

    case 'communication.updated': {
      const event = envelope.payload as AgentCommunication;
      const communications = upsert(state.communications, event).sort(
        (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
      );
      return { ...state, communications };
    }

    case 'error':
      return { ...state, lastError: envelope.payload as OfficeError };

    default:
      // Unknown event types are ignored, not fatal.
      return state;
  }
}

export function appendOutput(output: Record<string, string>, payload: SessionOutputPayload): Record<string, string> {
  return { ...output, [payload.sessionId]: (output[payload.sessionId] ?? '') + payload.chunks.join('') };
}

/** Keeps each frame's chunk boundaries with the sequence they arrived at. */
export function appendOutputChunks(
  chunks: Record<string, TranscriptTextChunk[]>,
  payload: SessionOutputPayload,
): Record<string, TranscriptTextChunk[]> {
  const existing = chunks[payload.sessionId] ?? [];
  const added = payload.chunks.map((text, index) => ({ seq: payload.fromSeq + index, text }));
  return { ...chunks, [payload.sessionId]: [...existing, ...added] };
}

/** Terminal text is rendered as plain monospace: RPC sessions carry no ANSI. */
export function terminalTail(text: string, lines: number): string {
  const parts = text.split('\n');
  const trailingNewline = parts.length > 1 && parts[parts.length - 1] === '';
  if (trailingNewline) parts.pop();
  const tail = parts.slice(Math.max(0, parts.length - lines)).join('\n');
  return trailingNewline ? `${tail}\n` : tail;
}
