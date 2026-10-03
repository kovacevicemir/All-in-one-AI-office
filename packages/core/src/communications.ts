import type {
  Agent,
  AgentCommunication,
  CommunicationStatus,
  Run,
  Task,
} from '@ai-office/contracts';
import { describeCommunication } from '@ai-office/contracts';

// Re-exported so core consumers get the one summary implementation from contracts.
export { describeCommunication } from '@ai-office/contracts';

/**
 * Communication derivation and summarization.
 *
 * The office does not add a message transport between harnesses. It observes the
 * interactions it already performs - a task delegated with an agent origin, and a
 * dependency's results handed to a dependent task - and turns them into
 * vendor-neutral communication events. Everything here is a pure function of task,
 * run, and agent state, so re-deriving over the same state is idempotent.
 */

/** Retention bound, in the same order of magnitude as task/run history. */
export const RETAINED_COMMUNICATIONS = 200;

export interface CommunicationState {
  tasks: Task[];
  runs: Run[];
  agents: Agent[];
}

function statusFromTask(task: Task): CommunicationStatus {
  if (task.status === 'done') return 'answered';
  if (task.status === 'failed') return 'failed';
  if (task.status === 'cancelled') return 'cancelled';
  return 'open';
}

function withSummary(event: AgentCommunication, state: CommunicationState): AgentCommunication {
  return { ...event, summary: describeCommunication(event, state.agents, state.tasks).title };
}

/** Carry a session anchor recorded at creation across re-derivation. */
function withPreviousAnchor(
  event: AgentCommunication,
  previousById: Map<string, AgentCommunication>,
): AgentCommunication {
  const previous = previousById.get(event.id);
  if (previous === undefined) return event;
  return {
    ...event,
    ...(previous.sessionId !== undefined ? { sessionId: previous.sessionId } : {}),
    ...(previous.seq !== undefined ? { seq: previous.seq } : {}),
  };
}

export function deriveCommunications(
  previous: AgentCommunication[],
  state: CommunicationState,
): AgentCommunication[] {
  const previousById = new Map(previous.map((event) => [event.id, event]));
  const derived = new Map<string, AgentCommunication>();

  // Delegation: a task assigned to one agent with another agent as its origin.
  for (const task of state.tasks) {
    const origin = task.origin;
    if (origin.kind !== 'agent' || origin.agentId === undefined) continue;
    if (origin.agentId === task.agentId) continue;
    const event = withSummary(
      {
        id: `comm_req_${task.id}`,
        fromAgentId: origin.agentId,
        toAgentId: task.agentId,
        kind: 'request',
        status: statusFromTask(task),
        summary: '',
        taskId: task.id,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
      },
      state,
    );
    derived.set(event.id, withPreviousAnchor(event, previousById));
  }

  // Hand-off: a dependent task started and received a dependency's results.
  for (const task of state.tasks) {
    if (task.dependsOn.length === 0) continue;
    const run = state.runs.find((candidate) => candidate.taskId === task.id);
    if (run === undefined) continue;
    for (const dependencyId of task.dependsOn) {
      const dependency = state.tasks.find((candidate) => candidate.id === dependencyId);
      if (dependency?.result === undefined) continue;
      if (dependency.agentId === task.agentId) continue;
      const event = withSummary(
        {
          id: `comm_hand_${task.id}_${dependency.id}`,
          fromAgentId: dependency.agentId,
          toAgentId: task.agentId,
          kind: 'handoff',
          status: 'answered',
          summary: '',
          taskId: task.id,
          relatedTaskId: dependency.id,
          createdAt: run.startedAt,
          updatedAt: run.startedAt,
        },
        state,
      );
      derived.set(event.id, withPreviousAnchor(event, previousById));
    }
  }

  // Events are retained, not deleted by a lifecycle transition: keep a previous
  // event whose anchor task still exists even if it is no longer derivable (for
  // example, its dependency was re-queued).
  for (const event of previous) {
    if (derived.has(event.id)) continue;
    if (event.taskId !== undefined && state.tasks.some((task) => task.id === event.taskId)) {
      derived.set(event.id, event);
    }
  }

  return [...derived.values()]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
    .slice(-RETAINED_COMMUNICATIONS);
}

/**
 * Derives the next event set and reports which events were created or changed,
 * so the caller can emit them. `anchor` stamps the events for a task that just
 * started with its session, for transcript interleaving.
 */
export function refreshCommunicationEvents(
  previous: AgentCommunication[],
  state: CommunicationState,
  anchor?: { taskId: string; sessionId: string },
): { events: AgentCommunication[]; changed: AgentCommunication[] } {
  const derived = deriveCommunications(previous, state);
  const events =
    anchor === undefined
      ? derived
      : derived.map((event) =>
          event.taskId === anchor.taskId && event.sessionId === undefined
            ? { ...event, sessionId: anchor.sessionId, seq: 0 }
            : event,
        );
  const previousById = new Map(previous.map((event) => [event.id, event]));
  const changed = events.filter((event) => {
    const prior = previousById.get(event.id);
    return prior === undefined || JSON.stringify(prior) !== JSON.stringify(event);
  });
  return { events, changed };
}

/** Retained events involving one agent, or all of them when no filter is given. */
export function filterCommunications(
  events: AgentCommunication[],
  agentId?: string,
): AgentCommunication[] {
  if (agentId === undefined) return [...events];
  return events.filter((event) => event.fromAgentId === agentId || event.toAgentId === agentId);
}
