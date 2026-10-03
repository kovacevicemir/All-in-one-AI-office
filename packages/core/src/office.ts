import { randomUUID } from 'node:crypto';
import {
  DEFAULT_PRESSURE_THRESHOLDS,
  ERROR_CODES,
  type Agent,
  type AgentCommunication,
  type AgentProfile,
  type AgentRuntimeState,
  type AgentView,
  type Capabilities,
  type ContextPressureLevel,
  type ContextUsage,
  type Department,
  type ModelRef,
  type PressureThresholds,
  type Run,
  type Session,
  type Snapshot,
  type Task,
  type TaskOrigin,
  type Telemetry,
} from '@ai-office/contracts';
import { DEFAULT_OUTPUT_BUFFER, OutputBuffer, type OutputBufferOptions } from './buffer.js';
import {
  OfficeFailure,
  type DependencyResult,
  type EventSink,
  type HarnessAdapter,
  type HarnessEvent,
  type ModelProvider,
  type OfficeState,
  type PromptDelivery,
  type StorePort,
  emptyOfficeState,
} from './ports.js';
import { computePressure } from './pressure.js';
import {
  deriveCommunications,
  filterCommunications,
  refreshCommunicationEvents,
} from './communications.js';
import { activityFor } from './activity.js';
import { liveRunStub, type LiveRun } from './live-run.js';
import { assertValidAgentProfile } from './profile.js';
import { isBusy, reduceAgentState } from './state.js';
import {
  blockedByFailure,
  computeBlockedBy,
  isTerminalStatus,
  nextRunnableTask,
  orderQueue,
  recomputeBlocked,
  wouldCreateCycle,
} from './queue.js';

export interface CreateAgentInput {
  name: string;
  role?: string;
  departmentId?: string;
  workingDir: string;
  harnessId: string;
  model: ModelRef;
  systemPrompt?: string;
}

export interface CreateTaskInput {
  agentId: string;
  title: string;
  instruction: string;
  dependsOn?: string[];
  origin?: TaskOrigin;
}

export interface UpdateAgentInput {
  name?: string;
  role?: string | null;
  departmentId?: string | null;
  workingDir?: string;
  harnessId?: string;
  model?: ModelRef;
  systemPrompt?: string | null;
}

export interface OfficeOptions {
  harnesses: HarnessAdapter[];
  providers: ModelProvider[];
  store: StorePort;
  sink: EventSink;
  thresholds?: PressureThresholds;
  now?: () => Date;
  newId?: (prefix: string) => string;
  pathExists?: (path: string) => Promise<boolean>;
  cols?: number;
  rows?: number;
  outputBuffer?: OutputBufferOptions;
}

interface AgentRuntime {
  state: AgentRuntimeState;
  activityOverride: string | null;
  pressure: ContextPressureLevel;
  contextUsage: ContextUsage | null;
  telemetry: Telemetry | null;
  currentTaskId: string | null;
  runId: string | null;
  sessionId: string | null;
}

export interface SessionOutputSlice {
  sessionId: string;
  oldestSeq: number;
  lastSeq: number;
  fromSeq: number;
  chunks: { seq: number; data: string }[];
}

/**
 * The office domain engine. Holds all state in memory (reads never touch disk),
 * writes behind through StorePort, and depends only on ports - never on a
 * harness or model vendor.
 */
export class Office {
  private departments: Department[] = [];
  private agents: Agent[] = [];
  private tasks: Task[] = [];
  private runs: Run[] = [];
  private sessions: Session[] = [];
  private communications: AgentCommunication[] = [];

  private readonly runtime = new Map<string, AgentRuntime>();
  private readonly live = new Map<string, LiveRun>();
  /** agentId -> JSON of the last view sent, so we only emit real changes. */
  private readonly lastViews = new Map<string, string>();
  private readonly buffers = new Map<string, OutputBuffer>();
  private readonly promptLog = new Map<string, { text: string; kind: string }[]>();

  private readonly harnessIndex: Map<string, HarnessAdapter>;
  private readonly providerIndex: Map<string, ModelProvider>;
  private readonly thresholds: PressureThresholds;

  constructor(private readonly options: OfficeOptions) {
    this.harnessIndex = new Map(options.harnesses.map((h) => [h.id, h]));
    this.providerIndex = new Map(options.providers.map((p) => [p.id, p]));
    this.thresholds = options.thresholds ?? DEFAULT_PRESSURE_THRESHOLDS;
  }

  /* ------------------------------------------------------------ lifecycle */

