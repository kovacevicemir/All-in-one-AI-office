import { useState } from 'react';
import type { Agent, AgentCommunication, Task } from '@ai-office/contracts';
import { describeCommunication } from '@ai-office/contracts';

export interface CommunicationSummaryProps {
  communication: AgentCommunication;
  agents: Agent[];
  tasks: Task[];
}

/**
 * The same summary the popover and the inspector list show, from one source
 * (`describeCommunication`), so the 3D marker, the transcript marker, and the
 * accessible list can never disagree.
 */
export function CommunicationSummary({ communication, agents, tasks }: CommunicationSummaryProps) {
  const description = describeCommunication(communication, agents, tasks);
  return (
    <span className="comm-summary">
      <strong className="comm-summary-title">{description.title}</strong>
      <span className="muted small">{description.detail}</span>
      <span className="muted small">{new Date(communication.updatedAt).toLocaleString()}</span>
    </span>
  );
}

export interface CommunicationMarkerProps extends CommunicationSummaryProps {
  /** Where the marker is drawn: inline in a transcript, or a 3D link. */
  variant?: 'transcript' | 'scene';
}

/**
 * A dashed separator with an envelope. Shows the summary on hover and on
 * keyboard focus (not hover-only), and is focusable so it is reachable without a
 * pointer.
 */
export function CommunicationMarker({
  communication,
  agents,
  tasks,
  variant = 'transcript',
}: CommunicationMarkerProps) {
  const [open, setOpen] = useState(false);
  const description = describeCommunication(communication, agents, tasks);

  return (
    <span
      className={`comm-marker comm-marker-${variant} status-${communication.status}`}
      data-testid={`comm-marker-${communication.id}`}
      role="button"
      tabIndex={0}
      aria-label={description.title}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <span className="comm-line" aria-hidden="true" />
      <span className="comm-envelope" aria-hidden="true">
        ✉
      </span>
      <span className="comm-line" aria-hidden="true" />
      {open ? (
        <span
          className="comm-popover"
          role="tooltip"
          data-testid={`comm-popover-${communication.id}`}
        >
          <CommunicationSummary communication={communication} agents={agents} tasks={tasks} />
        </span>
      ) : null}
    </span>
  );
}
