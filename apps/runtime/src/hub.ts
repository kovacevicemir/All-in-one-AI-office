import type { WebSocket } from 'ws';
import { CONTRACT_VERSION, type EventEnvelope, type Snapshot } from '@ai-office/contracts';
import type { EventSink } from '@ai-office/core';
import type { Office } from '@ai-office/core';

export interface Subscription {
  agentId?: string;
  departmentId?: string;
}

interface Client {
  socket: WebSocket;
  subscription: Subscription;
}

interface PendingOutput {
  sessionId: string;
  agentId: string;
  fromSeq: number;
  chunks: string[];
  bytes: number;
}

export interface HubOptions {
  /** Max bytes of terminal output per emitted frame. */
  frameBytes?: number;
  /** Coalescing window for terminal output. */
  frameMs?: number;
  now?: () => Date;
}

/**
 * Turns domain events into versioned, sequence-numbered envelopes and fans them
 * out to WebSocket clients. Terminal output is coalesced into ~16 ms frames with
 * a per-frame byte cap so a chatty session cannot stall the socket.
 */
export class RealtimeHub implements EventSink {
  private seq = 0;
  private readonly clients = new Set<Client>();
  private readonly pending = new Map<string, PendingOutput>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly frameBytes: number;
  private readonly frameMs: number;
  private readonly now: () => Date;

  constructor(
    private readonly office: Office,
    options: HubOptions = {},
  ) {
    this.frameBytes = options.frameBytes ?? 16 * 1024;
    this.frameMs = options.frameMs ?? 16;
    this.now = options.now ?? (() => new Date());
  }

  get clientCount(): number {
    return this.clients.size;
  }

  get lastSeq(): number {
    return this.seq;
  }

  /* --------------------------------------------------------------- events */

  emit(type: string, payload: unknown): void {
    if (type === 'session.output') {
      this.queueOutput(payload as { sessionId: string; agentId: string; fromSeq: number; chunks: string[] });
      return;
    }
    this.broadcast(this.envelope(type, payload));
  }

  private envelope(type: string, payload: unknown): EventEnvelope {
    return { v: CONTRACT_VERSION, seq: ++this.seq, type, ts: this.now().toISOString(), payload };
  }

  private broadcast(envelope: EventEnvelope): void {
    for (const client of this.clients) {
      if (!this.matches(client.subscription, envelope)) continue;
      this.send(client.socket, envelope);
    }
  }

  private queueOutput(payload: { sessionId: string; agentId: string; fromSeq: number; chunks: string[] }): void {
    const existing = this.pending.get(payload.sessionId);
    if (existing === undefined) {
      this.pending.set(payload.sessionId, {
        sessionId: payload.sessionId,
        agentId: payload.agentId,
        fromSeq: payload.fromSeq,
        chunks: [...payload.chunks],
        bytes: payload.chunks.reduce((total, chunk) => total + chunk.length, 0),
      });
    } else {
      existing.chunks.push(...payload.chunks);
      existing.bytes += payload.chunks.reduce((total, chunk) => total + chunk.length, 0);
    }
    if (this.timer === null) {
      this.timer = setTimeout(() => this.flushOutput(), this.frameMs);
      (this.timer as { unref?: () => void }).unref?.();
    }
  }

  /** Visible for tests: emit coalesced terminal frames now. */
  flushOutput(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const batches = [...this.pending.values()];
    this.pending.clear();
    for (const batch of batches) {
      for (const frame of splitFrames(batch, this.frameBytes)) {
        this.broadcast(this.envelope('session.output', frame));
      }
    }
  }

  /* -------------------------------------------------------------- clients */

  /** Registers the client, then sends its scoped snapshot, so no change is missed. */
  subscribe(socket: WebSocket, subscription: Subscription): void {
    const client: Client = { socket, subscription };
    this.clients.add(client);
    this.send(socket, this.envelope('snapshot', this.snapshotFor(subscription)));
  }

  /** A filtered subscription gets a filtered snapshot, not the whole office. */
  private snapshotFor(subscription: Subscription): Snapshot {
    const full = this.office.snapshot();
    if (subscription.agentId === undefined && subscription.departmentId === undefined) return full;

    const agents = full.agents.filter((agent) =>
      subscription.agentId !== undefined
        ? agent.id === subscription.agentId
        : agent.departmentId === subscription.departmentId,
    );
    const scoped = new Set(agents.map((agent) => agent.id));
    return {
      ...full,
      agents,
      tasks: full.tasks.filter((task) => scoped.has(task.agentId)),
      sessions: full.sessions.filter((session) => scoped.has(session.agentId)),
      communications: full.communications.filter(
        (event) => scoped.has(event.fromAgentId) || scoped.has(event.toAgentId),
      ),
    };
  }

  /**
   * Send an addressed message to one socket using the same envelope as events,
   * so clients parse one shape for everything.
   */
  sendTo(socket: WebSocket, type: string, payload: unknown): void {
    this.send(socket, this.envelope(type, payload));
  }

  unsubscribe(socket: WebSocket): void {
    for (const client of this.clients) {
      if (client.socket === socket) this.clients.delete(client);
    }
  }

  /** Replace a client's filter and re-send a snapshot for the new scope. */
  updateSubscription(socket: WebSocket, subscription: Subscription): void {
    this.unsubscribe(socket);
    this.subscribe(socket, subscription);
  }

  private send(socket: WebSocket, envelope: EventEnvelope): void {
    if (socket.readyState !== 1) return;
    socket.send(JSON.stringify(envelope));
  }

  private matches(subscription: Subscription, envelope: EventEnvelope): boolean {
    if (subscription.agentId === undefined && subscription.departmentId === undefined) return true;
    const payload = envelope.payload;
    if (typeof payload !== 'object' || payload === null) return false;
    const record = payload as { agentId?: unknown; id?: unknown; fromAgentId?: unknown; toAgentId?: unknown };
    const agentId = typeof record.agentId === 'string' ? record.agentId : undefined;

    if (subscription.agentId !== undefined) {
      const involved =
        agentId === subscription.agentId ||
        record.id === subscription.agentId ||
        record.fromAgentId === subscription.agentId ||
        record.toAgentId === subscription.agentId;
      return involved || envelope.type === 'snapshot';
    }
    if (subscription.departmentId !== undefined) {
      if (envelope.type === 'snapshot') return true;
      const ids = this.office
        .listAgents()
        .filter((agent) => agent.departmentId === subscription.departmentId)
        .map((agent) => agent.id);
      return agentId !== undefined && ids.includes(agentId);
    }
    return true;
  }
}

function splitFrames(batch: PendingOutput, maxBytes: number): PendingOutput[] {
  const frames: PendingOutput[] = [];
  let current: PendingOutput = { ...batch, chunks: [], bytes: 0 };

  for (const chunk of batch.chunks) {
    const pieces = chunk.length > maxBytes ? chunk.split(/(?<=\n)/) : [chunk];
    for (const piece of pieces) {
      if (current.bytes > 0 && current.bytes + piece.length > maxBytes) {
        frames.push(current);
        current = { ...batch, chunks: [], bytes: 0 };
      }
      current.chunks.push(piece);
      current.bytes += piece.length;
    }
  }
  if (current.chunks.length > 0) frames.push(current);
  return frames;
}