  async init(): Promise<void> {
    const loaded = await this.options.store.load();
    const state = loaded ?? emptyOfficeState();

    // Recovery: a run that never reached a terminal outcome is interrupted, not live.
    const now = this.timestamp();
    this.runs = state.runs.map((run) =>
      run.status === 'running'
        ? { ...run, status: 'interrupted' as const, finishedAt: now, failureReason: 'Interrupted by restart' }
        : run,
    );
    this.sessions = state.sessions.map((session) =>
      session.status === 'starting' || session.status === 'running'
        ? { ...session, status: 'failed' as const, endedAt: now }
        : session,
    );
    this.departments = [...state.departments];
    this.agents = [...state.agents];
    this.tasks = recomputeBlocked(state.tasks);
    this.communications = deriveCommunications(state.communications ?? [], {
      tasks: this.tasks,
      runs: this.runs,
      agents: this.agents,
    });
    for (const agent of this.agents) this.runtime.set(agent.id, this.freshRuntime());
    this.persist();
  }

  get pressureThresholds(): PressureThresholds {
    return this.thresholds;
  }

  capabilities(): Capabilities {
    return {
      harnessAdapters: this.options.harnesses.map((harness) => ({
        id: harness.id,
        label: harness.label,
        capabilities: harness.capabilities,
      })),
      modelProviders: this.options.providers.map((provider) => ({
        id: provider.id,
        label: provider.label,
        models: provider.listModels(),
      })),
    };
  }

  snapshot(): Snapshot {
    return {
      agents: this.agents.map((agent) => this.view(agent)),
      departments: [...this.departments],
      tasks: [...this.tasks],
      sessions: [...this.sessions],
      capabilities: this.capabilities(),
      pressureThresholds: this.thresholds,
      communications: [...this.communications],
      oldestCommunicationId: this.communications[0]?.id ?? null,
    };
  }

  /** Harness prompts recorded per session; used to prove prompt fidelity. */
  promptsFor(sessionId: string): { text: string; kind: string }[] {
    return [...(this.promptLog.get(sessionId) ?? [])];
  }

  /* ---------------------------------------------------------- departments */

  listDepartments(): Department[] {
    return [...this.departments];
  }

  createDepartment(name: string): Department {
    const trimmed = name.trim();
    if (trimmed.length === 0) throw new OfficeFailure(ERROR_CODES.validation, 'Department name is required');
    if (this.departments.some((d) => d.name === trimmed)) {
      throw new OfficeFailure(ERROR_CODES.validation, `Department "${trimmed}" already exists`);
    }
    const department: Department = { id: this.id('dept'), name: trimmed, createdAt: this.timestamp() };
    this.departments.push(department);
    this.options.sink.emit('department.updated', department);
    this.persist();
    return department;
  }

  renameDepartment(id: string, name: string): Department {
    const department = this.requireDepartment(id);
    const trimmed = name.trim();
    if (trimmed.length === 0) throw new OfficeFailure(ERROR_CODES.validation, 'Department name is required');
    department.name = trimmed;
    this.options.sink.emit('department.updated', department);
    this.persist();
    return department;
  }

  /** Agents are retained and become unassigned. */
  deleteDepartment(id: string): void {
    this.requireDepartment(id);
    this.departments = this.departments.filter((d) => d.id !== id);
    for (const agent of this.agents) {
      if (agent.departmentId === id) {
        delete agent.departmentId;
        agent.updatedAt = this.timestamp();
        this.publishAgent(agent);
      }
    }
    this.options.sink.emit('department.removed', { id });
    this.persist();
  }

  /* --------------------------------------------------------------- agents */

  listAgents(): AgentView[] {
    return this.agents.map((agent) => this.view(agent));
  }

  getAgent(id: string): AgentView {
    return this.view(this.requireAgent(id));
  }

  async createAgent(input: CreateAgentInput): Promise<AgentView> {
    const name = input.name.trim();
    if (name.length === 0) throw new OfficeFailure(ERROR_CODES.validation, 'Agent name is required');
    if (this.agents.some((a) => a.name === name)) {
      throw new OfficeFailure(ERROR_CODES.validation, `Agent "${name}" already exists`);
    }
    const harness = this.harnessIndex.get(input.harnessId);
    if (harness === undefined) {
      throw new OfficeFailure(
        ERROR_CODES.unknownAdapter,
        `Unknown harness adapter "${input.harnessId}"`,
        { registered: [...this.harnessIndex.keys()] },
      );
    }
    const provider = this.providerIndex.get(input.model.providerId);
    if (provider === undefined) {
      throw new OfficeFailure(
        ERROR_CODES.unknownAdapter,
        `Unknown model provider "${input.model.providerId}"`,
        { registered: [...this.providerIndex.keys()] },
      );
    }
    provider.resolve(input.model);
    if (input.departmentId !== undefined) this.requireDepartment(input.departmentId);

    const exists = await this.options.pathExists?.(input.workingDir);
    if (exists === false) {
      throw new OfficeFailure(ERROR_CODES.validation, `Working directory does not exist: ${input.workingDir}`, {
        fields: [{ path: 'workingDir', message: 'Path not found' }],
      });
    }

    const agent: Agent = {
      id: this.id('agent'),
      name,
      workingDir: input.workingDir,
      harnessId: input.harnessId,
      model: input.model,
      createdAt: this.timestamp(),
      updatedAt: this.timestamp(),
      ...(input.role !== undefined ? { role: input.role } : {}),
      ...(input.departmentId !== undefined ? { departmentId: input.departmentId } : {}),
      ...(input.systemPrompt !== undefined ? { systemPrompt: input.systemPrompt } : {}),
    };
    this.agents.push(agent);
    this.runtime.set(agent.id, this.freshRuntime());
    this.publishAgent(agent);
    this.persist();
    return this.view(agent);
  }

