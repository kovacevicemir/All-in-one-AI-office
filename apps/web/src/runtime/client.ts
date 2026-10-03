import {
  CommandResponseSchema,
  EventEnvelopeSchema,
  type AgentCommunication,
  type AgentProfile,
  type Capabilities,
  type CommandResponse,
  type EventEnvelope,
  type OfficeError,
  type SessionOutputPayload,
  type Snapshot,
  type Task,
} from '@ai-office/contracts';

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

export type ClientEvent =
  | { kind: 'snapshot'; snapshot: Snapshot }
  | { kind: 'envelope'; envelope: EventEnvelope }
  | { kind: 'status'; status: ConnectionStatus }
  | { kind: 'error'; error: OfficeError };

/** Minimal timer signatures, so the injected hooks stay framework-free. */
type TimeoutHandle = ReturnType<typeof setTimeout>;
type SetTimeoutLike = (handler: () => void, timeoutMs: number) => TimeoutHandle;
type ClearTimeoutLike = (handle: TimeoutHandle) => void;

export interface RuntimeClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  WebSocketImpl?: typeof WebSocket;
  reconnectDelayMs?: number;
  /** Injectable timer hooks keep reconnect tests deterministic. */
  setTimeoutImpl?: SetTimeoutLike;
  clearTimeoutImpl?: ClearTimeoutLike;
}

export interface CreateAgentPayload {
  name: string;
  workingDir: string;
  harnessId: string;
  model: { providerId: string; modelId: string };
  departmentId?: string;
  role?: string;
}

export interface CreateTaskPayload {
  agentId: string;
  title: string;
  instruction: string;
  dependsOn?: string[];
}

/**
 * The only place the UI talks to the runtime. Everything crosses the documented
 * contract; no vendor knowledge and no harness specifics live here.
 */
