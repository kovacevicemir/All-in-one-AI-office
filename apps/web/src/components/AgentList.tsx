import type { AgentView, HarnessCapabilities, Task } from '@ai-office/contracts';

export interface AgentListProps {
  agents: AgentView[];
  tasks: Task[];
  selectedAgentId: string | null;
  onSelect(agentId: string): void;
  /** Optional: highlights where the agents sit in the org. */
  departmentName?: (departmentId: string | undefined) => string | undefined;
}

function nextTaskTitle(tasks: Task[], agent: AgentView): string {
  const next = tasks.find((task) => task.id === agent.nextTaskId);
  return next?.title ?? '—';
}

/**
 * Accessible, non-3D view of the whole office. This is the primary verification
 * surface: it carries the same information as the 3D scene and works with the
 * keyboard alone.
 */
export function AgentList({
  agents,
  tasks,
  selectedAgentId,
  onSelect,
  departmentName,
}: AgentListProps) {
  if (agents.length === 0) {
    return <p className="muted">No agents yet. Create a department and an agent to get started.</p>;
  }

  return (
    <table className="agent-list" aria-label="Agents">
      <thead>
        <tr>
          <th scope="col">Agent</th>
          <th scope="col">State</th>
          <th scope="col">Doing</th>
          <th scope="col">Next task</th>
          <th scope="col">Context</th>
          <th scope="col">Waiting on</th>
          <th scope="col"><span className="sr-only">Select</span></th>
        </tr>
      </thead>
      <tbody>
        {agents.map((agent) => {
          const selected = agent.id === selectedAgentId;
          const waiting = agent.waitingOn.length;
          const department = departmentName?.(agent.departmentId);
          return (
            <tr key={agent.id} className={selected ? 'selected' : undefined}>
              <th scope="row">
                <span className="agent-name">{agent.name}</span>
                {department !== undefined ? (
                  <span className="agent-department muted small">{department}</span>
                ) : null}
              </th>
              <td>
                <span className={`badge state-${agent.state}`}>{agent.state}</span>
                {agent.pressure === 'warning' ? <span className="badge pressure-warning">complaining</span> : null}
                {agent.pressure === 'critical' ? <span className="badge pressure-critical">stressed</span> : null}
              </td>
              <td>{agent.activity}</td>
              <td>{nextTaskTitle(tasks, agent)}</td>
              <td>{agent.contextUsage?.percent != null ? `${Math.round(agent.contextUsage.percent)}%` : '—'}</td>
              <td>{waiting > 0 ? `${waiting} task${waiting === 1 ? '' : 's'}` : '—'}</td>
              <td>
                <button
                  type="button"
                  className="link"
                  aria-current={selected}
                  onClick={() => onSelect(agent.id)}
                >
                  {selected ? 'Selected' : 'Inspect'}
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function capabilitiesFor(list: HarnessCapabilities[]): HarnessCapabilities | undefined {
  return list[0];
}
