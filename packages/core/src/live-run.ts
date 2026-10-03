import type { HarnessRun } from './ports.js';

/** A run the office is currently driving. */
export interface LiveRun {
  run: HarnessRun;
  runId: string;
  sessionId: string;
  taskId: string;
  finalOutput: string[];
  settled: boolean;
}

/**
 * A settled-looking handle used only to record a run that could not be started:
 * it lets the normal finish path fail the task without a real process.
 */
export function liveRunStub(runId: string, sessionId: string, taskId: string): LiveRun {
  return {
    run: {
      pid: undefined,
      prompt: async () => 'sent',
      write: () => undefined,
      resize: () => undefined,
      cancel: async () => undefined,
      onEvent: () => () => undefined,
    },
    runId,
    sessionId,
    taskId,
    finalOutput: [],
    settled: false,
  };
}
