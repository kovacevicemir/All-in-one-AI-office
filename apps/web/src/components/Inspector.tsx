import { useState } from 'react';
import type {
  AgentCommunication,
  AgentProfile,
  AgentView,
  HarnessCapabilities,
  Session,
  Task,
} from '@ai-office/contracts';
import { visualForAgent } from '../office/visuals.js';
import { PromptInput } from './PromptInput.js';
import { AddTaskForm } from './AddTaskForm.js';
import { TerminalView } from './TerminalView.js';
import { TaskHistory } from './TaskHistory.js';
import { CommunicationSummary } from './CommunicationMarker.js';
import { AgentProfileEditor } from './AgentProfileEditor.js';
import { terminalTail } from '../runtime/state.js';
import type { ProfileSaveResult } from '../runtime/store.js';
import type { TranscriptTextChunk } from '../runtime/transcript.js';

export interface InspectorProps {
  agent: AgentView;
  agents: AgentView[];
  tasks: Task[];
  sessions: Session[];
  communications: AgentCommunication[];
  /** sessionId -> retained terminal text. */
  output: Record<string, string>;
  /** sessionId -> retained output with sequence boundaries. */
  outputChunks: Record<string, TranscriptTextChunk[]>;
  /** The selected agent's saved profile, once read. */
  profile: AgentProfile | undefined;
  capabilities: HarnessCapabilities | undefined;
  busy: boolean;
  onClose(): void;
  onStart(): void;
  onCancel(): void;
  onPrompt(text: string): void;
  onLoadProfile(): void;
  onSaveProfile(profile: AgentProfile): Promise<ProfileSaveResult>;
  onCreateTask(title: string, instruction: string): Promise<boolean>;
  onRerun(taskId: string): void;
}

const TAIL_LINES = 25;

