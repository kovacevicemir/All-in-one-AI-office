import { createStore, type StoreApi } from 'zustand/vanilla';
import type { AgentProfile } from '@ai-office/contracts';
import type { CreateAgentPayload, CreateTaskPayload, RuntimeClient } from './client.js';
import {
  INITIAL_STATE,
  applyEnvelope,
  applySnapshot,
  type OfficeUiState,
  type ViewMode,
} from './state.js';

export interface OfficeActions {
  select(agentId: string | null): void;
  setView(view: ViewMode): void;
  createDepartment(name: string): Promise<void>;
  /** Resolves true when the agent was created, so forms can react to failure. */
  createAgent(input: CreateAgentPayload): Promise<boolean>;
  /** Resolves true when the task was queued. */
  createTask(input: CreateTaskPayload): Promise<boolean>;
  start(agentId: string): Promise<void>;
  /** Re-queues a finished task and starts its agent on it. */
  rerun(agentId: string, taskId: string): Promise<void>;
  cancel(agentId: string): Promise<void>;
  /** Returns the delivery semantics the harness reported, or null on failure. */
  prompt(agentId: string, text: string): Promise<string | null>;
  /** Reads the agent's profile into the store; a failure leaves it untouched. */
  loadProfile(agentId: string): Promise<void>;
  /** Saves a profile and reports whether it was accepted. */
  saveProfile(agentId: string, profile: AgentProfile): Promise<ProfileSaveResult>;
  ensureOutput(sessionId: string): Promise<void>;
  dismissError(): void;
  dismissNotice(): void;
}

/** `ok: false` carries the message so an editor can keep the text and show why. */
export interface ProfileSaveResult {
  ok: boolean;
  error?: string;
}

export interface OfficeStoreState extends OfficeUiState, OfficeActions {
  /** sessionId -> last sequence number we hold. */
  outputSeq: Record<string, number>;
  busy: boolean;
  notice: string | null;
}

export type OfficeStore = StoreApi<OfficeStoreState> & OfficeActions;

