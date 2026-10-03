import type { AgentRuntimeState } from '@ai-office/contracts';

export type AgentStateEvent =
  | { type: 'run.started' }
  | { type: 'run.activity' }
  | { type: 'run.completed' }
  | { type: 'run.failed' }
  | { type: 'run.cancelled' }
  | { type: 'queue.waiting' }
  | { type: 'queue.blocked' }
  | { type: 'queue.idle' }
  | { type: 'reset' };

/**
 * Pure agent runtime-state reducer. Only an observable event or an explicit
 * command moves the state; unrecognized events leave it unchanged.
 */
export function reduceAgentState(
  state: AgentRuntimeState,
  event: AgentStateEvent,
): AgentRuntimeState {
  switch (event.type) {
    case 'run.started':
      return 'working';
    case 'run.activity':
      return state === 'working' || state === 'thinking' ? 'thinking' : state;
    case 'run.completed':
      return 'done';
    case 'run.failed':
      return 'error';
    case 'run.cancelled':
      return 'idle';
    case 'queue.waiting':
      return 'waiting';
    case 'queue.blocked':
      return 'blocked';
    case 'queue.idle':
      return 'idle';
    case 'reset':
      return 'idle';
    default:
      return state;
  }
}

export function isBusy(state: AgentRuntimeState): boolean {
  return state === 'working' || state === 'thinking';
}
