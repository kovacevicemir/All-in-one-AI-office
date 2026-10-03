import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  CreateAgentRequestSchema,
  CreateDepartmentRequestSchema,
  CreateTaskRequestSchema,
  ERROR_CODES,
  InputRequestSchema,
  PromptRequestSchema,
  ResizeRequestSchema,
  UpdateAgentProfileRequestSchema,
  UpdateAgentRequestSchema,
  UpdateTaskRequestSchema,
  parseOrError,
  type OfficeError,
} from '@ai-office/contracts';
import { OfficeFailure, type Office } from '@ai-office/core';

const STATUS_BY_CODE: Record<string, number> = {
  [ERROR_CODES.validation]: 400,
  [ERROR_CODES.cycle]: 400,
  [ERROR_CODES.unknownAdapter]: 400,
  [ERROR_CODES.notFound]: 404,
  [ERROR_CODES.conflict]: 409,
  [ERROR_CODES.unsupported]: 422,
  [ERROR_CODES.harnessUnavailable]: 503,
  [ERROR_CODES.internal]: 500,
};

interface Route {
  method: string;
  segments: string[];
  handler: (context: RouteContext) => Promise<unknown> | unknown;
}

export interface RouteContext {
  params: Record<string, string>;
  query: URLSearchParams;
  body: unknown;
  req: IncomingMessage;
}

export interface HttpResponse {
  status?: number;
  body?: unknown;
  empty?: boolean;
}

export function createHttpHandler(office: Office): (req: IncomingMessage, res: ServerResponse) => void {
  const routes: Route[] = [
    { method: 'GET', segments: ['api', 'health'], handler: () => ({ ok: true }) },
    { method: 'GET', segments: ['api', 'capabilities'], handler: () => office.capabilities() },
    { method: 'GET', segments: ['api', 'snapshot'], handler: () => office.snapshot() },

    { method: 'GET', segments: ['api', 'departments'], handler: () => office.listDepartments() },
    {
      method: 'POST',
      segments: ['api', 'departments'],
      handler: ({ body }) => {
        const parsed = parseOrError(CreateDepartmentRequestSchema, body);
        if (!parsed.ok) throw parsed.error;
        return { status: 201, body: office.createDepartment(parsed.value.name) };
      },
    },
    {
      method: 'PATCH',
      segments: ['api', 'departments', ':id'],
      handler: ({ params, body }) => {
        const parsed = parseOrError(CreateDepartmentRequestSchema, body);
        if (!parsed.ok) throw parsed.error;
        return office.renameDepartment(params.id as string, parsed.value.name);
      },
    },
    {
      method: 'DELETE',
      segments: ['api', 'departments', ':id'],
      handler: ({ params }) => {
        office.deleteDepartment(params.id as string);
        return { empty: true, status: 204 };
      },
    },

    { method: 'GET', segments: ['api', 'agents'], handler: () => office.listAgents() },
    {
      method: 'POST',
      segments: ['api', 'agents'],
      handler: async ({ body }) => {
        const parsed = parseOrError(CreateAgentRequestSchema, body);
        if (!parsed.ok) throw parsed.error;
        return { status: 201, body: await office.createAgent(parsed.value) };
      },
    },
    { method: 'GET', segments: ['api', 'agents', ':id'], handler: ({ params }) => office.getAgent(params.id as string) },
    {
      method: 'GET',
      segments: ['api', 'agents', ':id', 'profile'],
      handler: async ({ params }) => await office.getAgentProfile(params.id as string),
    },
    {
      method: 'PUT',
      segments: ['api', 'agents', ':id', 'profile'],
      handler: async ({ params, body }) => {
        const parsed = parseOrError(UpdateAgentProfileRequestSchema, body);
        if (!parsed.ok) throw parsed.error;
        return await office.setAgentProfile(params.id as string, parsed.value);
      },
    },
    {
      method: 'PATCH',
      segments: ['api', 'agents', ':id'],
      handler: ({ params, body }) => {
        const parsed = parseOrError(UpdateAgentRequestSchema, body);
        if (!parsed.ok) throw parsed.error;
        return office.updateAgent(params.id as string, parsed.value);
      },
    },
    {
      method: 'DELETE',
      segments: ['api', 'agents', ':id'],
      handler: ({ params }) => {
        office.deleteAgent(params.id as string);
        return { empty: true, status: 204 };
      },
    },
    {
      method: 'POST',
      segments: ['api', 'agents', ':id', 'run'],
      handler: async ({ params }) => await office.startRun(params.id as string),
    },
    {
      method: 'POST',
      segments: ['api', 'agents', ':id', 'cancel'],
      handler: async ({ params }) => {
        await office.cancelRun(params.id as string);
        return { cancelled: true };
      },
    },
    {
      method: 'POST',
      segments: ['api', 'agents', ':id', 'prompt'],
      handler: async ({ params, body }) => {
        const parsed = parseOrError(PromptRequestSchema, body);
        if (!parsed.ok) throw parsed.error;
        return { delivery: await office.prompt(params.id as string, parsed.value.text) };
      },
    },
    {
      method: 'POST',
      segments: ['api', 'agents', ':id', 'input'],
      handler: ({ params, body }) => {
        const parsed = parseOrError(InputRequestSchema, body);
        if (!parsed.ok) throw parsed.error;
        office.writeInput(params.id as string, parsed.value.data);
        return { written: true };
      },
    },
    {
      method: 'POST',
      segments: ['api', 'agents', ':id', 'resize'],
      handler: ({ params, body }) => {
        const parsed = parseOrError(ResizeRequestSchema, body);
        if (!parsed.ok) throw parsed.error;
        office.resize(params.id as string, parsed.value.cols, parsed.value.rows);
        return { resized: true };
      },
    },

    {
      method: 'GET',
      segments: ['api', 'tasks'],
      handler: ({ query }) => office.listTasks(query.get('agentId') ?? undefined),
    },
    {
      method: 'POST',
      segments: ['api', 'tasks'],
      handler: ({ body }) => {
        const parsed = parseOrError(CreateTaskRequestSchema, body);
        if (!parsed.ok) throw parsed.error;
        const task = office.createTask({
          agentId: parsed.value.agentId,
          title: parsed.value.title,
          instruction: parsed.value.instruction,
          ...(parsed.value.dependsOn !== undefined ? { dependsOn: parsed.value.dependsOn } : {}),
          origin:
            parsed.value.originAgentId !== undefined
              ? { kind: 'agent', agentId: parsed.value.originAgentId }
              : { kind: 'client' },
        });
        return { status: 201, body: task };
      },
    },
    { method: 'GET', segments: ['api', 'tasks', ':id'], handler: ({ params }) => office.getTask(params.id as string) },
    {
      method: 'PATCH',
      segments: ['api', 'tasks', ':id'],
      handler: ({ params, body }) => {
        const parsed = parseOrError(UpdateTaskRequestSchema, body);
        if (!parsed.ok) throw parsed.error;
        const id = params.id as string;
        if (parsed.value.dependsOn !== undefined) office.setTaskDependencies(id, parsed.value.dependsOn);
        if (parsed.value.position !== undefined) office.reorderTask(id, parsed.value.position);
        return office.getTask(id);
      },
    },
    {
      method: 'DELETE',
      segments: ['api', 'tasks', ':id'],
      handler: ({ params }) => {
        office.deleteTask(params.id as string);
        return { empty: true, status: 204 };
      },
    },

    {
      method: 'POST',
      segments: ['api', 'tasks', ':id', 'reopen'],
      handler: ({ params }) => office.reopenTask(params.id as string),
    },

    { method: 'GET', segments: ['api', 'sessions'], handler: () => office.listSessions() },
    { method: 'GET', segments: ['api', 'runs'], handler: () => office.listRuns() },
    {
      method: 'GET',
      segments: ['api', 'communications'],
      handler: ({ query }) => office.listCommunications(query.get('agentId') ?? undefined),
    },
    {
      method: 'GET',
      segments: ['api', 'sessions', ':id'],
      handler: ({ params }) => office.getSession(params.id as string),
    },
    {
      method: 'GET',
      segments: ['api', 'sessions', ':id', 'output'],
      handler: ({ params, query }) =>
        office.sessionOutput(params.id as string, Number(query.get('fromSeq') ?? '0')),
    },
    {
      method: 'GET',
      segments: ['api', 'sessions', ':id', 'telemetry'],
      handler: ({ params }) => office.sessionTelemetry(params.id as string),
    },
  ];

  return (req, res) => {
    void handle(req, res, routes).catch((error: unknown) => {
      sendError(res, toOfficeError(error));
    });
  };
}