  updateAgent(id: string, patch: UpdateAgentInput): AgentView {
    const agent = this.requireAgent(id);
    if (patch.name !== undefined) {
      const name = patch.name.trim();
      if (name.length === 0) throw new OfficeFailure(ERROR_CODES.validation, 'Agent name is required');
      if (this.agents.some((a) => a.id !== id && a.name === name)) {
        throw new OfficeFailure(ERROR_CODES.validation, `Agent "${name}" already exists`);
      }
      agent.name = name;
    }
    if (patch.role !== undefined) {
      if (patch.role === null || patch.role === '') delete agent.role;
      else agent.role = patch.role;
    }
    if (patch.departmentId !== undefined) {
      if (patch.departmentId === null || patch.departmentId === '') delete agent.departmentId;
      else {
        this.requireDepartment(patch.departmentId);
        agent.departmentId = patch.departmentId;
      }
    }
    if (patch.workingDir !== undefined) agent.workingDir = patch.workingDir;
    if (patch.harnessId !== undefined) {
      if (!this.harnessIndex.has(patch.harnessId)) {
        throw new OfficeFailure(ERROR_CODES.unknownAdapter, `Unknown harness adapter "${patch.harnessId}"`);
      }
      agent.harnessId = patch.harnessId;
    }
    if (patch.model !== undefined) {
      const provider = this.providerIndex.get(patch.model.providerId);
      if (provider === undefined) {
        throw new OfficeFailure(ERROR_CODES.unknownAdapter, `Unknown model provider "${patch.model.providerId}"`);
      }
      provider.resolve(patch.model);
      agent.model = patch.model;
    }
    if (patch.systemPrompt !== undefined) {
      if (patch.systemPrompt === null || patch.systemPrompt === '') delete agent.systemPrompt;
      else agent.systemPrompt = patch.systemPrompt;
    }
    agent.updatedAt = this.timestamp();
    this.publishAgent(agent);
    this.persist();
    return this.view(agent);
  }

  deleteAgent(id: string): void {
    const agent = this.requireAgent(id);
    if (this.live.has(id)) {
      throw new OfficeFailure(ERROR_CODES.conflict, `Agent "${agent.name}" has a run in progress`);
    }
    this.agents = this.agents.filter((a) => a.id !== id);
    this.tasks = this.tasks.filter((t) => t.agentId !== id);
    this.runtime.delete(id);
    this.options.sink.emit('agent.removed', { id });
    this.persist();
  }

  /* ------------------------------------------------------------- profiles */

  async getAgentProfile(id: string): Promise<AgentProfile> {
    this.requireAgent(id);
    return this.options.store.readAgentProfile(id);
  }

  /**
   * Persists a profile in place. Validation runs before the write so a rejected
   * payload can never partially replace the stored profile.
   */
  async setAgentProfile(id: string, profile: AgentProfile): Promise<AgentProfile> {
    this.requireAgent(id);
    assertValidAgentProfile(profile);
    await this.options.store.writeAgentProfile(id, profile);
    return profile;
  }

  /* ---------------------------------------------------------------- tasks */

  listTasks(agentId?: string): Task[] {
    const list = agentId === undefined ? this.tasks : this.tasks.filter((t) => t.agentId === agentId);
    return orderQueue(list);
  }

  getTask(id: string): Task {
    return this.requireTask(id);
  }

  createTask(input: CreateTaskInput): Task {
    const agent = this.requireAgent(input.agentId);
    if (input.title.trim().length === 0) throw new OfficeFailure(ERROR_CODES.validation, 'Task title is required');
    if (input.instruction.length === 0) throw new OfficeFailure(ERROR_CODES.validation, 'Task instruction is required');
    const dependsOn = input.dependsOn ?? [];
    for (const dependency of dependsOn) this.requireTask(dependency);

    const siblings = this.tasks.filter((t) => t.agentId === agent.id);
    const task: Task = {
      id: this.id('task'),
      agentId: agent.id,
      title: input.title.trim(),
      instruction: input.instruction,
      status: 'queued',
      dependsOn,
      queuePosition: siblings.length,
      origin: input.origin ?? { kind: 'client' },
      createdAt: this.timestamp(),
      updatedAt: this.timestamp(),
      blockedBy: [],
    };
    if (wouldCreateCycle([...this.tasks, task], task.id, dependsOn)) {
      throw new OfficeFailure(ERROR_CODES.cycle, 'Dependency would create a cycle');
    }
    this.tasks.push(task);
    this.tasks = recomputeBlocked(this.tasks);
    const stored = this.requireTask(task.id);
    this.options.sink.emit('task.updated', stored);
    this.refreshQueue();
    this.refreshCommunications();
    this.persist();
    return stored;
  }

