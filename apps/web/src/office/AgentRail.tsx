import type { AgentView } from '@ai-office/contracts';
import { visualForAgent } from './visuals.js';

export interface AgentRailProps {
  agents: AgentView[];
  selectedAgentId: string | null;
  onSelect(agentId: string): void;
}

/**
 * Keyboard-accessible mirror of the scene. Arrow keys move the selection, so
 * the 3D view is never the only way to reach a bot.
 */
export function AgentRail({ agents, selectedAgentId, onSelect }: AgentRailProps) {
  const select = (index: number): void => {
    const agent = agents[index];
    if (agent !== undefined) onSelect(agent.id);
  };

  return (
    <ul className="agent-rail" aria-label="Agents in the office">
      {agents.map((agent, index) => {
        const visual = visualForAgent(agent);
        const selected = agent.id === selectedAgentId;
        return (
          <li key={agent.id}>
            <button
              type="button"
              className="rail-item"
              aria-pressed={selected}
              style={{ borderColor: visual.tint }}
              onClick={() => onSelect(agent.id)}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  select((index + 1) % agents.length);
                } else if (event.key === 'ArrowUp') {
                  event.preventDefault();
                  select((index - 1 + agents.length) % agents.length);
                }
              }}
            >
              <span className="dot" style={{ background: visual.tint }} aria-hidden="true" />
              <span className="rail-name">{agent.name}</span>
              <span className="rail-mood">
                {visual.indicator ?? visual.label}
                {agent.contextUsage?.percent != null
                  ? ` ${Math.round(agent.contextUsage.percent)}%`
                  : ''}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
