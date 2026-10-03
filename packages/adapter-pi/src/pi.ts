import {
  ERROR_CODES,
  type HarnessCapabilities,
  type SessionUsage,
  type SessionBacking,
  type Telemetry,
  type ContextUsage,
} from '@ai-office/contracts';
import {
  OfficeFailure,
  type HarnessAdapter,
  type HarnessEvent,
  type HarnessRun,
  type PromptDelivery,
  type SpawnPort,
  type SpawnedProcess,
  type StartRunRequest,
} from '@ai-office/core';
import { clampToolText, collectToolResult, formatEdits, stringOrEmpty } from './tool-text.js';

const UNKNOWN_CONTEXT: ContextUsage = { tokens: null, contextWindow: null, percent: null };

/** PI dialogs that block the run until the client answers. */
const DIALOG_METHODS = new Set(['select', 'confirm', 'input', 'editor']);

export interface PiHarnessOptions {
  spawn: SpawnPort;
  /** Executable name or path. Defaults to `pi`. */
  command?: string;
  /** How often to poll PI for context usage while a run is active. */
  telemetryIntervalMs?: number;
  /**
   * Force PI's project-trust decision for this run. Left undefined the office
   * passes no trust flag, so PI applies the same decision an interactive run
   * would (a saved `/trust` choice or `defaultProjectTrust`).
   */
  approveProject?: boolean;
  /** Timeout for a single PI command response. */
  responseTimeoutMs?: number;
  /** Timeout for the availability probe. */
  probeTimeoutMs?: number;
  cwd?: () => string;
}

/**
 * PI harness adapter.
 *
 * Drives the PI CLI in its machine-readable RPC mode. The task instruction is
 * handed over as the user prompt with no wrapper and no office-authored system
 * prompt, so a run through the office costs the same tokens as the same command
 * in a terminal. Context usage comes from PI's own `get_session_stats`, which is
 * where the context-pressure signal is sourced.
 */
export class PiHarnessAdapter implements HarnessAdapter {
  readonly id = 'pi';
  readonly label = 'PI';
  readonly backing: SessionBacking = 'pipe';
  readonly capabilities: HarnessCapabilities = {
    cancel: true,
    midRunPrompt: true,
    telemetry: true,
    resize: false,
    interactiveInput: false,
  };

  private availability: boolean | null = null;

  constructor(private readonly options: PiHarnessOptions) {}

  get command(): string {
    return this.options.command ?? 'pi';
  }

  private argsFor(request: StartRunRequest): string[] {
    // No path is passed on the command line. The working directory is supplied as
    // the process cwd, which is not subject to shell quoting, and PI stores its
    // session file in its own per-directory location. Passing a workspace path as
    // an argument breaks on Windows when that path contains spaces.
    const args = [
      '--mode',
      'rpc',
      '--provider',
      request.model.provider,
      '--model',
      request.model.model,
      '--session-id',
      request.sessionId,
    ];
    if (request.systemPrompt !== undefined && request.systemPrompt !== '') {
      args.push('--system-prompt', request.systemPrompt);
    }
    if (request.instructions !== undefined && request.instructions !== '') {
      // The agent's own saved instructions extend PI's base coding prompt; the
      // office itself still authors nothing.
      args.push('--append-system-prompt', request.instructions);
    }
    if (this.options.approveProject !== undefined) {
      args.push(this.options.approveProject ? '--approve' : '--no-approve');
    }
    return args;
  }

  async isAvailable(): Promise<boolean> {
    if (this.availability !== null) return this.availability;
    this.availability = await this.probe();
    return this.availability;
  }

  private async probe(): Promise<boolean> {
    let child: SpawnedProcess;
    try {
      child = await this.options.spawn.spawn({
        sessionId: 'pi-availability',
        command: this.command,
        args: ['--version'],
        cwd: this.options.cwd?.() ?? process.cwd(),
        env: {},
        cols: 80,
        rows: 24,
      });
    } catch {
      return false;
    }

    return await new Promise<boolean>((resolve) => {
      let settled = false;
      const finish = (ok: boolean): void => {
        if (settled) return;
        settled = true;
        try {
          child.kill();
        } catch {
          /* already gone */
        }
        resolve(ok);
      };
      const timer = setTimeout(() => finish(false), this.options.probeTimeoutMs ?? 5_000);
      (timer as { unref?: () => void }).unref?.();
      child.onEvent((event) => {
        if (event.type === 'exit') finish(event.exitCode === 0);
        if (event.type === 'error') finish(false);
      });
    });
  }

  async startRun(request: StartRunRequest): Promise<HarnessRun> {
    const process = await this.options.spawn.spawn({
      sessionId: request.sessionId,
      command: this.command,
      args: this.argsFor(request),
      cwd: request.workingDir,
      env: {},
      cols: request.cols,
      rows: request.rows,
    });
    return new PiRun(request, process, this.options);
  }
}

