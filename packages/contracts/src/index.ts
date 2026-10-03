import { z } from 'zod';

/**
 * Single source of truth for everything that crosses the runtime <-> client
 * boundary. Additive changes only; bump CONTRACT_VERSION for a breaking change.
 */
export const CONTRACT_VERSION = 1;

const Id = z.string().min(1);
const Iso = z.string().min(1);

/* ------------------------------------------------------------------ enums */

export const AgentRuntimeStateSchema = z.enum([
  'idle',
  'thinking',
  'working',
  'blocked',
  'waiting',
  'error',
  'done',
]);
export type AgentRuntimeState = z.infer<typeof AgentRuntimeStateSchema>;

export const ContextPressureLevelSchema = z.enum(['nominal', 'warning', 'critical', 'unknown']);
export type ContextPressureLevel = z.infer<typeof ContextPressureLevelSchema>;

export const TaskStatusSchema = z.enum([
  'queued',
  'blocked',
  'running',
  'done',
  'failed',
  'cancelled',
]);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const TerminalTaskStatusSchema = z.enum(['done', 'failed', 'cancelled']);
export type TerminalTaskStatus = z.infer<typeof TerminalTaskStatusSchema>;

export const RunStatusSchema = z.enum([
  'running',
  'completed',
  'failed',
  'cancelled',
  'interrupted',
]);
export type RunStatus = z.infer<typeof RunStatusSchema>;

export const SessionStatusSchema = z.enum(['starting', 'running', 'exited', 'failed']);
export type SessionStatus = z.infer<typeof SessionStatusSchema>;

export const SessionBackingSchema = z.enum(['pipe', 'pty']);
export type SessionBacking = z.infer<typeof SessionBackingSchema>;

/* ------------------------------------------------------------- primitives */

export const ModelRefSchema = z.object({
  providerId: Id,
  modelId: Id,
  options: z.record(z.string(), z.unknown()).optional(),
});
export type ModelRef = z.infer<typeof ModelRefSchema>;

/**
 * Launch-time model configuration. Never contains secrets: provider selection and
 * model id only. Secrets are applied by the harness at process launch.
 */
export const ResolvedModelSchema = z.object({
  providerId: Id,
  modelId: Id,
  provider: z.string().min(1),
  model: z.string().min(1),
});
export type ResolvedModel = z.infer<typeof ResolvedModelSchema>;

export const SessionUsageSchema = z.object({
  input: z.number(),
  output: z.number(),
  cacheRead: z.number(),
  cacheWrite: z.number(),
  total: z.number(),
  cost: z.number(),
});
export type SessionUsage = z.infer<typeof SessionUsageSchema>;

export const EMPTY_USAGE: SessionUsage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  total: 0,
  cost: 0,
};

/**
 * Percent is null when the harness has no fresh post-compaction usage yet.
 * `available: false` means "unknown", never "zero".
 */
export const ContextUsageSchema = z.object({
  tokens: z.number().nullable(),
  contextWindow: z.number().nullable(),
  percent: z.number().nullable(),
});
export type ContextUsage = z.infer<typeof ContextUsageSchema>;

export const UNKNOWN_CONTEXT_USAGE: ContextUsage = {
  tokens: null,
  contextWindow: null,
  percent: null,
};

export const TelemetrySchema = z.object({
  available: z.boolean(),
  contextUsage: ContextUsageSchema,
  usage: SessionUsageSchema,
  updatedAt: Iso,
});
export type Telemetry = z.infer<typeof TelemetrySchema>;

export const TaskResultSchema = z.object({
  status: z.enum(['done', 'failed', 'cancelled', 'interrupted']),
  output: z.string(),
  failureReason: z.string().optional(),
  usage: SessionUsageSchema.optional(),
  finishedAt: Iso,
});
export type TaskResult = z.infer<typeof TaskResultSchema>;

export const TaskOriginSchema = z.object({
  kind: z.enum(['client', 'agent']),
  agentId: z.string().optional(),
});
export type TaskOrigin = z.infer<typeof TaskOriginSchema>;

/** What one agent directed at another. `response`/`info` are reserved extensions. */
export const CommunicationKindSchema = z.enum(['request', 'handoff', 'response', 'info']);
export type CommunicationKind = z.infer<typeof CommunicationKindSchema>;

