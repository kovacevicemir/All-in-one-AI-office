import type {
  Agent,
  AgentCommunication,
  AgentProfile,
  AgentRuntimeState,
  Department,
  HarnessCapabilities,
  ModelRef,
  ResolvedModel,
  Run,
  Session,
  SessionBacking,
  SessionUsage,
  Task,
  Telemetry,
} from '@ai-office/contracts';

/* ------------------------------------------------------------- failures */

export class OfficeFailure extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'OfficeFailure';
  }
}

/* -------------------------------------------------------- model provider */

export interface ModelProvider {
  readonly id: string;
  readonly label: string;
  listModels(): string[];
  /** @throws OfficeFailure when the reference cannot be resolved. */
  resolve(ref: ModelRef): ResolvedModel;
}

/* ------------------------------------------------------------- spawning */

export interface SpawnSpec {
  sessionId: string;
  command: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
  cols: number;
  rows: number;
}

export type SpawnEvent =
  | { type: 'output'; data: string }
  | { type: 'exit'; exitCode: number | null }
  | { type: 'error'; message: string };

export interface SpawnedProcess {
  readonly pid: number | undefined;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(): void;
  onEvent(listener: (event: SpawnEvent) => void): () => void;
}

/**
 * How a session process is run. Two implementations exist: `pipe` (structured
 * harness protocols such as PI RPC) and `pty` (harnesses that only speak a
 * terminal).
 */
export interface SpawnPort {
  readonly backing: SessionBacking;
  readonly supportsResize: boolean;
  spawn(spec: SpawnSpec): Promise<SpawnedProcess>;
}

/* --------------------------------------------------------------- harness */

export interface DependencyResult {
  taskId: string;
  title: string;
  output: string;
}

export interface StartRunRequest {
  runId: string;
  sessionId: string;
  agentId: string;
  taskId: string;
  workingDir: string;
  instruction: string;
  model: ResolvedModel;
  dependencyResults: DependencyResult[];
  /** An explicitly configured replacement for the harness base system prompt. */
  systemPrompt?: string;
  /** The agent's own saved instructions, delivered as an appended system message. */
  instructions?: string;
  cols: number;
  rows: number;
}

export type PromptDelivery = 'sent' | 'steer' | 'followUp';

export type HarnessEvent =
  | { type: 'output'; data: string }
  /** Text actually handed to the model. Recorded so tests can prove fidelity. */
  | { type: 'prompt'; text: string; kind: 'instruction' | 'dependency' }
  | { type: 'activity'; summary: string }
  | { type: 'telemetry'; telemetry: Telemetry }
  | { type: 'state'; state: AgentRuntimeState }
  | { type: 'notice'; message: string }
  | {
      type: 'end';
      status: 'completed' | 'failed' | 'cancelled';
      exitCode?: number | null;
      failureReason?: string;
      finalOutput?: string;
      usage?: SessionUsage;
    };

export interface HarnessRun {
  readonly pid: number | undefined;
  prompt(text: string): Promise<PromptDelivery>;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  cancel(): Promise<void>;
  onEvent(listener: (event: HarnessEvent) => void): () => void;
}

export interface HarnessAdapter {
  readonly id: string;
  readonly label: string;
  readonly capabilities: HarnessCapabilities;
  readonly backing: SessionBacking;
  /** False when the underlying CLI or credentials are not usable on this host. */
  isAvailable(): Promise<boolean>;
  startRun(request: StartRunRequest): Promise<HarnessRun>;
}

/* ----------------------------------------------------------------- store */

export interface OfficeState {
  departments: Department[];
  agents: Agent[];
  tasks: Task[];
  runs: Run[];
  sessions: Session[];
  communications: AgentCommunication[];
}

export function emptyOfficeState(): OfficeState {
  return { departments: [], agents: [], tasks: [], runs: [], sessions: [], communications: [] };
}

export interface StorePort {
  load(): Promise<OfficeState | null>;
  /** Write-behind: must not block the caller on disk I/O. */
  save(state: OfficeState): void;
  flush(): Promise<void>;
  /** An absent or unreadable profile reads as an empty profile, never a throw. */
  readAgentProfile(agentId: string): Promise<AgentProfile>;
  writeAgentProfile(agentId: string, profile: AgentProfile): Promise<void>;
}

/* ------------------------------------------------------------------ sink */

export interface EventSink {
  emit(type: string, payload: unknown): void;
}
