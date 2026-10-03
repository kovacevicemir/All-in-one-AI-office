// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AgentList } from '../src/components/AgentList.js';
import { agentView, department, task } from './fixtures.js';

afterEach(cleanup);

const engineering = department('Engineering');

describe('AgentList', () => {
  it('shows the state, activity, next task, context and waiting information', () => {
    const agents = [
      agentView({
        id: 'agent_1',
        name: 'Ada',
        departmentId: engineering.id,
        state: 'working',
        pressure: 'warning',
        activity: 'Working on: Ship it',
        nextTaskId: 'task_2',
        contextUsage: { tokens: 300_000, contextWindow: 1_000_000, percent: 30 },
        waitingOn: ['task_9'],
      }),
    ];
    const tasks = [
      task({ id: 'task_2', agentId: 'agent_1', title: 'Ship it' }),
      task({ id: 'task_9', agentId: 'agent_1', title: 'Blocked thing', status: 'blocked' }),
    ];

    render(
      <AgentList
        agents={agents}
        tasks={tasks}
        selectedAgentId={null}
        onSelect={() => undefined}
        departmentName={() => 'Engineering'}
      />,
    );

    expect(screen.getByText('Ada')).toBeDefined();
    expect(screen.getByText('Engineering')).toBeDefined();
    expect(screen.getByText('working')).toBeDefined();
    expect(screen.getByText('Working on: Ship it')).toBeDefined();
    expect(screen.getByText('Ship it')).toBeDefined();
    expect(screen.getByText('30%')).toBeDefined();
    expect(screen.getByText('1 task')).toBeDefined();
    expect(screen.getByText('complaining')).toBeDefined();
  });

  it('shows the department under the agent name', () => {
    render(
      <AgentList
        agents={[agentView({ id: 'agent_1', name: 'Ada', departmentId: engineering.id })]}
        tasks={[]}
        selectedAgentId={null}
        onSelect={() => undefined}
        departmentName={() => 'Engineering'}
      />,
    );
    const nameCell = screen.getByText('Ada').closest('th');
    expect(nameCell?.textContent).toContain('Engineering');
  });

  it('shows only the name when the agent belongs to no department', () => {
    render(
      <AgentList
        agents={[agentView({ id: 'agent_1', name: 'Ada' })]}
        tasks={[]}
        selectedAgentId={null}
        onSelect={() => undefined}
        departmentName={() => undefined}
      />,
    );
    expect(screen.getByText('Ada').closest('th')?.textContent).toBe('Ada');
  });

  it('is selectable with the keyboard alone', () => {
    const onSelect = vi.fn();
    render(
      <AgentList
        agents={[agentView({ id: 'agent_1', name: 'Ada' })]}
        tasks={[]}
        selectedAgentId={null}
        onSelect={onSelect}
      />,
    );

    const button = screen.getByRole('button', { name: 'Inspect' });
    button.focus();
    expect(document.activeElement).toBe(button);
    fireEvent.keyDown(button, { key: 'Enter' });
    fireEvent.click(button);
    expect(onSelect).toHaveBeenCalledWith('agent_1');
  });

  it('marks the selected agent with aria-current', () => {
    render(
      <AgentList
        agents={[agentView({ id: 'agent_1', name: 'Ada' })]}
        tasks={[]}
        selectedAgentId="agent_1"
        onSelect={() => undefined}
      />,
    );
    expect(screen.getByRole('button', { name: 'Selected' }).getAttribute('aria-current')).toBe('true');
  });

  it('explains an empty office', () => {
    render(<AgentList agents={[]} tasks={[]} selectedAgentId={null} onSelect={() => undefined} />);
    expect(screen.getByText(/No agents yet/)).toBeDefined();
  });
});
