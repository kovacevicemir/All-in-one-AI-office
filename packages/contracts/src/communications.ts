import type { Agent, AgentCommunication, Task } from './index.js';

export interface CommunicationDescription {
  /** One line: `sender → recipient: the ask or delivery`. */
  title: string;
  /** Status, kind, and related task, for a tooltip body. */
  detail: string;
}

function agentLabel(id: string, agents: Agent[]): string {
  return agents.find((agent) => agent.id === id)?.name ?? `Unknown agent (${id})`;
}

function taskLabel(id: string | undefined, tasks: Task[]): string {
  if (id === undefined) return 'Unknown task';
  return tasks.find((task) => task.id === id)?.title ?? `Unknown task (${id})`;
}

/**
 * One-line summary of who is asking whom for what. Never invents a name: a
 * missing agent or task is reported explicitly. Lives in `contracts` because
 * both the domain (to stamp an event's summary) and the UI (to render a tooltip)
 * need the exact same wording.
 */
export function describeCommunication(
  event: AgentCommunication,
  agents: Agent[],
  tasks: Task[],
): CommunicationDescription {
  const from = agentLabel(event.fromAgentId, agents);
  const to = agentLabel(event.toAgentId, agents);

  if (event.kind === 'handoff') {
    const delivered = taskLabel(event.relatedTaskId ?? event.taskId, tasks);
    return {
      title: `${from} → ${to}: results of '${delivered}' delivered`,
      detail: `Hand-off · ${event.status} · ${delivered}`,
    };
  }

  const ask = taskLabel(event.taskId, tasks);
  return {
    title: `${from} → ${to}: ${ask}`,
    detail: `Request · ${event.status} · ${ask}`,
  };
}