/** Composes the initial user prompt. With no dependencies it IS the instruction. */
export function composeInitialPrompt(request: StartRunRequest): string {
  if (request.dependencyResults.length === 0) return request.instruction;
  const block = request.dependencyResults
    .map((result) => `### ${result.title} (${result.taskId})\n${result.output}`)
    .join('\n\n');
  return `Dependency results from previously completed tasks:\n\n${block}\n\n---\n\n${request.instruction}`;
}

interface PiUsage {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
  totalTokens?: number;
  cost?: { total?: number };
}

function toUsage(usage: PiUsage | undefined): SessionUsage | undefined {
  if (usage === undefined) return undefined;
  const input = usage.input ?? 0;
  const output = usage.output ?? 0;
  const cacheRead = usage.cacheRead ?? 0;
  const cacheWrite = usage.cacheWrite ?? 0;
  return {
    input,
    output,
    cacheRead,
    cacheWrite,
    total: usage.totalTokens ?? input + output + cacheRead + cacheWrite,
    cost: usage.cost?.total ?? 0,
  };
}

function contentText(message: { content?: unknown }): string {
  const content = message.content;
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((block) => {
      if (typeof block !== 'object' || block === null) return '';
      const record = block as { type?: string; text?: string };
      return record.type === 'text' && typeof record.text === 'string' ? record.text : '';
    })
    .join('');
}

/** One PI RPC session: strict JSONL over a pipe, mapped to normalized events. */
export class PiRun implements HarnessRun {
  readonly pid: number | undefined;

  private readonly listeners = new Set<(event: HarnessEvent) => void>();
  private readonly pending = new Map<string, (record: PiRecord) => void>();
  private readonly assistantMessages: string[] = [];
  private lineBuffer = '';
  private requestCounter = 0;
  private streaming = false;
  private settled = false;
  private usage: SessionUsage | undefined;
  private failureReason: string | undefined;
  private lastUiRequest: string | undefined;
  private readonly responseTimeoutMs: number;
  private readonly timer: ReturnType<typeof setInterval>;
  private unsubscribe: () => void = () => undefined;

  constructor(
    private readonly request: StartRunRequest,
    private readonly process: SpawnedProcess,
    private readonly options: PiHarnessOptions,
  ) {
    this.pid = process.pid;
    this.unsubscribe = process.onEvent((event) => {
      if (event.type === 'output') this.consume(event.data);
      else if (event.type === 'error') this.fail(event.message);
      else if (event.type === 'exit') this.onExit(event.exitCode);
    });

    const interval = this.options.telemetryIntervalMs ?? 2_000;
    this.responseTimeoutMs = this.options.responseTimeoutMs ?? 20_000;
    this.timer = setInterval(() => void this.pollTelemetry(), interval);
    (this.timer as { unref?: () => void }).unref?.();

    void this.sendInitialPrompt();
  }