export const CommunicationStatusSchema = z.enum(['open', 'answered', 'failed', 'cancelled']);
export type CommunicationStatus = z.infer<typeof CommunicationStatusSchema>;

/**
 * One direction of work or information between two agents. Derived by the office
 * from interactions it already performs (task delegation, dependency delivery);
 * it is not a chat message and carries no model or harness content.
 */
export const AgentCommunicationSchema = z.object({
  id: Id,
  fromAgentId: Id,
  toAgentId: Id,
  kind: CommunicationKindSchema,
  status: CommunicationStatusSchema,
  summary: z.string(),
  /** The ask: the delegated task this communication is about. */
  taskId: z.string().optional(),
  /** The delivered task: the dependency whose results were handed over. */
  relatedTaskId: z.string().optional(),
  /** Anchor for the inline transcript marker, when a session exists. */
  sessionId: z.string().optional(),
  seq: z.number().optional(),
  createdAt: Iso,
  updatedAt: Iso,
});
export type AgentCommunication = z.infer<typeof AgentCommunicationSchema>;

export const HarnessCapabilitiesSchema = z.object({
  cancel: z.boolean(),
  midRunPrompt: z.boolean(),
  telemetry: z.boolean(),
  resize: z.boolean(),
  interactiveInput: z.boolean(),
});
export type HarnessCapabilities = z.infer<typeof HarnessCapabilitiesSchema>;

/* --------------------------------------------------------------- entities */

export const AgentSchema = z.object({
  id: Id,
  name: z.string().min(1),
  role: z.string().optional(),
  departmentId: z.string().optional(),
  workingDir: z.string().min(1),
  harnessId: Id,
  model: ModelRefSchema,
  systemPrompt: z.string().optional(),
  createdAt: Iso,
  updatedAt: Iso,
});
export type Agent = z.infer<typeof AgentSchema>;

export const DepartmentSchema = z.object({
  id: Id,
  name: z.string().min(1),
  createdAt: Iso,
});
export type Department = z.infer<typeof DepartmentSchema>;

/**
 * Maximum lengths for a hand-authored agent profile. The limits keep an
 * accidental paste from silently inflating the prompt cost of every run.
 */
export const AGENT_PROFILE_MAX_DESCRIPTION = 500;
export const AGENT_PROFILE_MAX_INSTRUCTIONS = 20_000;

/**
 * Per-agent identity: a short operator-facing description and free-form
 * instructions delivered to the harness. Both fields are always present;
 * unset reads as the empty string rather than a missing field.
 */
export const AgentProfileSchema = z.object({
  description: z.string().max(AGENT_PROFILE_MAX_DESCRIPTION),
  instructions: z.string().max(AGENT_PROFILE_MAX_INSTRUCTIONS),
});
export type AgentProfile = z.infer<typeof AgentProfileSchema>;

/** Full-replacement profile payload; the request and the response are identical. */
export const UpdateAgentProfileRequestSchema = AgentProfileSchema;
export type UpdateAgentProfileRequest = AgentProfile;

export const TaskSchema = z.object({
  id: Id,
  agentId: Id,
  title: z.string().min(1),
  instruction: z.string().min(1),
  status: TaskStatusSchema,
  dependsOn: z.array(Id),
  /** Queue order within the owning agent; lower runs first. */
  queuePosition: z.number(),
  origin: TaskOriginSchema,
  createdAt: Iso,
  updatedAt: Iso,
  /** Derived: dependencies that are not `done` yet. */
  blockedBy: z.array(Id).default([]),
  result: TaskResultSchema.optional(),
});
export type Task = z.infer<typeof TaskSchema>;

export const RunSchema = z.object({
  id: Id,
  agentId: Id,
  taskId: Id,
  sessionId: Id,
  status: RunStatusSchema,
  startedAt: Iso,
  finishedAt: Iso.optional(),
  failureReason: z.string().optional(),
});
export type Run = z.infer<typeof RunSchema>;

