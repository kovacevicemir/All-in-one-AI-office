import type { Session, Task } from '@ai-office/contracts';

export interface TaskHistoryProps {
  tasks: Task[];
  sessions: Session[];
  busy: boolean;
  onViewTranscript(sessionId: string): void;
  onRerun(taskId: string): void;
}

const TERMINAL_STATUSES = new Set(['done', 'failed', 'cancelled']);
const HISTORY_LIMIT = 10;

function latestSessionFor(task: Task, sessions: Session[]): Session | undefined {
  return sessions
    .filter((session) => session.taskId === task.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

function summarize(task: Task): string {
  if (task.result?.failureReason !== undefined) return task.result.failureReason;
  const output = task.result?.output?.trim() ?? '';
  if (output.length === 0) return '—';
  const firstLine = output.split('\n').find((line) => line.trim().length > 0) ?? output;
  return firstLine.length > 90 ? `${firstLine.slice(0, 90)}…` : firstLine;
}

/**
 * Every task this agent has queued or run, newest first. Each row keeps its
 * retained transcript one click away and can be re-queued to run again.
 */
export function TaskHistory({ tasks, sessions, busy, onViewTranscript, onRerun }: TaskHistoryProps) {
  const ordered = [...tasks].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, HISTORY_LIMIT);
  if (ordered.length === 0) {
    return <p className="muted small">No tasks yet.</p>;
  }

  return (
    <ul className="task-history" aria-label="Task history">
      {ordered.map((task) => {
        const session = latestSessionFor(task, sessions);
        return (
          <li key={task.id} className="task-history-item">
            <div className="task-history-head">
              <span className="task-history-title">{task.title}</span>
              <span className={`badge state-${task.status}`}>{task.status}</span>
            </div>
            <p className="muted small task-history-summary" data-testid={`task-summary-${task.id}`}>
              {summarize(task)}
            </p>
            <div className="task-history-actions">
              <button
                type="button"
                className="link"
                disabled={session === undefined}
                onClick={() => {
                  if (session !== undefined) onViewTranscript(session.id);
                }}
              >
                Transcript
              </button>
              <button
                type="button"
                className="link"
                disabled={busy || !TERMINAL_STATUSES.has(task.status)}
                aria-label={`Run ${task.title} again`}
                onClick={() => onRerun(task.id)}
              >
                ▶ Run again
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