  setTaskDependencies(id: string, dependsOn: string[]): Task {
    const task = this.requireTask(id);
    if (task.status === 'running') {
      throw new OfficeFailure(ERROR_CODES.conflict, 'Cannot change dependencies of a running task');
    }
    for (const dependency of dependsOn) this.requireTask(dependency);
    if (wouldCreateCycle(this.tasks, id, dependsOn)) {
      throw new OfficeFailure(ERROR_CODES.cycle, 'Dependency would create a cycle');
    }
    task.dependsOn = [...new Set(dependsOn)];
    task.updatedAt = this.timestamp();
    this.tasks = recomputeBlocked(this.tasks);
    const stored = this.requireTask(id);
    this.options.sink.emit('task.updated', stored);
    this.refreshQueue();
    this.persist();
    return stored;
  }

  /** Moves a queued/blocked task to `position` among its agent's movable tasks. */
  reorderTask(id: string, position: number): Task {
    const task = this.requireTask(id);
    if (task.status === 'running') {
      throw new OfficeFailure(ERROR_CODES.conflict, 'Cannot reorder a running task');
    }
    const queue = orderQueue(this.tasks.filter((t) => t.agentId === task.agentId));
    const moving = queue.filter((t) => t.status !== 'running');
    const from = moving.findIndex((t) => t.id === id);
    moving.splice(from, 1);
    const target = Math.max(0, Math.min(Math.trunc(position), moving.length));
    moving.splice(target, 0, task);

    const slots: (Task | undefined)[] = new Array(queue.length).fill(undefined);
    queue.forEach((t, index) => {
      if (t.status === 'running') slots[index] = t;
    });
    let cursor = 0;
    for (let i = 0; i < slots.length; i += 1) {
      if (slots[i] === undefined) slots[i] = moving[cursor++];
    }

    const now = this.timestamp();
    for (let i = 0; i < slots.length; i += 1) {
      const slot = slots[i];
      if (slot === undefined) continue;
      if (slot.queuePosition !== i) {
        slot.queuePosition = i;
        slot.updatedAt = now;
      }
    }
    this.options.sink.emit('task.updated', this.requireTask(id));
    this.persist();
    return this.requireTask(id);
  }

  /**
   * Re-queues a finished task so it can run again with its original instruction.
   * The task keeps its id and the earlier run stays in the session history; only
   * the derived result is cleared. Re-running a failed dependency also unblocks
   * its dependents, because the queue is re-derived.
   */
  reopenTask(id: string): Task {
    const task = this.requireTask(id);
    if (!isTerminalStatus(task.status)) {
      throw new OfficeFailure(ERROR_CODES.conflict, 'Only a finished task can be queued to run again');
    }
    task.status = 'queued';
    delete task.result;
    task.blockedBy = [];
    task.updatedAt = this.timestamp();
    // Front of the queue, so the next `startRun` for this agent picks this task.
    const reopened = this.reorderTask(id, 0);
    this.options.sink.emit('task.updated', reopened);
    this.refreshQueue();
    this.persist();
    return this.requireTask(id);
  }

  deleteTask(id: string): void {
    const task = this.requireTask(id);
    if (task.status === 'running') throw new OfficeFailure(ERROR_CODES.conflict, 'Cannot delete a running task');
    const dependents = this.tasks.filter((t) => t.dependsOn.includes(id));
    if (dependents.length > 0) {
      throw new OfficeFailure(ERROR_CODES.conflict, 'Task is a dependency of other tasks', {
        dependents: dependents.map((t) => t.id),
      });
    }
    this.tasks = this.tasks.filter((t) => t.id !== id);
    this.options.sink.emit('task.removed', { id });
    this.refreshQueue();
    this.persist();
  }

  /* ------------------------------------------------------------- sessions */

  listSessions(): Session[] {
    return [...this.sessions];
  }

  getSession(id: string): Session {
    const session = this.sessions.find((s) => s.id === id);
    if (session === undefined) throw new OfficeFailure(ERROR_CODES.notFound, `Unknown session "${id}"`);
    return session;
  }

