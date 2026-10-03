import { createServer, type Server } from 'node:http';
import { stat } from 'node:fs/promises';
import { WebSocketServer, type WebSocket } from 'ws';
import {
  CONTRACT_VERSION,
  DEFAULT_PRESSURE_THRESHOLDS,
  ERROR_CODES,
  SubscribeMessageSchema,
  parseOrError,
  type CommandResponse,
  type OfficeError,
  type PressureThresholds,
  type SessionOutputPayload,
} from '@ai-office/contracts';
import { Office, type EventSink, type HarnessAdapter, type ModelProvider, type SpawnPort, type StorePort } from '@ai-office/core';
import { DeepSeekModelProvider, PiHarnessAdapter } from '@ai-office/adapter-pi';
import { PipeSpawnPort } from '@ai-office/adapter-session';
import { FileStore } from '@ai-office/adapter-store-file';
import { RealtimeHub, type Subscription } from './hub.js';
import { createHttpHandler, toOfficeError } from './http.js';

export interface RuntimeOptions {
  dataDir?: string;
  host?: string;
  port?: number;
  env?: Record<string, string | undefined>;
  store?: StorePort;
  spawn?: SpawnPort;
  harnesses?: HarnessAdapter[];
  providers?: ModelProvider[];
  thresholds?: PressureThresholds;
  piCommand?: string;
  /** Debounce for write-behind snapshots; tests use 0. */
  persistDebounceMs?: number;
}

export interface Runtime {
  office: Office;
  hub: RealtimeHub;
  server: Server;
  listen(port?: number, host?: string): Promise<{ port: number; url: string }>;
  close(): Promise<void>;
}

/**
 * Composition root. This is the only place that knows which vendors exist: core,
 * the API, and the UI never do.
 */
export async function createRuntime(options: RuntimeOptions = {}): Promise<Runtime> {
  const env = options.env ?? process.env;
  const dataDir = options.dataDir ?? env.AI_OFFICE_DATA_DIR ?? '.ai-office';
  const spawn: SpawnPort = options.spawn ?? new PipeSpawnPort();
  const store: StorePort =
    options.store ?? new FileStore({ dir: dataDir, debounceMs: options.persistDebounceMs ?? 50 });
  const harnesses: HarnessAdapter[] =
    options.harnesses ??
    [
      new PiHarnessAdapter({
        spawn,
        command: options.piCommand ?? env.PI_COMMAND ?? 'pi',
        approveProject:
          env.AI_OFFICE_APPROVE_PROJECT === undefined
            ? undefined
            : env.AI_OFFICE_APPROVE_PROJECT !== 'false',
        telemetryIntervalMs: Number(env.AI_OFFICE_TELEMETRY_INTERVAL_MS ?? '2000'),
      }),
    ];
  const providers: ModelProvider[] =
    options.providers ?? [new DeepSeekModelProvider({ env })];

  let hub!: RealtimeHub;
  const sink: EventSink = {
    emit: (type, payload) => {
      hub.emit(type, payload);
    },
  };

  const office = new Office({
    harnesses,
    providers,
    store,
    sink,
    thresholds: options.thresholds ?? DEFAULT_PRESSURE_THRESHOLDS,
    pathExists: async (path) => {
      try {
        await stat(path);
        return true;
      } catch {
        return false;
      }
    },
  });

  hub = new RealtimeHub(office);
  await office.init();

  const server = createServer(createHttpHandler(office));
  const sockets = new WebSocketServer({ server });

  sockets.on('connection', (socket: WebSocket, request) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    const subscription: Subscription = {};
    const agentId = url.searchParams.get('agentId');
    const departmentId = url.searchParams.get('departmentId');
    if (agentId !== null) subscription.agentId = agentId;
    if (departmentId !== null) subscription.departmentId = departmentId;
    hub.subscribe(socket, subscription);

    socket.on('message', (raw: Buffer | string) => {
      void handleCommand(socket, String(raw));
    });
    socket.on('close', () => hub.unsubscribe(socket));
  });

  async function handleCommand(socket: WebSocket, raw: string): Promise<void> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      reply(socket, { command: 'parse', success: false, error: parseError() });
      return;
    }

    const asRecord = parsed as { type?: unknown };
    if (asRecord.type === 'subscribe') {
      const result = parseOrError(SubscribeMessageSchema, parsed);
      if (!result.ok) {
        reply(socket, { command: 'subscribe', success: false, error: result.error });
        return;
      }
      const subscription: Subscription = {};
      if (result.value.agentId !== undefined) subscription.agentId = result.value.agentId;
      if (result.value.departmentId !== undefined) subscription.departmentId = result.value.departmentId;
      hub.updateSubscription(socket, subscription);
      reply(socket, { command: 'subscribe', success: true });
      return;
    }

    try {
      if (asRecord.type === 'prompt') {
        const { agentId, text } = parsed as { agentId: string; text: string };
        const delivery = await office.prompt(agentId, text);
        reply(socket, { command: 'prompt', success: true, data: { delivery } });
        return;
      }
      if (asRecord.type === 'cancel') {
        const { agentId } = parsed as { agentId: string };
        await office.cancelRun(agentId);
        reply(socket, { command: 'cancel', success: true });
        return;
      }
      if (asRecord.type === 'start') {
        const { agentId } = parsed as { agentId: string };
        const data = await office.startRun(agentId);
        reply(socket, { command: 'start', success: true, data });
        return;
      }
      reply(socket, {
        command: String(asRecord.type ?? 'unknown'),
        success: false,
        error: { code: ERROR_CODES.validation, message: `Unsupported command "${String(asRecord.type)}"` },
      });
    } catch (error) {
      reply(socket, {
        command: String(asRecord.type ?? 'unknown'),
        success: false,
        error: toOfficeError(error),
      });
    }
  }

  function reply(socket: WebSocket, message: CommandResponse): void {
    hub.sendTo(socket, 'response', message);
  }

  return {
    office,
    hub,
    server,
    async listen(port = options.port ?? 4317, host = options.host ?? '127.0.0.1') {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, () => {
          server.removeListener('error', reject);
          resolve();
        });
      });
      const address = server.address();
      const actualPort = typeof address === 'object' && address !== null ? address.port : port;
      return { port: actualPort, url: `http://${host}:${actualPort}` };
    },
    async close() {
      // Terminate upgraded sockets explicitly: the HTTP server no longer owns
      // them, so server.close() alone would wait forever.
      for (const client of sockets.clients) client.terminate();
      await new Promise<void>((resolve) => sockets.close(() => resolve()));
      await office.flush();
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections?.();
      });
    },
  };
}

function parseError(): OfficeError {
  return { code: ERROR_CODES.validation, message: 'Message is not valid JSON' };
}

export type { SessionOutputPayload };