  onEvent(listener: (event: HarnessEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async prompt(text: string): Promise<PromptDelivery> {
    if (this.settled) throw new OfficeFailure(ERROR_CODES.conflict, 'Session has already ended');
    const delivery: PromptDelivery = this.streaming ? 'steer' : 'sent';
    await this.send({
      type: 'prompt',
      message: text,
      ...(this.streaming ? { streamingBehavior: 'steer' } : {}),
    });
    return delivery;
  }

  write(data: string): void {
    throw new OfficeFailure(ERROR_CODES.unsupported, 'PI RPC sessions do not accept raw terminal input');
  }

  resize(): void {
    throw new OfficeFailure(ERROR_CODES.unsupported, 'PI RPC sessions cannot be resized');
  }

  async cancel(): Promise<void> {
    if (this.settled) return;
    try {
      await this.send({ type: 'abort' });
    } catch {
      /* abort is best-effort */
    }
    this.finish({ type: 'end', status: 'cancelled', exitCode: null, finalOutput: this.finalOutput() });
    this.shutdown();
    await Promise.resolve();
  }

  /* ------------------------------------------------------------- protocol */

  /**
   * PI can ask the user a question mid-run (a dialog method) and blocks until it
   * gets an answer. Ignoring it made PI wait forever and surfaced as a confusing
   * "did not respond" timeout. We decline instead of approving: an unattended run
   * must not silently trust a project-local MCP server or extension on the user's
   * behalf. The question is echoed into the session so it is visible and
   * actionable.
   */
  private onExtensionUiRequest(record: PiRecord): void {
    const method = String(record.method ?? '');
    const id = typeof record.id === 'string' ? record.id : undefined;
    const title = typeof record.title === 'string' ? record.title : method;

    if (DIALOG_METHODS.has(method)) {
      this.lastUiRequest = title;
      if (id !== undefined && !this.settled) {
        this.process.write(
          `${JSON.stringify({ type: 'extension_ui_response', id, cancelled: true })}\n`,
        );
      }
      this.emit({
        type: 'output',
        data: `\n[pi asked: ${title} - declined automatically so the run could continue]\n`,
      });
      this.emit({ type: 'notice', message: `Declined a PI prompt: ${title}` });
      return;
    }

    // `notify`, like `setStatus` and `setWidget`, is extension UI chrome, not
    // agent work. The office mirrors the agent's activity from PI's own session
    // events; extension status (an MCP server connecting, a widget redrawing) is
    // not that, so it is left out rather than shown as the agent's task.
  }

  private async sendInitialPrompt(): Promise<void> {
    const text = composeInitialPrompt(this.request);
    try {
      await this.prompt(text);
      this.emit({ type: 'prompt', text, kind: 'instruction' });
    } catch (error) {
      this.fail((error as Error).message);
    }
  }

  private send(command: Record<string, unknown>): Promise<PiRecord> {
    const id = `req-${++this.requestCounter}`;
    return new Promise<PiRecord>((resolve, reject) => {
      if (this.settled) {
        reject(new OfficeFailure(ERROR_CODES.conflict, 'Session has already ended'));
        return;
      }
      this.pending.set(id, resolve);
      this.process.write(`${JSON.stringify({ id, ...command })}\n`);
      const timer = setTimeout(() => {
        if (this.pending.delete(id)) {
          const because = this.lastUiRequest === undefined ? '' : ` (last PI prompt: ${this.lastUiRequest})`;
          reject(
            new OfficeFailure(
              ERROR_CODES.internal,
              `PI did not respond to "${String(command.type)}" within ${this.responseTimeoutMs}ms${because}`,
            ),
          );
        }
      }, this.responseTimeoutMs);
      (timer as { unref?: () => void }).unref?.();
    });
  }

  private consume(data: string): void {
    this.lineBuffer += data;
    let index = this.lineBuffer.indexOf('\n');
    while (index >= 0) {
      const raw = this.lineBuffer.slice(0, index);
      this.lineBuffer = this.lineBuffer.slice(index + 1);
      const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
      if (line.trim().length > 0) this.handleLine(line);
      index = this.lineBuffer.indexOf('\n');
    }
  }

  private handleLine(line: string): void {
    let record: PiRecord;
    try {
      record = JSON.parse(line) as PiRecord;
    } catch {
      // Non-protocol output (diagnostics on stderr, startup banners) is surfaced
      // verbatim rather than dropped.
      this.emit({ type: 'output', data: `${line}\n` });
      return;
    }

    if (record.type === 'response') {
      const resolver = typeof record.id === 'string' ? this.pending.get(record.id) : undefined;
      if (resolver !== undefined) {
        this.pending.delete(record.id as string);
        resolver(record);
      }
      return;
    }

    switch (record.type) {
      case 'session':
        return;
      case 'agent_start':
        this.streaming = true;
        return;
      case 'agent_settled':
        this.streaming = false;
        this.settleCompleted();
        return;
      case 'message_update':
        this.onMessageUpdate(record);
        return;
      case 'message_end':
        this.onMessageEnd(record);
        return;
      case 'tool_execution_start':
        this.onToolStart(record);
        return;
      case 'tool_execution_end':
        this.onToolEnd(record);
        return;
      case 'compaction_start':
        this.emit({ type: 'output', data: '\n[context compacted]\n' });
        return;
      case 'compaction_end':
        // Percent is unknown until a fresh post-compaction response arrives.
        this.emitTelemetry(UNKNOWN_CONTEXT);
        return;
      case 'turn_end':
        void this.pollTelemetry();
        return;
      case 'auto_retry_end':
        if (record.success === false) {
          this.failureReason = typeof record.finalError === 'string' ? record.finalError : 'PI retries exhausted';
        }
        return;
      case 'extension_ui_request':
        this.onExtensionUiRequest(record);
        return;
      case 'extension_error':
        this.emit({ type: 'notice', message: String(record.error ?? 'extension error') });
        return;
      default:
        return;
    }
  }

  private onMessageUpdate(record: PiRecord): void {
    const usage = toUsage(record.usage as PiUsage | undefined);
    if (usage !== undefined) this.usage = usage;
    const event = record.assistantMessageEvent as
      | { type?: string; delta?: string; reason?: string }
      | undefined;
    if (event === undefined) return;
    if ((event.type === 'text_delta' || event.type === 'thinking_delta') && typeof event.delta === 'string') {
      this.emit({ type: 'output', data: event.delta });
    }
    if (event.type === 'error' && typeof event.reason === 'string') {
      this.failureReason = event.reason;
    }
  }

  private onMessageEnd(record: PiRecord): void {
    const message = record.message as { role?: string; content?: unknown } | undefined;
    if (message?.role !== 'assistant') return;
    this.assistantMessages.push(contentText(message));
  }

  private onToolStart(record: PiRecord): void {
    const name = String(record.toolName ?? 'tool');
    const args = (record.args ?? {}) as Record<string, unknown>;
    if (name === 'bash' && typeof args.command === 'string') {
      this.emit({ type: 'activity', summary: `Running: ${args.command}` });
      this.emit({ type: 'output', data: `\n$ ${args.command}\n` });
      return;
    }
    if (name === 'write' && typeof args.path === 'string') {
      this.emit({ type: 'activity', summary: `Writing ${args.path}` });
      this.emit({ type: 'output', data: `\n[write] ${args.path}\n${clampToolText(stringOrEmpty(args.content))}` });
      return;
    }
    if (name === 'edit' && typeof args.path === 'string') {
      this.emit({ type: 'activity', summary: `Editing ${args.path}` });
      this.emit({ type: 'output', data: `\n[edit] ${args.path}\n${formatEdits(args.edits)}` });
      return;
    }
    this.emit({ type: 'activity', summary: `Using ${name}` });
    this.emit({ type: 'output', data: `\n[${name}]\n` });
  }

  private onToolEnd(record: PiRecord): void {
    const text = collectToolResult(record.result);
    if (text.length > 0) this.emit({ type: 'output', data: text.endsWith('\n') ? text : `${text}\n` });
  }

  private finalOutput(): string {
    return this.assistantMessages.filter((message) => message.length > 0).at(-1) ?? '';
  }

  /**
   * Completing is synchronous and never waits on a telemetry round-trip: a
   * harness that stops answering must not be able to hang a run forever.
   */
  private settleCompleted(): void {
    if (this.settled) return;
    this.finish({
      type: 'end',
      status: this.failureReason === undefined ? 'completed' : 'failed',
      exitCode: 0,
      finalOutput: this.finalOutput(),
      ...(this.failureReason !== undefined ? { failureReason: this.failureReason } : {}),
      ...(this.usage !== undefined ? { usage: this.usage } : {}),
    });
    this.shutdown();
  }

  private async pollTelemetry(): Promise<void> {
    if (this.settled) return;
    try {
      const response = await this.send({ type: 'get_session_stats' });
      const data = (response.data ?? {}) as {
        contextUsage?: { tokens?: number | null; contextWindow?: number | null; percent?: number | null };
        tokens?: PiUsage;
        cost?: number;
      };
      const usage = toUsage(data.tokens);
      if (usage !== undefined) this.usage = { ...usage, cost: data.cost ?? usage.cost };
      const contextUsage: ContextUsage = {
        tokens: data.contextUsage?.tokens ?? null,
        contextWindow: data.contextUsage?.contextWindow ?? null,
        percent: data.contextUsage?.percent ?? null,
      };
      this.emitTelemetry(contextUsage);
    } catch {
      /* telemetry is advisory; never fail a run over it */
    }
  }

  private emitTelemetry(contextUsage: ContextUsage): void {
    const telemetry: Telemetry = {
      available: true,
      contextUsage,
      usage:
        this.usage ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0, cost: 0 },
      updatedAt: new Date().toISOString(),
    };
    this.emit({ type: 'telemetry', telemetry });
  }

  private onExit(exitCode: number | null): void {
    if (this.settled) return;
    if (this.failureReason !== undefined) {
      this.finish({
        type: 'end',
        status: 'failed',
        exitCode,
        failureReason: this.failureReason,
        finalOutput: this.finalOutput(),
      });
      return;
    }
    if (exitCode === 0) {
      this.finish({ type: 'end', status: 'completed', exitCode, finalOutput: this.finalOutput() });
      return;
    }
    this.finish({
      type: 'end',
      status: 'failed',
      exitCode,
      failureReason: `PI exited with code ${exitCode ?? 'unknown'}`,
      finalOutput: this.finalOutput(),
    });
  }

  private fail(message: string): void {
    if (this.settled) return;
    this.finish({ type: 'end', status: 'failed', exitCode: null, failureReason: message });
    this.shutdown();
  }

  private finish(event: Extract<HarnessEvent, { type: 'end' }>): void {
    if (this.settled) return;
    this.settled = true;
    clearInterval(this.timer);
    this.unsubscribe();
    for (const resolver of this.pending.values()) {
      resolver({ type: 'response', success: false, command: 'aborted' });
    }
    this.pending.clear();
    this.emit(event);
  }

  private shutdown(): void {
    try {
      this.process.kill();
    } catch {
      /* already gone */
    }
  }

  private emit(event: HarnessEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}

interface PiRecord {
  type?: string;
  id?: string;
  [key: string]: unknown;
}
