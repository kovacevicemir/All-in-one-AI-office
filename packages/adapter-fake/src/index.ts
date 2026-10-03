import type {
  HarnessCapabilities,
  SessionBacking,
  Telemetry,
  ContextUsage,
  AgentProfile,
} from '@ai-office/contracts';
import type {
  HarnessAdapter,
  HarnessEvent,
  HarnessRun,
  OfficeState,
  PromptDelivery,
  SpawnEvent,
  SpawnPort,
  SpawnSpec,
  SpawnedProcess,
  StartRunRequest,
  StorePort,
} from '@ai-office/core';

/* ---------------------------------------------------------------- store */

/** In-memory store. `save` deep-copies so callers cannot mutate persisted state. */
export class MemoryStore implements StorePort {
  private state: OfficeState | null = null;
  private readonly profiles = new Map<string, AgentProfile>();
  saves = 0;
  flushes = 0;

  constructor(initial: OfficeState | null = null) {
    this.state = initial;
  }

  async load(): Promise<OfficeState | null> {
    return this.state === null ? null : structuredClone(this.state);
  }

  save(state: OfficeState): void {
    this.saves += 1;
    this.state = structuredClone(state);
  }

  async flush(): Promise<void> {
    this.flushes += 1;
    await Promise.resolve();
  }

  async readAgentProfile(agentId: string): Promise<AgentProfile> {
    const stored = this.profiles.get(agentId);
    return stored === undefined ? { description: '', instructions: '' } : { ...stored };
  }

  async writeAgentProfile(agentId: string, profile: AgentProfile): Promise<void> {
    this.profiles.set(agentId, { ...profile });
    await Promise.resolve();
  }

  peek(): OfficeState | null {
    return this.state;
  }
}

/* ------------------------------------------------------------- spawner */

export class MemoryProcess implements SpawnedProcess {
  readonly written: string[] = [];
  readonly resizes: [number, number][] = [];
  killed = false;
  pid: number | undefined = 4242;

  private readonly listeners = new Set<(event: SpawnEvent) => void>();

  constructor(readonly spec: SpawnSpec) {}

  write(data: string): void {
    this.written.push(data);
  }

  resize(cols: number, rows: number): void {
    this.resizes.push([cols, rows]);
  }

  kill(): void {
    this.killed = true;
  }

  onEvent(listener: (event: SpawnEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event: SpawnEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  stdout(data: string): void {
    this.emit({ type: 'output', data });
  }

  exit(exitCode: number | null): void {
    this.emit({ type: 'exit', exitCode });
  }

  /** Lines the process was asked to run, as parsed JSON where possible. */
  commands(): Record<string, unknown>[] {
    return this.written
      .join('')
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as Record<string, unknown>);
  }
}

export class MemorySpawn implements SpawnPort {
  backing: SessionBacking = 'pipe';
  supportsResize = false;
  readonly spawned: MemoryProcess[] = [];
  /** Return events to emit right after spawn; defaults to a clean exit. */
  onSpawn: ((process: MemoryProcess) => SpawnEvent[] | null) | null = null;

  async spawn(spec: SpawnSpec): Promise<SpawnedProcess> {
    const process = new MemoryProcess(spec);
    this.spawned.push(process);
    const events = this.onSpawn?.(process) ?? [{ type: 'exit', exitCode: 0 }];
    // Emit on the next macrotask so the caller can attach listeners first, the
    // way a real child process behaves.
    setTimeout(() => {
      for (const event of events) process.emit(event);
    }, 0);
    return process;
  }

  get last(): MemoryProcess {
    const process = this.spawned.at(-1);
    if (process === undefined) throw new Error('MemorySpawn: nothing spawned yet');
    return process;
  }
}

/* -------------------------------------------------------------- harness */

export interface ScriptedHarnessOptions {
  id?: string;
  label?: string;
  backing?: SessionBacking;
  capabilities?: Partial<HarnessCapabilities>;
  available?: boolean;
}

export class ScriptedHarness implements HarnessAdapter {
  readonly id: string;
  readonly label: string;
  readonly backing: SessionBacking;
  readonly capabilities: HarnessCapabilities;
  available: boolean;

