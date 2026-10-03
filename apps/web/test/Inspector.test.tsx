// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { HarnessCapabilities } from '@ai-office/contracts';
import { Inspector } from '../src/components/Inspector.js';
import { agentView, communication, session, task } from './fixtures.js';

afterEach(cleanup);

const capabilities: HarnessCapabilities = {
  cancel: true,
  midRunPrompt: true,
  telemetry: true,
  resize: false,
  interactiveInput: false,
};

function renderInspector(overrides: Partial<Parameters<typeof Inspector>[0]> = {}) {
  const props = {
    agent: agentView({ id: 'agent_1', name: 'Ada', sessionId: 'session_1', state: 'working' }),
    agents: [agentView({ id: 'agent_1', name: 'Ada' })],
    tasks: [] as ReturnType<typeof task>[],
    sessions: [session({ id: 'session_1', agentId: 'agent_1' })],
    communications: [],
    output: { session_1: 'line one\nline two\n' } as Record<string, string>,
    outputChunks: {},
    profile: { description: '', instructions: '' },
    capabilities,
    busy: false,
    onClose: vi.fn(),
    onStart: vi.fn(),
    onCancel: vi.fn(),
    onPrompt: vi.fn(),
    onLoadProfile: vi.fn(),
    onSaveProfile: vi.fn(async () => ({ ok: true })),
    onCreateTask: vi.fn(async () => true),
    onRerun: vi.fn(),
    ...overrides,
  };
  return { props, ...render(<Inspector {...props} />) };
}

