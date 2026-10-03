import { useMemo, useState, type FormEvent } from 'react';
import type { Capabilities } from '@ai-office/contracts';

export interface AdminPanelProps {
  capabilities: Capabilities;
  busy: boolean;
  defaultWorkingDir: string;
  onCreateDepartment(name: string): void;
  /** Resolves true when the agent was created, so the form knows to reset. */
  onCreateAgent(input: {
    name: string;
    workingDir: string;
    harnessId: string;
    model: { providerId: string; modelId: string };
  }): Promise<boolean>;
}

interface ModelOption {
  value: string;
  label: string;
  providerId: string;
  modelId: string;
}

/**
 * Minimal way to staff the office from the UI. It reads the live capability
 * listing, so a harness or model added to the runtime appears here with no UI
 * change.
 *
 * Capabilities arrive asynchronously (they come from the runtime snapshot), so
 * the selected harness and model are *derived* from the current listing rather
 * than copied into state on mount. Copying would freeze the empty initial value
 * and silently break submission.
 */
export function AdminPanel({
  capabilities,
  busy,
  defaultWorkingDir,
  onCreateDepartment,
  onCreateAgent,
}: AdminPanelProps) {
  const [departmentName, setDepartmentName] = useState('');
  const [name, setName] = useState('');
  const [workingDir, setWorkingDir] = useState(defaultWorkingDir);
  const [harnessChoice, setHarnessChoice] = useState('');
  const [modelChoice, setModelChoice] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  const harnesses = capabilities.harnessAdapters;
  const modelOptions = useMemo<ModelOption[]>(
    () =>
      capabilities.modelProviders.flatMap((provider) =>
        provider.models.map((model) => ({
          value: `${provider.id}:${model}`,
          label: `${provider.label} · ${model}`,
          providerId: provider.id,
          modelId: model,
        })),
      ),
    [capabilities.modelProviders],
  );

  const harnessId = harnesses.some((harness) => harness.id === harnessChoice)
    ? harnessChoice
    : (harnesses[0]?.id ?? '');
  const modelRef = modelOptions.some((option) => option.value === modelChoice)
    ? modelChoice
    : (modelOptions[0]?.value ?? '');

  const connected = harnesses.length > 0 && modelOptions.length > 0;

  const submitDepartment = (event: FormEvent): void => {
    event.preventDefault();
    if (departmentName.trim().length === 0) {
      setProblem('Give the department a name.');
      return;
    }
    setProblem(null);
    onCreateDepartment(departmentName.trim());
    setDepartmentName('');
  };

  const submitAgent = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    const trimmedName = name.trim();
    const trimmedDir = workingDir.trim();

    // Every rejection says what to fix. A form that silently does nothing is a bug.
    if (trimmedName.length === 0) {
      setProblem('Give the agent a name.');
      return;
    }
    if (trimmedDir.length === 0) {
      setProblem('Set the working directory to the project this agent should work in.');
      return;
    }
    if (!connected) {
      setProblem('The runtime has no harness or model available. Is it running?');
      return;
    }

    setProblem(null);
    const created = await onCreateAgent({
      name: trimmedName,
      workingDir: trimmedDir,
      harnessId,
      model: { providerId: modelRef.split(':')[0] ?? '', modelId: modelRef.split(':')[1] ?? '' },
    });
    if (created) setName('');
  };

  return (
    <details className="admin">
      <summary>Staff the office</summary>

      {!connected ? (
        <p className="muted small">Waiting for the runtime to report its harnesses and models…</p>
      ) : null}

      <form onSubmit={submitDepartment} className="row">
        <label htmlFor="department-name">New department</label>
        <input
          id="department-name"
          value={departmentName}
          onChange={(event) => setDepartmentName(event.target.value)}
          placeholder="Engineering"
        />
        <button type="submit" disabled={busy}>
          Add department
        </button>
      </form>

      <form
        onSubmit={(event) => {
          void submitAgent(event);
        }}
        className="row"
      >
        <label htmlFor="agent-name">New agent</label>
        <input
          id="agent-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Ada"
        />
        <label htmlFor="agent-dir">Working directory</label>
        <input
          id="agent-dir"
          value={workingDir}
          onChange={(event) => setWorkingDir(event.target.value)}
          placeholder="C:\path\to\project"
        />
        <label htmlFor="agent-harness">Harness</label>
        <select
          id="agent-harness"
          value={harnessId}
          onChange={(event) => setHarnessChoice(event.target.value)}
        >
          {harnesses.map((harness) => (
            <option key={harness.id} value={harness.id}>
              {harness.label}
            </option>
          ))}
        </select>
        <label htmlFor="agent-model">Model</label>
        <select
          id="agent-model"
          value={modelRef}
          onChange={(event) => setModelChoice(event.target.value)}
        >
          {modelOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <button type="submit" disabled={busy || !connected}>
          Add agent
        </button>
      </form>

      {problem !== null ? (
        <p className="notice error" role="alert">
          {problem}
        </p>
      ) : null}
    </details>
  );
}