  readonly starts: StartRunRequest[] = [];
  readonly runs: ScriptedRun[] = [];

  constructor(options: ScriptedHarnessOptions = {}) {
    this.id = options.id ?? 'fake';
    this.label = options.label ?? 'Scripted (test)';
    this.backing = options.backing ?? 'pipe';
    this.available = options.available ?? true;
    this.capabilities = {
      cancel: true,
      midRunPrompt: true,
      telemetry: true,
      resize: options.backing === 'pty',
      interactiveInput: options.backing === 'pty',
      ...options.capabilities,
    };
  }

  async isAvailable(): Promise<boolean> {
    return this.available;
  }

  async startRun(request: StartRunRequest): Promise<HarnessRun> {
    const run = new ScriptedRun(request, this);
    this.starts.push(request);
    this.runs.push(run);
    return run;
  }

  get lastRun(): ScriptedRun {
    const run = this.runs.at(-1);
    if (run === undefined) throw new Error('ScriptedHarness: no run started yet');
    return run;
  }
}

export class ScriptedRun implements HarnessRun {
  readonly events: HarnessEvent[] = [];
  readonly prompts: { text: string; delivery: PromptDelivery }[] = [];
  readonly written: string[] = [];
  killed = false;
  pid: number | undefined = 1111;

  private readonly listeners = new Set<(event: HarnessEvent) => void>();

  constructor(
    readonly request: StartRunRequest,
    private readonly harness: ScriptedHarness,
  ) {}

  onEvent(listener: (event: HarnessEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event: HarnessEvent): void {
    this.events.push(event);
    for (const listener of this.listeners) listener(event);
  }

  async prompt(text: string): Promise<PromptDelivery> {
    const delivery: PromptDelivery = 'sent';
    this.prompts.push({ text, delivery });
    this.emit({ type: 'prompt', text, kind: 'instruction' });
    return delivery;
  }

  write(data: string): void {
    this.written.push(data);
  }

  resize(): void {
    /* recorded through harness.starts */
  }

  async cancel(): Promise<void> {
    this.killed = true;
    this.emit({ type: 'end', status: 'cancelled', exitCode: null });
    await Promise.resolve();
  }

  /* ------------------------------------------------------------- helpers */

  output(data: string): void {
    this.emit({ type: 'output', data });
  }

  activity(summary: string): void {
    this.emit({ type: 'activity', summary });
  }

  telemetry(percent: number | null, tokens?: number, contextWindow?: number): void {
    const contextUsage: ContextUsage = {
      tokens: tokens ?? null,
      contextWindow: contextWindow ?? null,
      percent,
    };
    const telemetry: Telemetry = {
      available: true,
      contextUsage,
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0, cost: 0 },
      updatedAt: new Date().toISOString(),
    };
    this.emit({ type: 'telemetry', telemetry });
  }

  telemetryUnavailable(): void {
    this.emit({
      type: 'telemetry',
      telemetry: {
        available: false,
        contextUsage: { tokens: null, contextWindow: null, percent: null },
        usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0, cost: 0 },
        updatedAt: new Date().toISOString(),
      },
    });
  }

  complete(finalOutput = 'done'): void {
    this.emit({ type: 'end', status: 'completed', exitCode: 0, finalOutput });
  }

  fail(failureReason: string): void {
    this.emit({ type: 'end', status: 'failed', exitCode: 1, failureReason });
  }
}

/* ------------------------------------------------------------------ misc */

/** Deterministic ids for tests: `agent_1`, `task_2`, ... */
export function sequenceIds(): (prefix: string) => string {
  const counters = new Map<string, number>();
  return (prefix: string) => {
    const next = (counters.get(prefix) ?? 0) + 1;
    counters.set(prefix, next);
    return `${prefix}_${next}`;
  };
}

/** Manually advanced clock for deterministic timestamps. */
export function fixedClock(start = '2026-01-01T00:00:00.000Z'): () => Date {
  let tick = 0;
  const base = new Date(start).getTime();
  return () => new Date(base + tick++ * 1000);
}