export const SessionSchema = z.object({
  id: Id,
  agentId: Id,
  taskId: Id,
  runId: Id,
  status: SessionStatusSchema,
  backing: SessionBackingSchema,
  exitCode: z.number().nullable().optional(),
  cols: z.number().optional(),
  rows: z.number().optional(),
  createdAt: Iso,
  endedAt: Iso.optional(),
  telemetry: TelemetrySchema.optional(),
});
export type Session = z.infer<typeof SessionSchema>;

/** Read model for the UI: an agent plus everything derived from its runtime. */
export const AgentViewSchema = AgentSchema.extend({
  state: AgentRuntimeStateSchema,
  activity: z.string(),
  pressure: ContextPressureLevelSchema,
  contextUsage: ContextUsageSchema.nullable(),
  currentTaskId: z.string().nullable(),
  nextTaskId: z.string().nullable(),
  waitingOn: z.array(Id),
  sessionId: z.string().nullable(),
  runId: z.string().nullable(),
});
export type AgentView = z.infer<typeof AgentViewSchema>;

export const AdapterInfoSchema = z.object({
  id: Id,
  label: z.string(),
  capabilities: HarnessCapabilitiesSchema,
});
export type AdapterInfo = z.infer<typeof AdapterInfoSchema>;

export const ProviderInfoSchema = z.object({
  id: Id,
  label: z.string(),
  models: z.array(z.string()),
});
export type ProviderInfo = z.infer<typeof ProviderInfoSchema>;

export const CapabilitiesSchema = z.object({
  harnessAdapters: z.array(AdapterInfoSchema),
  modelProviders: z.array(ProviderInfoSchema),
});
export type Capabilities = z.infer<typeof CapabilitiesSchema>;

export const PressureThresholdsSchema = z.object({
  warning: z.number().min(0).max(100),
  critical: z.number().min(0).max(100),
  hysteresis: z.number().min(0).max(100),
});
export type PressureThresholds = z.infer<typeof PressureThresholdsSchema>;

export const DEFAULT_PRESSURE_THRESHOLDS: PressureThresholds = {
  warning: 30,
  critical: 50,
  hysteresis: 5,
};

export const OfficeErrorSchema = z.object({
  code: Id,
  message: z.string(),
  details: z.record(z.string(), z.unknown()).optional(),
});
export type OfficeError = z.infer<typeof OfficeErrorSchema>;

export const ERROR_CODES = {
  validation: 'validation_error',
  notFound: 'not_found',
  conflict: 'conflict',
  unsupported: 'unsupported_capability',
  cycle: 'dependency_cycle',
  unknownAdapter: 'unknown_adapter',
  harnessUnavailable: 'harness_unavailable',
  internal: 'internal_error',
} as const;
export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/* -------------------------------------------------------------- realtime */

export const EventTypeSchema = z.enum([
  'snapshot',
  'agent.updated',
  'agent.removed',
  'department.updated',
  'department.removed',
  'task.updated',
  'task.removed',
  'run.updated',
  'session.updated',
  'session.output',
  'session.telemetry',
  'pressure.changed',
  'communication.updated',
  'error',
]);
export type EventType = z.infer<typeof EventTypeSchema>;

export const EventEnvelopeSchema = z.object({
  v: z.number(),
  seq: z.number(),
  type: z.string().min(1),
  ts: Iso,
  payload: z.unknown(),
});
export type EventEnvelope = z.infer<typeof EventEnvelopeSchema>;

export const SnapshotSchema = z.object({
  agents: z.array(AgentViewSchema),
  departments: z.array(DepartmentSchema),
  tasks: z.array(TaskSchema),
  sessions: z.array(SessionSchema),
  capabilities: CapabilitiesSchema,
  pressureThresholds: PressureThresholdsSchema,
  // Additive: older clients ignore these; a missing list parses as empty rather
  // than being coerced into fabricated entries.
  communications: z.array(AgentCommunicationSchema).default([]),
  oldestCommunicationId: z.string().nullable().default(null),
});
export type Snapshot = z.infer<typeof SnapshotSchema>;

export const SessionOutputPayloadSchema = z.object({
  sessionId: Id,
  agentId: Id,
  fromSeq: z.number(),
  chunks: z.array(z.string()),
});
export type SessionOutputPayload = z.infer<typeof SessionOutputPayloadSchema>;

