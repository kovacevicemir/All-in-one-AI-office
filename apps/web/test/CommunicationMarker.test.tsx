// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TerminalView } from '../src/components/TerminalView.js';
import { agentView, communication, task } from './fixtures.js';

afterEach(cleanup);

const ada = agentView({ id: 'agent_1', name: 'Ada' });
const grace = agentView({ id: 'agent_2', name: 'Grace' });
const parserTask = task({ id: 'task_1', agentId: 'agent_2', title: 'Write the parser' });

const chunks = [
  { seq: 1, text: 'before\n' },
  { seq: 2, text: 'after\n' },
];

const anchored = communication({
  id: 'comm_1',
  seq: 2,
  sessionId: 'session_1',
  fromAgentId: 'agent_1',
  toAgentId: 'agent_2',
  taskId: 'task_1',
  summary: 'Ada → Grace: Write the parser',
});

describe('inline transcript marker', () => {
  it('renders the marker between the right chunks', () => {
    render(
      <TerminalView
        title="Ada"
        text="before\nafter\n"
        chunks={chunks}
        communications={[anchored]}
        agents={[ada, grace]}
        tasks={[parserTask]}
        onClose={() => undefined}
      />,
    );
    const pre = screen.getByTestId('terminal-scrollback');
    const classes = [...pre.children].map((child) => child.className);
    expect(classes[0]).toContain('transcript-text');
    expect(classes[1]).toContain('comm-marker');
    expect(classes[2]).toContain('transcript-text');
    expect(screen.getByTestId('comm-marker-comm_1')).toBeDefined();
  });

  it('leaves the transcript unchanged when no communications apply', () => {
    render(
      <TerminalView
        title="Ada"
        text="before\nafter\n"
        chunks={chunks}
        communications={[]}
        agents={[ada, grace]}
        tasks={[parserTask]}
        onClose={() => undefined}
      />,
    );
    const pre = screen.getByTestId('terminal-scrollback');
    expect(screen.queryByTestId('comm-marker-comm_1')).toBeNull();
    expect(pre.textContent).toBe('before\nafter\n');
  });
});

function renderMarker() {
  render(
    <TerminalView
      title="Ada"
      text="before\nafter\n"
      chunks={chunks}
      communications={[anchored]}
      agents={[ada, grace]}
      tasks={[parserTask]}
      onClose={() => undefined}
    />,
  );
  return screen.getByTestId('comm-marker-comm_1');
}

describe('communication summary popover', () => {
  it('shows direction, ask, status and time on hover', () => {
    const marker = renderMarker();
    expect(screen.queryByTestId('comm-popover-comm_1')).toBeNull();

    fireEvent.mouseEnter(marker);
    const popover = screen.getByTestId('comm-popover-comm_1');
    expect(popover.textContent).toContain('Ada → Grace: Write the parser');
    expect(popover.textContent).toContain('Request · open');
    expect(popover.textContent).toContain('2026');
  });

  it('shows the same summary on keyboard focus, not only on hover', () => {
    const marker = renderMarker();
    fireEvent.focus(marker);
    expect(screen.getByTestId('comm-popover-comm_1').textContent).toContain(
      'Ada → Grace: Write the parser',
    );
    fireEvent.blur(marker);
    expect(screen.queryByTestId('comm-popover-comm_1')).toBeNull();
  });

  it('discloses a missing reference instead of inventing a name', () => {
    const orphan = communication({
      id: 'comm_orphan',
      seq: 1,
      sessionId: 'session_1',
      fromAgentId: 'agent_gone',
      toAgentId: 'agent_also_gone',
      taskId: 'task_gone',
    });
    render(
      <TerminalView
        title="Ada"
        text="only\n"
        chunks={[{ seq: 1, text: 'only\n' }]}
        communications={[orphan]}
        agents={[]}
        tasks={[]}
        onClose={() => undefined}
      />,
    );
    fireEvent.focus(screen.getByTestId('comm-marker-comm_orphan'));
    const popover = screen.getByTestId('comm-popover-comm_orphan');
    expect(popover.textContent).toContain('Unknown agent (agent_gone)');
    expect(popover.textContent).toContain('Unknown task (task_gone)');
  });
});