  sessionOutput(sessionId: string, fromSeq = 0): SessionOutputSlice {
    this.getSession(sessionId);
    const buffer = this.bufferFor(sessionId);
    return {
      sessionId,
      oldestSeq: buffer.oldestSeq(),
      lastSeq: buffer.lastSeq,
      fromSeq,
      chunks: buffer.since(fromSeq),
    };
  }

  sessionTail(sessionId: string, lines: number): string {
    this.getSession(sessionId);
    return this.bufferFor(sessionId).tailLines(lines);
  }

  sessionTelemetry(sessionId: string): Telemetry | null {
    const session = this.getSession(sessionId);
    return session.telemetry ?? null;
  }

  listRuns(): Run[] {
    return [...this.runs];
  }

  /** Retained communications, optionally filtered to one agent's involvement. */
  listCommunications(agentId?: string): AgentCommunication[] {
    if (agentId !== undefined) this.requireAgent(agentId);
    return filterCommunications(this.communications, agentId);
  }

  /* ------------------------------------------------------------- run loop */

  async startRun(agentId: string): Promise<{ runId: string; taskId: string; sessionId: string }> {
    const agent = this.requireAgent(agentId);
    if (this.live.has(agentId) || isBusy(this.runtime.get(agentId)?.state ?? 'idle')) {
      throw new OfficeFailure(ERROR_CODES.conflict, `Agent "${agent.name}" already has a run in progress`);
    }

    const agentTasks = this.tasks.filter((t) => t.agentId === agentId);
    const task = nextRunnableTask(this.tasks, agentId);
    if (task === null) {
      const blocked = agentTasks.filter((t) => t.status === 'blocked');
      if (blocked.length > 0) {
        throw new OfficeFailure(ERROR_CODES.conflict, 'No runnable task: queue is blocked by dependencies', {
          blockedBy: blocked[0]?.blockedBy ?? [],
        });
      }
      throw new OfficeFailure(ERROR_CODES.conflict, 'Agent has no queued task');
    }

    const harness = this.harnessIndex.get(agent.harnessId);
    if (harness === undefined) {
      throw new OfficeFailure(ERROR_CODES.unknownAdapter, `Unknown harness adapter "${agent.harnessId}"`, {
        registered: [...this.harnessIndex.keys()],
      });
    }
    const provider = this.providerIndex.get(agent.model.providerId);
    if (provider === undefined) {
      throw new OfficeFailure(ERROR_CODES.unknownAdapter, `Unknown model provider "${agent.model.providerId}"`);
    }
    const resolved = provider.resolve(agent.model);

    if (!(await harness.isAvailable())) {
      throw new OfficeFailure(
        ERROR_CODES.harnessUnavailable,
        `Harness "${harness.label}" is not available on this host`,
      );
    }

    const runId = this.id('run');
    const sessionId = this.id('session');
    const now = this.timestamp();

    task.status = 'running';
    task.updatedAt = now;
    const run: Run = { id: runId, agentId, taskId: task.id, sessionId, status: 'running', startedAt: now };
    const session: Session = {
      id: sessionId,
      agentId,
      taskId: task.id,
      runId,
      status: 'starting',
      backing: harness.backing,
      cols: this.options.cols ?? 120,
      rows: this.options.rows ?? 30,
      createdAt: now,
    };
    this.runs.push(run);
    this.sessions.push(session);
    this.buffers.set(sessionId, new OutputBuffer(this.options.outputBuffer ?? DEFAULT_OUTPUT_BUFFER));
    // Record what the office asked the harness to run, verbatim.
    this.recordPrompt(sessionId, task.instruction, 'instruction');
    // Delegation and hand-off markers anchor to this run's session so the
    // transcript can interleave them with the output.
    this.refreshCommunications({ taskId: task.id, sessionId });

    const runtime = this.runtime.get(agentId) ?? this.freshRuntime();
    this.runtime.set(agentId, {
      ...runtime,
      state: reduceAgentState(runtime.state, { type: 'run.started' }),
      activityOverride: null,
      contextUsage: null,
      telemetry: null,
      currentTaskId: task.id,
      runId,
      sessionId,
    });

    this.options.sink.emit('task.updated', task);
    this.options.sink.emit('run.updated', run);
    this.options.sink.emit('session.updated', session);
    this.publishAgent(agent);

    const dependencyResults: DependencyResult[] = task.dependsOn
      .map((id) => this.tasks.find((t) => t.id === id))
      .filter((dep): dep is Task => dep !== undefined && dep.result !== undefined)
      .map((dep) => ({ taskId: dep.id, title: dep.title, output: dep.result?.output ?? '' }));

    try {
      const profile = await this.options.store.readAgentProfile(agentId);
      const handle = await harness.startRun({
        runId,
        sessionId,
        agentId,
        taskId: task.id,
        workingDir: agent.workingDir,
        instruction: task.instruction,
        model: resolved,
        dependencyResults,
        ...(profile.instructions.length > 0 ? { instructions: profile.instructions } : {}),
        ...(agent.systemPrompt !== undefined ? { systemPrompt: agent.systemPrompt } : {}),
        cols: session.cols ?? 120,
        rows: session.rows ?? 30,
      });
      const liveRun: LiveRun = { run: handle, runId, sessionId, taskId: task.id, finalOutput: [], settled: false };
      this.live.set(agentId, liveRun);
      session.status = 'running';
      this.options.sink.emit('session.updated', session);
      handle.onEvent((event) => this.onHarnessEvent(agentId, liveRun, event));
      this.persist();
    } catch (error) {
      const failure = error instanceof OfficeFailure ? error : undefined;
      await this.finishRun(agentId, liveRunStub(runId, sessionId, task.id), {
        type: 'end',
        status: 'failed',
        failureReason: failure?.message ?? (error as Error).message,
      });
      throw error;
    }

    return { runId, taskId: task.id, sessionId };
  }

