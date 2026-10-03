import type { ContextUsage, HarnessCapabilities, SessionBacking, Telemetry } from '@ai-office/contracts';
import type {
  HarnessAdapter,
  HarnessEvent,
  HarnessRun,
  PromptDelivery,
  StartRunRequest,
} from '@ai-office/core';

/**
 * E2E-only harness. Unlike `adapter-fake`'s `ScriptedHarness`, this one runs in
 * a separate process from the test, so it is driven over the small control API
 * in `runtime-server.ts` instead of by direct method calls.
 */
export class ControlledHarness implements HarnessAdapter {
  readonly id = 'fake';
  readonly label = 'Scripted (e2e)';
  readonly backing: SessionBacking = 'pipe';
  readonly capabilities: HarnessCapabilities = {
    cancel: true,
    midRunPrompt: true,
    telemetry: true,
    resize: false,
    interactiveInput: false,
  };

  private readonly runs = new Map<string, ControlledRun>();

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async startRun(request: StartRunRequest): Promise<HarnessRun> {
    const run = new ControlledRun(request);
    this.runs.set(request.runId, run);
    // Let the office attach its listeners before the first event, the way a real
    // child process behaves.
    setTimeout(() => {
      run.emit({ type: 'prompt', text: request.instruction, kind: 'instruction' });
      run.activity(`Working on: ${request.instruction.split('\n')[0]}`);
      run.output(`$ starting task\n${request.instruction}\n`);
    }, 0);
    return run;
  }

  get(runId: string): ControlledRun | undefined {
    return this.runs.get(runId);
  }

  list(): { runId: string; taskId: string; agentId: string }[] {
    return [...this.runs.values()].map((run) => ({
      runId: run.request.runId,
      taskId: run.request.taskId,
      agentId: run.request.agentId,
    }));
  }
}

export class ControlledRun implements HarnessRun {
  readonly pid = 5150;
  readonly prompts: { text: string; delivery: PromptDelivery }[] = [];
  killed = false;

  private readonly listeners = new Set<(event: HarnessEvent) => void>();
  private ended = false;

  constructor(readonly request: StartRunRequest) {}

  onEvent(listener: (event: HarnessEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event: HarnessEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  async prompt(text: string): Promise<PromptDelivery> {
    this.prompts.push({ text, delivery: 'steer' });
    this.emit({ type: 'prompt', text, kind: 'instruction' });
    return 'steer';
  }

  write(data: string): void {
    this.output(`[input] ${data}`);
  }

  resize(): void {
    /* pipe sessions are not resizable */
  }

  async cancel(): Promise<void> {
    this.killed = true;
    this.finish({ type: 'end', status: 'cancelled', exitCode: null });
    await Promise.resolve();
  }

  /* ------------------------------------------------------- control surface */

  activity(summary: string): void {
    this.emit({ type: 'activity', summary });
  }

  output(data: string): void {
    this.emit({ type: 'output', data });
  }

  telemetry(percent: number, tokens = 1000, contextWindow = 100_000): void {
    const contextUsage: ContextUsage = { tokens, contextWindow, percent };
    const telemetry: Telemetry = {
      available: true,
      contextUsage,
      usage: { input: tokens, output: 0, cacheRead: 0, cacheWrite: 0, total: tokens, cost: 0 },
      updatedAt: new Date().toISOString(),
    };
    this.emit({ type: 'telemetry', telemetry });
  }

  complete(finalOutput = 'done'): void {
    this.output(`\n${finalOutput}\n`);
    this.finish({ type: 'end', status: 'completed', exitCode: 0, finalOutput });
  }

  fail(failureReason: string): void {
    this.finish({ type: 'end', status: 'failed', exitCode: 1, failureReason });
  }

  private finish(event: Extract<HarnessEvent, { type: 'end' }>): void {
    if (this.ended) return;
    this.ended = true;
    this.emit(event);
  }
}