async function handle(req: IncomingMessage, res: ServerResponse, routes: Route[]): Promise<void> {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.writeHead(204).end();
    return;
  }

  const url = new URL(req.url ?? '/', 'http://localhost');
  const segments = url.pathname.split('/').filter((segment) => segment.length > 0);

  for (const route of routes) {
    if (route.method !== req.method) continue;
    const params = matchSegments(route.segments, segments);
    if (params === null) continue;

    const body = req.method === 'GET' || req.method === 'DELETE' ? undefined : await readJson(req);
    const result = (await route.handler({ params, query: url.searchParams, body, req })) as
      | HttpResponse
      | unknown;

    if (isHttpResponse(result)) {
      if (result.empty === true) {
        res.writeHead(result.status ?? 204).end();
        return;
      }
      sendJson(res, result.status ?? 200, result.body ?? null);
      return;
    }
    sendJson(res, 200, result ?? null);
    return;
  }

  sendJson(res, 404, {
    code: ERROR_CODES.notFound,
    message: `No route for ${req.method ?? 'GET'} ${url.pathname}`,
  } satisfies OfficeError);
}

function matchSegments(pattern: string[], actual: string[]): Record<string, string> | null {
  if (pattern.length !== actual.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < pattern.length; i += 1) {
    const expected = pattern[i] as string;
    const value = actual[i] as string;
    if (expected.startsWith(':')) params[expected.slice(1)] = decodeURIComponent(value);
    else if (expected !== value) return null;
  }
  return params;
}

function isHttpResponse(value: unknown): value is HttpResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    ('status' in value || 'empty' in value || 'body' in value) &&
    !('id' in value)
  );
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  if (chunks.length === 0) return undefined;
  const text = Buffer.concat(chunks).toString('utf8').trim();
  if (text.length === 0) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new OfficeFailure(ERROR_CODES.validation, 'Request body is not valid JSON');
  }
}

function setCors(res: ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(text);
}

function sendError(res: ServerResponse, error: OfficeError): void {
  sendJson(res, STATUS_BY_CODE[error.code] ?? 500, error);
}

export function toOfficeError(error: unknown): OfficeError {
  if (error instanceof OfficeFailure) {
    return {
      code: error.code,
      message: error.message,
      ...(error.details !== undefined ? { details: error.details } : {}),
    };
  }
  if (isOfficeError(error)) return error;
  return { code: ERROR_CODES.internal, message: (error as Error)?.message ?? 'Internal error' };
}

function isOfficeError(value: unknown): value is OfficeError {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { code?: unknown }).code === 'string' &&
    typeof (value as { message?: unknown }).message === 'string'
  );
}