  async cancelRun(agentId: string): Promise<void> {
    const live = this.live.get(agentId);
    if (live === undefined) throw new OfficeFailure(ERROR_CODES.conflict, 'Agent has no run to cancel');
    await live.run.cancel();
  }

  async prompt(agentId: string, text: string): Promise<PromptDelivery> {
    const live = this.live.get(agentId);
    if (live === undefined) {
      throw new OfficeFailure(ERROR_CODES.conflict, 'Agent has no live session to prompt');
    }
    const agent = this.requireAgent(agentId);
    const harness = this.harnessIndex.get(agent.harnessId);
    if (harness?.capabilities.midRunPrompt !== true) {
      throw new OfficeFailure(
        ERROR_CODES.unsupported,
        `Harness "${harness?.label ?? agent.harnessId}" cannot accept prompts on a running session`,
      );
    }
    const delivery = await live.run.prompt(text);
    this.recordPrompt(live.sessionId, text, 'client');
    return delivery;
  }

  writeInput(agentId: string, data: string): void {
    const live = this.requireLive(agentId);
    const agent = this.requireAgent(agentId);
    const harness = this.harnessIndex.get(agent.harnessId);
    if (harness?.capabilities.interactiveInput !== true) {
      throw new OfficeFailure(ERROR_CODES.unsupported, 'Harness does not accept raw terminal input');
    }
    live.run.write(data);
  }

  resize(agentId: string, cols: number, rows: number): void {
    const live = this.requireLive(agentId);
    const agent = this.requireAgent(agentId);
    const harness = this.harnessIndex.get(agent.harnessId);
    if (harness?.capabilities.resize !== true) {
      throw new OfficeFailure(ERROR_CODES.unsupported, 'Harness does not support terminal resize');
    }
    const session = this.sessions.find((s) => s.id === live.sessionId);
    if (session !== undefined) {
      session.cols = cols;
      session.rows = rows;
      this.options.sink.emit('session.updated', session);
    }
    live.run.resize(cols, rows);
  }

  async flush(): Promise<void> {
    await this.options.store.flush();
  }

  /* -------------------------------------------------------------- internals */

  private onHarnessEvent(agentId: string, liveRun: LiveRun, event: HarnessEvent): void {
    if (liveRun.settled) return;
    switch (event.type) {
      case 'output': {
        const chunk = this.bufferFor(liveRun.sessionId).append(event.data);
        liveRun.finalOutput.push(event.data);
        this.options.sink.emit('session.output', {
          sessionId: liveRun.sessionId,
          agentId,
          fromSeq: chunk.seq,
          chunks: [chunk.data],
        });
        return;
      }
      case 'prompt': {
        this.recordPrompt(liveRun.sessionId, event.text, event.kind);
        return;
      }
      case 'activity': {
        const runtime = this.runtime.get(agentId);
        if (runtime !== undefined) {
          runtime.activityOverride = event.summary;
          runtime.state = reduceAgentState(runtime.state, { type: 'run.activity' });
          this.publishAgent(this.requireAgent(agentId));
        }
        return;
      }
      case 'telemetry': {
        this.applyTelemetry(agentId, liveRun, event.telemetry);
        return;
      }
      case 'state': {
        const runtime = this.runtime.get(agentId);
        if (runtime !== undefined) {
          runtime.state = event.state;
          this.publishAgent(this.requireAgent(agentId));
        }
        return;
      }
      case 'notice':
        return;
      case 'end': {
        void this.finishRun(agentId, liveRun, event);
        return;
      }
      default:
        return;
    }
  }