describe('Inspector', () => {
  it('shows activity, next task, pressure and the live terminal tail', () => {
    renderInspector({
      agent: agentView({
        id: 'agent_1',
        name: 'Ada',
        state: 'working',
        pressure: 'critical',
        activity: 'Working on: Ship it',
        nextTaskId: 'task_2',
        contextUsage: { tokens: 500_000, contextWindow: 1_000_000, percent: 50 },
      }),
      tasks: [task({ id: 'task_2', agentId: 'agent_1', title: 'Ship it' })],
    });

    expect(screen.getByTestId('agent-activity').textContent).toBe('Working on: Ship it');
    expect(screen.getByTestId('agent-next-task').textContent).toBe('Ship it');
    expect(screen.getByTestId('agent-context').textContent).toContain('50%');
    expect(screen.getByTestId('agent-pressure').textContent).toBe('stressed');
    expect(screen.getByTestId('terminal-tail').textContent).toContain('line two');
  });

  it('lists what the agent is waiting on', () => {
    renderInspector({
      agent: agentView({ id: 'agent_1', name: 'Ada', state: 'waiting', waitingOn: ['task_9'] }),
      tasks: [task({ id: 'task_9', agentId: 'agent_1', title: 'Base', status: 'running' })],
    });
    expect(screen.getByTestId('agent-waiting').textContent).toContain('Base (running)');
  });

  it('shows the last completed report', () => {
    renderInspector({
      tasks: [
        task({
          id: 'task_1',
          agentId: 'agent_1',
          title: 'First',
          status: 'done',
          result: { status: 'done', output: 'all good', finishedAt: '2026-01-02T00:00:00.000Z' },
        }),
      ],
    });
    expect(screen.getByTestId('agent-last-report').textContent).toContain('all good');
  });

  it('opens the full terminal with the retained scrollback and a way back', () => {
    renderInspector({ output: { session_1: 'first\nsecond\n' } });

    fireEvent.click(screen.getByRole('button', { name: 'Open full terminal' }));
    expect(screen.getByTestId('terminal-scrollback').textContent).toContain('first');

    fireEvent.click(screen.getByRole('button', { name: 'Back to office' }));
    expect(screen.getByTestId('terminal-tail')).toBeDefined();
  });

  it('disables prompting when there is no live session, with a reason', () => {
    renderInspector({
      agent: agentView({ id: 'agent_1', name: 'Ada', sessionId: null, state: 'idle' }),
      sessions: [],
    });

    const input = screen.getByLabelText('Prompt');
    expect((input as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText(/No live session/)).toBeDefined();
  });

  it('explains when the harness cannot accept mid-run prompts', () => {
    renderInspector({
      capabilities: { ...capabilities, midRunPrompt: false },
    });
    expect((screen.getByLabelText('Prompt') as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText(/cannot accept prompts/)).toBeDefined();
  });

  it('sends a prompt and a cancel action to the callbacks', () => {
    const onPrompt = vi.fn();
    const onCancel = vi.fn();
    renderInspector({ onPrompt, onCancel });

    fireEvent.change(screen.getByLabelText('Prompt'), { target: { value: 'also update docs' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(onPrompt).toHaveBeenCalledWith('also update docs');

    fireEvent.click(screen.getByRole('button', { name: 'Cancel run' }));
    expect(onCancel).toHaveBeenCalled();
  });

  it('cannot start a run while one is already live', () => {
    renderInspector({});
    expect((screen.getByRole('button', { name: 'Start next task' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('closes on request', () => {
    const onClose = vi.fn();
    renderInspector({ onClose });
    fireEvent.click(screen.getByLabelText('Close inspector'));
    expect(onClose).toHaveBeenCalled();
  });

  it('keeps the last session transcript visible after a run ends', () => {
    renderInspector({
      agent: agentView({ id: 'agent_1', name: 'Ada', sessionId: null, state: 'done' }),
      sessions: [session({ id: 'session_1', agentId: 'agent_1', status: 'exited' })],
      output: { session_1: 'wrote xox.html\ndone\n' },
    });
    expect(screen.getByTestId('terminal-tail').textContent).toContain('wrote xox.html');
  });

  it('lists task history with a re-run action per finished task', () => {
    const onRerun = vi.fn();
    renderInspector({
      tasks: [
        task({
          id: 'task_done',
          agentId: 'agent_1',
          title: 'Old job',
          status: 'done',
          result: { status: 'done', output: 'did it', finishedAt: '2026-01-03T00:00:00.000Z' },
        }),
      ],
      sessions: [session({ id: 'session_1', agentId: 'agent_1', taskId: 'task_done' })],
      onRerun,
    });

    expect(screen.getByRole('list', { name: 'Task history' })).toBeDefined();
    expect(screen.getByTestId('task-summary-task_done').textContent).toContain('did it');
    fireEvent.click(screen.getByRole('button', { name: 'Run Old job again' }));
    expect(onRerun).toHaveBeenCalledWith('task_done');
  });

  it('caps the task history at the ten most recent tasks', () => {
    const tasks = Array.from({ length: 14 }, (_, index) =>
      task({
        id: `task_${index}`,
        agentId: 'agent_1',
        title: `Job ${index}`,
        createdAt: `2026-01-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
      }),
    );
    renderInspector({ tasks, sessions: [] });

    expect(screen.getAllByRole('listitem')).toHaveLength(10);
    expect(screen.getByText('Job 13')).toBeDefined();
    expect(screen.queryByText('Job 3')).toBeNull();
  });

  it('opens a finished task transcript from history', () => {
    renderInspector({
      agent: agentView({ id: 'agent_1', name: 'Ada', sessionId: null, state: 'done' }),
      tasks: [task({ id: 'task_done', agentId: 'agent_1', title: 'Old job', status: 'done' })],
      sessions: [
        session({ id: 'session_9', agentId: 'agent_1', taskId: 'task_done', status: 'exited' }),
      ],
      output: { session_1: 'live', session_9: '[write] xox.html\nconsole.log(1)' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Transcript' }));
    expect(screen.getByTestId('terminal-scrollback').textContent).toContain('console.log(1)');
  });

  it('lists inter-agent communications with direction, ask, status and time', () => {
    renderInspector({
      agent: agentView({ id: 'agent_1', name: 'Ada' }),
      agents: [agentView({ id: 'agent_1', name: 'Ada' }), agentView({ id: 'agent_2', name: 'Grace' })],
      tasks: [task({ id: 'task_1', agentId: 'agent_2', title: 'Write the parser' })],
      communications: [
        communication({
          id: 'comm_req_1',
          fromAgentId: 'agent_1',
          toAgentId: 'agent_2',
          taskId: 'task_1',
        }),
      ],
    });

    const item = screen.getByTestId('comm-list-item-comm_req_1');
    expect(item.textContent).toContain('Ada → Grace: Write the parser');
    expect(item.textContent).toContain('Request · open');
    expect(item.textContent).toContain('2026');
  });

  it('says so when there are no communications', () => {
    renderInspector({});
    expect(screen.getByText(/No inter-agent communications yet/)).toBeDefined();
  });
});