export class RuntimeClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly WebSocketImpl: typeof WebSocket;
  private readonly reconnectDelayMs: number;
  private readonly setTimeoutImpl: SetTimeoutLike;
  private readonly clearTimeoutImpl: ClearTimeoutLike;

  private socket: WebSocket | null = null;
  private readonly listeners = new Set<(event: ClientEvent) => void>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;
  private status: ConnectionStatus = 'disconnected';

  constructor(options: RuntimeClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? 'http://127.0.0.1:4317';
    this.fetchImpl = options.fetchImpl ?? ((...args) => fetch(...args));
    this.WebSocketImpl = options.WebSocketImpl ?? WebSocket;
    this.reconnectDelayMs = options.reconnectDelayMs ?? 1_500;
    this.setTimeoutImpl = options.setTimeoutImpl ?? ((handler, timeout) => setTimeout(handler, timeout));
    this.clearTimeoutImpl = options.clearTimeoutImpl ?? ((id) => clearTimeout(id));
  }

  on(listener: (event: ClientEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  get connectionStatus(): ConnectionStatus {
    return this.status;
  }

  connect(): void {
    this.closed = false;
    if (this.socket !== null) return;
    this.setStatus('connecting');
    const socket = new this.WebSocketImpl(this.baseUrl.replace('http', 'ws'));
    this.socket = socket;

    socket.addEventListener('open', () => this.setStatus('connected'));
    socket.addEventListener('message', (message: MessageEvent) => this.onMessage(message.data));
    socket.addEventListener('close', () => {
      this.socket = null;
      this.setStatus('disconnected');
      if (!this.closed) this.scheduleReconnect();
    });
    socket.addEventListener('error', () => this.setStatus('disconnected'));
  }

  close(): void {
    this.closed = true;
    if (this.reconnectTimer !== null) this.clearTimeoutImpl(this.reconnectTimer);
    this.reconnectTimer = null;
    this.socket?.close();
    this.socket = null;
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null) return;
    this.reconnectTimer = this.setTimeoutImpl(() => {
      this.reconnectTimer = null;
      if (!this.closed) this.connect();
    }, this.reconnectDelayMs);
  }

  private setStatus(status: ConnectionStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.emit({ kind: 'status', status });
  }

  private onMessage(raw: unknown): void {
    if (typeof raw !== 'string') return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }
    const envelope = EventEnvelopeSchema.safeParse(parsed);
    if (!envelope.success) return;

    if (envelope.data.type === 'snapshot') {
      this.emit({ kind: 'snapshot', snapshot: envelope.data.payload as Snapshot });
      return;
    }
    if (envelope.data.type === 'response') {
      // Command acknowledgements are surfaced through the promise returned by
      // the command; nothing to broadcast.
      return;
    }
    // Unknown event types are tolerated by design.
    this.emit({ kind: 'envelope', envelope: envelope.data });
  }

  private emit(event: ClientEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  /* ------------------------------------------------------------- commands */

  send(command: Record<string, unknown>): void {
    if (this.socket === null || this.socket.readyState !== 1) {
      this.emit({
        kind: 'error',
        error: { code: 'not_connected', message: 'Not connected to the runtime' },
      });
      return;
    }
    this.socket.send(JSON.stringify(command));
  }

  /* ------------------------------------------------------------------ http */

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    });
    const text = await response.text();
    const body = text.length > 0 ? (JSON.parse(text) as unknown) : null;
    if (!response.ok) {
      const error = (body ?? { code: 'internal_error', message: response.statusText }) as OfficeError;
      this.emit({ kind: 'error', error });
      throw error;
    }
    return body as T;
  }

  fetchSnapshot(): Promise<Snapshot> {
    return this.request<Snapshot>('/api/snapshot');
  }

  fetchCapabilities(): Promise<Capabilities> {
    return this.request<Capabilities>('/api/capabilities');
  }

  fetchCommunications(agentId?: string): Promise<AgentCommunication[]> {
    const query = agentId === undefined ? '' : `?agentId=${encodeURIComponent(agentId)}`;
    return this.request<AgentCommunication[]>(`/api/communications${query}`);
  }

  createDepartment(name: string): Promise<{ id: string; name: string }> {
    return this.request('/api/departments', { method: 'POST', body: JSON.stringify({ name }) });
  }

  createAgent(payload: CreateAgentPayload): Promise<{ id: string }> {
    return this.request('/api/agents', { method: 'POST', body: JSON.stringify(payload) });
  }

  fetchAgentProfile(agentId: string): Promise<AgentProfile> {
    return this.request(`/api/agents/${encodeURIComponent(agentId)}/profile`);
  }

  saveAgentProfile(agentId: string, profile: AgentProfile): Promise<AgentProfile> {
    return this.request(`/api/agents/${encodeURIComponent(agentId)}/profile`, {
      method: 'PUT',
      body: JSON.stringify(profile),
    });
  }

  createTask(payload: CreateTaskPayload): Promise<{ id: string }> {
    return this.request('/api/tasks', { method: 'POST', body: JSON.stringify(payload) });
  }

  /** Re-queues a finished task so it can be started again. */
  reopenTask(taskId: string): Promise<Task> {
    return this.request(`/api/tasks/${encodeURIComponent(taskId)}/reopen`, { method: 'POST' });
  }

  fetchSessionOutput(sessionId: string, fromSeq = 0): Promise<{
    sessionId: string;
    oldestSeq: number;
    lastSeq: number;
    fromSeq: number;
    chunks: { seq: number; data: string }[];
  }> {
    return this.request(`/api/sessions/${encodeURIComponent(sessionId)}/output?fromSeq=${fromSeq}`);
  }

  start(agentId: string): Promise<{ runId: string; taskId: string; sessionId: string }> {
    return this.request(`/api/agents/${encodeURIComponent(agentId)}/run`, { method: 'POST' });
  }

  cancel(agentId: string): Promise<{ cancelled: boolean }> {
    return this.request(`/api/agents/${encodeURIComponent(agentId)}/cancel`, { method: 'POST' });
  }

  prompt(agentId: string, text: string): Promise<{ delivery: string }> {
    return this.request(`/api/agents/${encodeURIComponent(agentId)}/prompt`, {
      method: 'POST',
      body: JSON.stringify({ text }),
    });
  }
}

export function parseCommandResponse(value: unknown): CommandResponse | null {
  const result = CommandResponseSchema.safeParse(value);
  return result.success ? result.data : null;
}

export type { SessionOutputPayload };