export function createOfficeStore(client: RuntimeClient): OfficeStore {
  const store = createStore<OfficeStoreState>((set, get) => ({
    ...INITIAL_STATE,
    outputSeq: {},
    busy: false,
    notice: null,

    select(agentId) {
      set({ selectedAgentId: agentId });
      const agent = get().agents.find((candidate) => candidate.id === agentId);
      if (agent?.sessionId != null) void get().ensureOutput(agent.sessionId);
      if (agentId !== null) void get().loadProfile(agentId);
    },

    setView(view) {
      set({ view });
    },

    async createDepartment(name) {
      set({ busy: true, notice: null });
      try {
        await client.createDepartment(name);
        set({ notice: `Department "${name}" created` });
      } catch (error) {
        set({ notice: messageOf(error) });
      } finally {
        set({ busy: false });
      }
    },

    async createAgent(input) {
      set({ busy: true, notice: null });
      try {
        const agent = await client.createAgent(input);
        set({ notice: `Agent "${input.name}" created` });
        get().select(agent.id);
        return true;
      } catch (error) {
        set({ notice: messageOf(error) });
        return false;
      } finally {
        set({ busy: false });
      }
    },

    async createTask(input) {
      set({ busy: true, notice: null });
      try {
        await client.createTask(input);
        set({ notice: `Task "${input.title}" queued` });
        return true;
      } catch (error) {
        set({ notice: messageOf(error) });
        return false;
      } finally {
        set({ busy: false });
      }
    },

    async start(agentId) {
      set({ busy: true, notice: null });
      try {
        await client.start(agentId);
      } catch (error) {
        set({ notice: messageOf(error) });
      } finally {
        set({ busy: false });
      }
    },

    async rerun(agentId, taskId) {
      set({ busy: true, notice: null });
      try {
        await client.reopenTask(taskId);
        await client.start(agentId);
        set({ notice: 'Task queued to run again' });
      } catch (error) {
        set({ notice: messageOf(error) });
      } finally {
        set({ busy: false });
      }
    },

    async cancel(agentId) {
      set({ busy: true, notice: null });
      try {
        await client.cancel(agentId);
      } catch (error) {
        set({ notice: messageOf(error) });
      } finally {
        set({ busy: false });
      }
    },

    async prompt(agentId, text) {
      set({ busy: true, notice: null });
      try {
        const result = await client.prompt(agentId, text);
        set({ notice: `Prompt delivered (${result.delivery})` });
        return result.delivery;
      } catch (error) {
        set({ notice: messageOf(error) });
        return null;
      } finally {
        set({ busy: false });
      }
    },

    async loadProfile(agentId) {
      try {
        const profile = await client.fetchAgentProfile(agentId);
        set((current) => ({ profiles: { ...current.profiles, [agentId]: profile } }));
      } catch {
        // A profile that cannot be read must not break selection; the editor
        // simply keeps showing the empty default.
      }
    },

    async saveProfile(agentId, profile) {
      set({ busy: true, notice: null });
      try {
        const saved = await client.saveAgentProfile(agentId, profile);
        set((current) => ({
          profiles: { ...current.profiles, [agentId]: saved },
          notice: 'Agent profile saved',
        }));
        return { ok: true };
      } catch (error) {
        const message = messageOf(error);
        set({ notice: message });
        return { ok: false, error: message };
      } finally {
        set({ busy: false });
      }
    },

    async ensureOutput(sessionId) {
      const from = store.getState().outputSeq[sessionId] ?? 0;
      try {
        const slice = await client.fetchSessionOutput(sessionId, from);
        if (slice.chunks.length === 0) return;
        set((current) => ({
          output: {
            ...current.output,
            [sessionId]: (current.output[sessionId] ?? '') + slice.chunks.map((chunk) => chunk.data).join(''),
          },
          outputSeq: { ...current.outputSeq, [sessionId]: slice.lastSeq },
          outputChunks: {
            ...current.outputChunks,
            [sessionId]: [
              ...(current.outputChunks[sessionId] ?? []),
              ...slice.chunks.map((chunk) => ({ seq: chunk.seq, text: chunk.data })),
            ],
          },
        }));
      } catch {
        // Output backfill is best effort; live events still flow.
      }
    },

    dismissError() {
      set({ lastError: null });
    },

    dismissNotice() {
      set({ notice: null });
    },
  }));

  client.on((event) => {
    if (event.kind === 'status') {
      store.setState({ status: event.status });
      return;
    }
    if (event.kind === 'snapshot') {
      store.setState(applySnapshot(store.getState(), event.snapshot));
      for (const session of event.snapshot.sessions) {
        if (store.getState().outputSeq[session.id] === undefined) {
          void store.getState().ensureOutput(session.id);
        }
      }
      return;
    }
    if (event.kind === 'envelope') {
      const envelope = event.envelope;
      if (envelope.type === 'session.output') {
        const payload = envelope.payload as { sessionId: string; fromSeq: number; chunks: string[] };
        store.setState((current) => ({
          output: {
            ...current.output,
            [payload.sessionId]: (current.output[payload.sessionId] ?? '') + payload.chunks.join(''),
          },
          outputSeq: {
            ...current.outputSeq,
            [payload.sessionId]: payload.fromSeq + payload.chunks.length - 1,
          },
          outputChunks: {
            ...current.outputChunks,
            [payload.sessionId]: [
              ...(current.outputChunks[payload.sessionId] ?? []),
              ...payload.chunks.map((text, index) => ({ seq: payload.fromSeq + index, text })),
            ],
          },
        }));
        return;
      }
      store.setState(applyEnvelope(store.getState(), envelope));
      return;
    }
    store.setState({ lastError: event.error });
  });

  return Object.assign(store, selectActions(store.getState()));
}

function selectActions(state: OfficeStoreState): OfficeActions {
  return {
    select: state.select,
    setView: state.setView,
    createDepartment: state.createDepartment,
    createAgent: state.createAgent,
    createTask: state.createTask,
    start: state.start,
    rerun: state.rerun,
    cancel: state.cancel,
    prompt: state.prompt,
    loadProfile: state.loadProfile,
    saveProfile: state.saveProfile,
    ensureOutput: state.ensureOutput,
    dismissError: state.dismissError,
    dismissNotice: state.dismissNotice,
  };
}

function messageOf(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as { message?: unknown }).message === 'string'
  ) {
    return (error as { message: string }).message;
  }
  return 'Something went wrong';
}
