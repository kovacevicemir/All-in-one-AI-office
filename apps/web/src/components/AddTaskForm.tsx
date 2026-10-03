import { useState, type FormEvent } from 'react';

export interface AddTaskFormProps {
  agentName: string;
  busy?: boolean;
  /** Resolves true when the task was queued, so the form knows to reset. */
  onCreateTask(title: string, instruction: string): Promise<boolean>;
}

/**
 * Queues work for an agent. Without this the inspector can show a next task but
 * a freshly created agent has none, so "Start next task" can only fail.
 */
export function AddTaskForm({ agentName, busy = false, onCreateTask }: AddTaskFormProps) {
  const [title, setTitle] = useState('');
  const [instruction, setInstruction] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (title.trim().length === 0) {
      setProblem('Give the task a title.');
      return;
    }
    if (instruction.trim().length === 0) {
      setProblem('Write the exact instruction to send to the agent.');
      return;
    }

    setProblem(null);
    const created = await onCreateTask(title.trim(), instruction.trim());
    if (created) {
      setTitle('');
      setInstruction('');
    }
  };

  return (
    <section aria-label="Queue a task">
      <h3>Queue a task</h3>
      <form
        className="task-form"
        onSubmit={(event) => {
          void submit(event);
        }}
      >
        <label className="sr-only" htmlFor="task-title">
          Task title
        </label>
        <input
          id="task-title"
          value={title}
          placeholder="Short title, e.g. Add integration tests"
          onChange={(event) => setTitle(event.target.value)}
        />
        <label className="sr-only" htmlFor="task-instruction">
          Task instruction
        </label>
        <textarea
          id="task-instruction"
          rows={3}
          value={instruction}
          placeholder={`Sent to ${agentName} verbatim, exactly as you would type it in a terminal.`}
          onChange={(event) => setInstruction(event.target.value)}
        />
        <button type="submit" disabled={busy}>
          Add to queue
        </button>
      </form>
      {problem !== null ? (
        <p className="notice error" role="alert">
          {problem}
        </p>
      ) : null}
    </section>
  );
}
