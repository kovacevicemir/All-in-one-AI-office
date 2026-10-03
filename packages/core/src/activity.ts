import type { Agent, AgentRuntimeState, Task } from '@ai-office/contracts';

/** The slice of an agent's runtime the activity text depends on. */
export interface ActivityRuntime {
  state: AgentRuntimeState;
  activityOverride: string | null;
}

/**
 * Human-readable "what is this agent doing" line. Pure: given the same runtime
 * and task graph it always returns the same text.
 */
export function activityFor(
  agent: Agent,
  runtime: ActivityRuntime,
  current: Task | undefined,
  tasks: Task[],
): string {
  if (runtime.activityOverride !== null) return runtime.activityOverride;
  switch (runtime.state) {
    case 'working':
    case 'thinking':
      return current !== undefined ? `Working on: ${current.title}` : 'Working';
    case 'waiting': {
      const blocked = tasks.filter((task) => task.agentId === agent.id && task.status === 'blocked');
      const deps = [...new Set(blocked.flatMap((task) => task.blockedBy))];
      return deps.length > 0
        ? `Waiting on ${deps.length} task${deps.length === 1 ? '' : 's'}`
        : 'Waiting on dependencies';
    }
    case 'error':
      return runtime.activityOverride ?? 'Last run failed';
    case 'done':
      return 'Last task complete';
    default:
      return 'Idle';
  }
}