  private applyTelemetry(agentId: string, liveRun: LiveRun, telemetry: Telemetry): void {
    const runtime = this.runtime.get(agentId);
    if (runtime === undefined) return;
    runtime.telemetry = telemetry;
    runtime.contextUsage = telemetry.available ? telemetry.contextUsage : null;

    const session = this.sessions.find((s) => s.id === liveRun.sessionId);
    if (session !== undefined) {
      session.telemetry = telemetry;
      this.options.sink.emit('session.telemetry', {
        sessionId: session.id,
        agentId,
        telemetry,
      });
    }

    const previous = runtime.pressure;
    const pressure = computePressure({
      percent: telemetry.available ? telemetry.contextUsage.percent : null,
      previous,
      thresholds: this.thresholds,
    });
    runtime.pressure = pressure;
    if (pressure !== previous) {
      this.options.sink.emit('pressure.changed', {
        agentId,
        pressure,
        previous,
        percent: telemetry.contextUsage.percent,
      });
    }
    this.publishAgent(this.requireAgent(agentId));
  }

  private async finishRun(
    agentId: string,
    liveRun: LiveRun,
    end: Extract<HarnessEvent, { type: 'end' }>,
  ): Promise<void> {
    if (liveRun.settled) return;
    liveRun.settled = true;
    this.live.delete(agentId);

    const now = this.timestamp();
    const task = this.tasks.find((t) => t.id === liveRun.taskId);
    const run = this.runs.find((r) => r.id === liveRun.runId);
    const session = this.sessions.find((s) => s.id === liveRun.sessionId);

    const runStatus =
      end.status === 'completed' ? 'completed' : end.status === 'cancelled' ? 'cancelled' : 'failed';
    const taskStatus = end.status === 'completed' ? 'done' : end.status === 'cancelled' ? 'cancelled' : 'failed';

    if (run !== undefined) {
      run.status = runStatus;
      run.finishedAt = now;
      if (end.failureReason !== undefined) run.failureReason = end.failureReason;
    }
    if (session !== undefined) {
      session.status = end.status === 'completed' ? 'exited' : 'failed';
      session.endedAt = now;
      if (end.exitCode !== undefined) session.exitCode = end.exitCode;
    }
    if (task !== undefined) {
      const fallback = this.bufferFor(liveRun.sessionId).tailLines(200);
      task.status = taskStatus;
      task.updatedAt = now;
      task.result = {
        status: taskStatus,
        output: end.finalOutput ?? (liveRun.finalOutput.join('') || fallback),
        finishedAt: now,
        ...(end.failureReason !== undefined ? { failureReason: end.failureReason } : {}),
        ...(end.usage !== undefined ? { usage: end.usage } : {}),
      };
    }

    const runtime = this.runtime.get(agentId);
    if (runtime !== undefined) {
      runtime.state = reduceAgentState(runtime.state, {
        type:
          end.status === 'completed'
            ? 'run.completed'
            : end.status === 'cancelled'
              ? 'run.cancelled'
              : 'run.failed',
      });
      runtime.activityOverride = end.failureReason ?? null;
      runtime.currentTaskId = null;
      runtime.runId = null;
      runtime.sessionId = null;
      runtime.contextUsage = null;
      runtime.pressure = 'unknown';
    }

    if (run !== undefined) this.options.sink.emit('run.updated', run);
    if (session !== undefined) this.options.sink.emit('session.updated', session);
    if (task !== undefined) this.options.sink.emit('task.updated', task);
    this.publishAgent(this.requireAgent(agentId));

    // Dependents may now be runnable, and blocked agents' states may change.
    this.refreshQueue();
    this.refreshCommunications();
    this.persist();
    await Promise.resolve();
  }

  /** Re-derive blocked/queued and the waiting state of idle agents. */
  private refreshQueue(): void {
    const before = new Map(this.tasks.map((t) => [t.id, t.status]));
    this.tasks = recomputeBlocked(this.tasks);
    for (const task of this.tasks) {
      if (before.get(task.id) !== task.status) this.options.sink.emit('task.updated', task);
    }

    for (const id of blockedByFailure(this.tasks)) {
      const stuck = this.tasks.find((t) => t.id === id);
      if (stuck !== undefined && stuck.status === 'blocked' && stuck.blockedBy.length === 0) {
        stuck.blockedBy = [...stuck.dependsOn];
      }
    }

    for (const agent of this.agents) {
      if (this.live.has(agent.id)) continue;
      const runtime = this.runtime.get(agent.id);
      if (runtime === undefined) continue;
      if (runtime.state === 'error' || runtime.state === 'done') continue;
      const agentTasks = this.tasks.filter((t) => t.agentId === agent.id);
      const hasBlocked = agentTasks.some((t) => t.status === 'blocked');
      const next = hasBlocked ? 'waiting' : 'idle';
      if (runtime.state !== next) {
        runtime.state = next;
      }
    }

    // Queue changes alter derived view fields (next task, waiting-on) without
    // necessarily changing the runtime state, so always reconcile the views.
    this.publishAllAgents();
  }