function latestSessionForAgent(agentId: string, sessions: Session[]): Session | undefined {
  return [...sessions]
    .filter((session) => session.agentId === agentId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

/**
 * Click-to-inspect panel: what the agent is doing, what it will do next, how
 * much context it has burned, what it is waiting on, its last report, the
 * terminal it is driving, and the history of every task it has run.
 */
export function Inspector({
  agent,
  agents,
  tasks,
  sessions,
  communications,
  output,
  outputChunks,
  profile,
  capabilities,
  busy,
  onClose,
  onStart,
  onCancel,
  onPrompt,
  onLoadProfile,
  onSaveProfile,
  onCreateTask,
  onRerun,
}: InspectorProps) {
  const [showTerminal, setShowTerminal] = useState(false);
  const [transcriptSessionId, setTranscriptSessionId] = useState<string | null>(null);

  const visual = visualForAgent(agent);
  const nextTask = tasks.find((task) => task.id === agent.nextTaskId);
  const currentTask = tasks.find((task) => task.id === agent.currentTaskId);
  const waitingOn = tasks.filter((task) => agent.waitingOn.includes(task.id));
  const lastReport = tasks
    .filter((task) => task.result !== undefined)
    .sort((a, b) => (b.result?.finishedAt ?? '').localeCompare(a.result?.finishedAt ?? ''))[0];

  const liveSession =
    agent.sessionId === null ? undefined : sessions.find((session) => session.id === agent.sessionId);
  // After a run ends the agent drops its session id, so fall back to the most
  // recent session it ever had. The transcript is retained, not lost.
  const displaySession = liveSession ?? latestSessionForAgent(agent.id, sessions);
  const displayOutput = displaySession !== undefined ? (output[displaySession.id] ?? '') : '';
  const sessionCommunications =
    displaySession === undefined
      ? []
      : communications.filter((event) => event.sessionId === displaySession.id);
  const agentCommunications = communications.filter(
    (event) => event.fromAgentId === agent.id || event.toAgentId === agent.id,
  );
  const transcriptSession =
    transcriptSessionId === null
      ? undefined
      : sessions.find((session) => session.id === transcriptSessionId);

  const isRunning = liveSession?.status === 'running' || liveSession?.status === 'starting';
  const canPrompt = capabilities?.midRunPrompt === true;
  const promptDisabled = !isRunning || !canPrompt;
  const promptReason = !isRunning
    ? 'No live session: start a run to prompt this agent.'
    : !canPrompt
      ? 'This harness cannot accept prompts on a running session.'
      : undefined;

  if (transcriptSession !== undefined) {
    const taskTitle = tasks.find((task) => task.id === transcriptSession.taskId)?.title;
    return (
      <TerminalView
        title={taskTitle !== undefined ? `${agent.name} · ${taskTitle}` : agent.name}
        text={output[transcriptSession.id] ?? ''}
        chunks={outputChunks[transcriptSession.id] ?? []}
        communications={communications.filter((event) => event.sessionId === transcriptSession.id)}
        agents={agents}
        tasks={tasks}
        onClose={() => setTranscriptSessionId(null)}
      />
    );
  }

  if (showTerminal) {
    return (
      <TerminalView
        title={agent.name}
        text={displayOutput}
        chunks={displaySession !== undefined ? (outputChunks[displaySession.id] ?? []) : []}
        communications={sessionCommunications}
        agents={agents}
        tasks={tasks}
        onClose={() => setShowTerminal(false)}
      />
    );
  }

  return (
    <aside className="inspector" aria-label={`Inspector for ${agent.name}`}>
      <header>
        <div>
          <h2>{agent.name}</h2>
          <p className="muted small">
            {agent.role ?? 'Agent'} · {agent.workingDir}
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close inspector">
          ✕
        </button>
      </header>

      <dl className="facts">
        <dt>State</dt>
        <dd>
          <span className={`badge state-${agent.state}`}>{agent.state}</span>
        </dd>

        <dt>Doing</dt>
        <dd data-testid="agent-activity">{agent.activity}</dd>

        <dt>Current task</dt>
        <dd>{currentTask?.title ?? '—'}</dd>

        <dt>Next task</dt>
        <dd data-testid="agent-next-task">{nextTask?.title ?? '—'}</dd>

        <dt>Context</dt>
        <dd>
          <span data-testid="agent-context">
            {agent.contextUsage?.percent != null
              ? `${Math.round(agent.contextUsage.percent)}% of ${formatTokens(agent.contextUsage.contextWindow)}`
              : 'unavailable'}
          </span>{' '}
          <span className={`badge pressure-${agent.pressure}`} data-testid="agent-pressure">
            {visual.mood === 'complaining' || visual.mood === 'stressed' ? visual.mood : agent.pressure}
          </span>
        </dd>

        <dt>Waiting on</dt>
        <dd data-testid="agent-waiting">
          {waitingOn.length === 0
            ? '—'
            : waitingOn.map((task) => `${task.title} (${task.status})`).join(', ')}
        </dd>

        <dt>Harness</dt>
        <dd>
          {agent.harnessId} · {agent.model.providerId}/{agent.model.modelId}
        </dd>
      </dl>

      <AgentProfileEditor
        agentId={agent.id}
        profile={profile}
        onLoad={onLoadProfile}
        onSave={onSaveProfile}
      />

      <section className="actions">
        <button
          type="button"
          onClick={onStart}
          disabled={busy || isRunning || agent.nextTaskId === null}
        >
          Start next task
        </button>
        <button type="button" onClick={onCancel} disabled={busy || !isRunning}>
          Cancel run
        </button>
      </section>

      {agent.nextTaskId === null && !isRunning ? (
        <p className="muted small">
          {agent.waitingOn.length > 0
            ? 'Nothing to start: every remaining task is blocked by an unfinished dependency.'
            : 'Nothing to start: this agent has no task queued yet.'}
        </p>
      ) : null}

      <AddTaskForm agentName={agent.name} busy={busy} onCreateTask={onCreateTask} />

      <section aria-label="Terminal tail">
        <header className="subheader">
          <h3>Terminal</h3>
          <button type="button" className="link" onClick={() => setShowTerminal(true)}>
            Open full terminal
          </button>
        </header>
        <pre className="terminal-tail" data-testid="terminal-tail">
          {displayOutput.length > 0 ? terminalTail(displayOutput, TAIL_LINES) : 'No terminal session yet.\n'}
        </pre>
      </section>

      <section aria-label="Last report">
        <h3>Last report</h3>
        {lastReport?.result !== undefined ? (
          <div className="report" data-testid="agent-last-report">
            <p className="muted small">
              {lastReport.title} · {lastReport.result.status}
              {lastReport.result.failureReason !== undefined
                ? ` · ${lastReport.result.failureReason}`
                : ''}
            </p>
            <pre>{lastReport.result.output}</pre>
          </div>
        ) : (
          <p className="muted small">No completed task yet.</p>
        )}
      </section>

      <section aria-label="Task history">
        <h3>Task history</h3>
        <TaskHistory
          tasks={tasks.filter((task) => task.agentId === agent.id)}
          sessions={sessions}
          busy={busy}
          onViewTranscript={(sessionId) => setTranscriptSessionId(sessionId)}
          onRerun={onRerun}
        />
      </section>

      <section aria-label="Communications">
        <h3>Communications</h3>
        {agentCommunications.length === 0 ? (
          <p className="muted small">No inter-agent communications yet.</p>
        ) : (
          <ul className="comm-list">
            {agentCommunications.map((event) => (
              <li
                key={event.id}
                className={`comm-list-item status-${event.status}`}
                data-testid={`comm-list-item-${event.id}`}
              >
                <CommunicationSummary communication={event} agents={agents} tasks={tasks} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <PromptInput
        disabled={promptDisabled}
        {...(promptReason !== undefined ? { disabledReason: promptReason } : {})}
        busy={busy}
        onSubmit={onPrompt}
      />
    </aside>
  );
}

function formatTokens(value: number | null): string {
  if (value === null) return 'context';
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M tokens`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}K tokens`;
  return `${value} tokens`;
}