export const PressureChangedPayloadSchema = z.object({
  agentId: Id,
  pressure: ContextPressureLevelSchema,
  previous: ContextPressureLevelSchema,
  percent: z.number().nullable(),
});
export type PressureChangedPayload = z.infer<typeof PressureChangedPayloadSchema>;

/* --------------------------------------------------- client -> server ops */

export const SubscribeMessageSchema = z.object({
  type: z.literal('subscribe'),
  agentId: z.string().optional(),
  departmentId: z.string().optional(),
  since: z.number().optional(),
});
export type SubscribeMessage = z.infer<typeof SubscribeMessageSchema>;

export const ClientCommandSchema = z.discriminatedUnion('type', [
  SubscribeMessageSchema,
  z.object({ type: z.literal('prompt'), agentId: Id, text: z.string().min(1) }),
  z.object({ type: z.literal('cancel'), agentId: Id }),
  z.object({ type: z.literal('start'), agentId: Id }),
]);
export type ClientCommand = z.infer<typeof ClientCommandSchema>;
/* ------------------------------------------------------------ requests */

export const CreateDepartmentRequestSchema = z.object({
  name: z.string().min(1),
  id: z.string().min(1).optional(),
});
export type CreateDepartmentRequest = z.infer<typeof CreateDepartmentRequestSchema>;

export const CreateAgentRequestSchema = z.object({
  name: z.string().min(1),
  role: z.string().optional(),
  departmentId: z.string().optional(),
  workingDir: z.string().min(1),
  harnessId: z.string().min(1),
  model: ModelRefSchema,
  systemPrompt: z.string().optional(),
});
export type CreateAgentRequest = z.infer<typeof CreateAgentRequestSchema>;

export const UpdateAgentRequestSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.string().nullable().optional(),
  departmentId: z.string().nullable().optional(),
  workingDir: z.string().min(1).optional(),
  harnessId: z.string().min(1).optional(),
  model: ModelRefSchema.optional(),
  systemPrompt: z.string().nullable().optional(),
});
export type UpdateAgentRequest = z.infer<typeof UpdateAgentRequestSchema>;

export const CreateTaskRequestSchema = z.object({
  agentId: z.string().min(1),
  title: z.string().min(1),
  instruction: z.string().min(1),
  dependsOn: z.array(z.string().min(1)).optional(),
  /** Set when an agent, rather than a client, created the task. */
  originAgentId: z.string().min(1).optional(),
});
export type CreateTaskRequest = z.infer<typeof CreateTaskRequestSchema>;

export const UpdateTaskRequestSchema = z
  .object({
    dependsOn: z.array(z.string().min(1)).optional(),
    position: z.number().int().min(0).optional(),
  })
  .refine((value) => value.dependsOn !== undefined || value.position !== undefined, {
    message: 'Provide dependsOn or position',
  });
export type UpdateTaskRequest = z.infer<typeof UpdateTaskRequestSchema>;

export const PromptRequestSchema = z.object({ text: z.string().min(1) });
export type PromptRequest = z.infer<typeof PromptRequestSchema>;

export const InputRequestSchema = z.object({ data: z.string() });
export type InputRequest = z.infer<typeof InputRequestSchema>;

export const ResizeRequestSchema = z.object({
  cols: z.number().int().positive(),
  rows: z.number().int().positive(),
});
export type ResizeRequest = z.infer<typeof ResizeRequestSchema>;

/** Payload of a `response` message (commands are acknowledged on the stream). */
export const CommandResponseSchema = z.object({
  command: z.string(),
  success: z.boolean(),
  data: z.unknown().optional(),
  error: OfficeErrorSchema.optional(),
});
export type CommandResponse = z.infer<typeof CommandResponseSchema>;

/* ------------------------------------------------------------ validation */

export {
  describeCommunication,
  type CommunicationDescription,
} from './communications.js';

export function parseOrError<T extends z.ZodType>(
  schema: T,
  value: unknown,
): { ok: true; value: z.infer<T> } | { ok: false; error: OfficeError } {
  const result = schema.safeParse(value);
  if (result.success) return { ok: true, value: result.data };
  return {
    ok: false,
    error: {
      code: ERROR_CODES.validation,
      message: 'Payload does not match the contract',
      details: {
        fields: result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      },
    },
  };
}