  /**
   * Emits an agent's view when - and only when - that view actually changed.
   *
   * A view carries derived state (next task, waiting-on, pressure), not just the
   * runtime state. Emitting only on a state change meant that queueing a task for
   * an idle agent produced no event at all: the task existed, but every client
   * kept a stale `nextTaskId: null` and the UI showed an empty queue.
   */
  private publishAgent(agent: Agent): void {
    const view = this.view(agent);
    const serialized = JSON.stringify(view);
    if (this.lastViews.get(agent.id) === serialized) return;
    this.lastViews.set(agent.id, serialized);
    this.options.sink.emit('agent.updated', view);
  }

  /** Every agent's view depends on the whole task graph, so refresh them all. */
  private publishAllAgents(): void {
    for (const agent of this.agents) this.publishAgent(agent);
  }

  /**
   * Re-derives the communication events from current state and emits the ones
   * that were created or changed. Derivation is idempotent, so this is safe to
   * call after any task/run mutation. An optional anchor stamps the events for a
   * just-started task with its session, so the transcript can interleave them.
   */
  private refreshCommunications(anchor?: { taskId: string; sessionId: string }): void {
    const { events, changed } = refreshCommunicationEvents(
      this.communications,
      { tasks: this.tasks, runs: this.runs, agents: this.agents },
      anchor,
    );
    for (const event of changed) this.options.sink.emit('communication.updated', event);
    this.communications = events;
  }

  private view(agent: Agent): AgentView {
    const runtime = this.runtime.get(agent.id) ?? this.freshRuntime();
    const agentTasks = this.tasks.filter((t) => t.agentId === agent.id);
    const nextTask = nextRunnableTask(this.tasks, agent.id);
    const current =
      runtime.currentTaskId === null
        ? undefined
        : this.tasks.find((t) => t.id === runtime.currentTaskId);
    const waitingOn = agentTasks
      .filter((t) => t.status !== 'running' && t.blockedBy.length > 0)
      .flatMap((t) => t.blockedBy);

    return {
      ...agent,
      state: runtime.state,
      activity: activityFor(agent, runtime, current, this.tasks),
      pressure: runtime.pressure,
      contextUsage: runtime.contextUsage,
      currentTaskId: runtime.currentTaskId,
      nextTaskId: nextTask?.id ?? null,
      waitingOn: [...new Set(waitingOn)],
      sessionId: runtime.sessionId,
      runId: runtime.runId,
    };
  }

  private bufferFor(sessionId: string): OutputBuffer {
    let buffer = this.buffers.get(sessionId);
    if (buffer === undefined) {
      buffer = new OutputBuffer(this.options.outputBuffer ?? DEFAULT_OUTPUT_BUFFER);
      this.buffers.set(sessionId, buffer);
    }
    return buffer;
  }

  private recordPrompt(sessionId: string, text: string, kind: string): void {
    const log = this.promptLog.get(sessionId) ?? [];
    log.push({ text, kind });
    this.promptLog.set(sessionId, log);
  }

  private freshRuntime(): AgentRuntime {
    return {
      state: 'idle',
      activityOverride: null,
      pressure: 'unknown',
      contextUsage: null,
      telemetry: null,
      currentTaskId: null,
      runId: null,
      sessionId: null,
    };
  }

  private requireAgent(id: string): Agent {
    const agent = this.agents.find((a) => a.id === id);
    if (agent === undefined) throw new OfficeFailure(ERROR_CODES.notFound, `Unknown agent "${id}"`);
    return agent;
  }

  private requireDepartment(id: string): Department {
    const department = this.departments.find((d) => d.id === id);
    if (department === undefined) throw new OfficeFailure(ERROR_CODES.notFound, `Unknown department "${id}"`);
    return department;
  }

  private requireTask(id: string): Task {
    const task = this.tasks.find((t) => t.id === id);
    if (task === undefined) throw new OfficeFailure(ERROR_CODES.notFound, `Unknown task "${id}"`);
    return task;
  }

  private requireLive(agentId: string): LiveRun {
    const live = this.live.get(agentId);
    if (live === undefined) throw new OfficeFailure(ERROR_CODES.conflict, 'Agent has no live session');
    return live;
  }

  private state(): OfficeState {
    return {
      departments: this.departments,
      agents: this.agents,
      tasks: this.tasks,
      runs: this.runs,
      sessions: this.sessions,
      communications: this.communications,
    };
  }

  private persist(): void {
    this.options.store.save(this.state());
  }

  private id(prefix: string): string {
    return this.options.newId?.(prefix) ?? `${prefix}_${randomUUID().slice(0, 8)}`;
  }

  private timestamp(): string {
    return (this.options.now?.() ?? new Date()).toISOString();
  }
}

