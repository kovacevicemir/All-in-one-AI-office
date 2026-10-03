// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AgentRail } from '../src/office/AgentRail.js';
import { PromptInput } from '../src/components/PromptInput.js';
import { agentView } from './fixtures.js';

afterEach(cleanup);

describe('AgentRail', () => {
  const agents = [
    agentView({ id: 'a', name: 'Ada' }),
    agentView({ id: 'b', name: 'Grace' }),
    agentView({ id: 'c', name: 'Alan' }),
  ];

  it('renders one focusable control per agent with its mood', () => {
    render(<AgentRail agents={agents} selectedAgentId="a" onSelect={() => undefined} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(3);
    expect(buttons[0]?.getAttribute('aria-pressed')).toBe('true');
    expect(buttons[0]?.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: /Grace/ }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getAllByText('Idle')).toHaveLength(3);
  });

  it('moves the selection with arrow keys, wrapping at the ends', () => {
    const onSelect = vi.fn();
    render(<AgentRail agents={agents} selectedAgentId="a" onSelect={onSelect} />);
    const first = screen.getAllByRole('button')[0] as HTMLButtonElement;

    fireEvent.keyDown(first, { key: 'ArrowDown' });
    expect(onSelect).toHaveBeenLastCalledWith('b');
    fireEvent.keyDown(first, { key: 'ArrowUp' });
    expect(onSelect).toHaveBeenLastCalledWith('c');
  });

  it('selects on click and on Enter', () => {
    const onSelect = vi.fn();
    render(<AgentRail agents={agents} selectedAgentId={null} onSelect={onSelect} />);
    const second = screen.getAllByRole('button')[1] as HTMLButtonElement;
    fireEvent.click(second);
    expect(onSelect).toHaveBeenLastCalledWith('b');
  });
});

describe('PromptInput', () => {
  it('submits trimmed text and clears the field', () => {
    const onSubmit = vi.fn();
    render(<PromptInput onSubmit={onSubmit} />);
    const input = screen.getByLabelText('Prompt');
    fireEvent.change(input, { target: { value: '  do the thing  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(onSubmit).toHaveBeenCalledWith('do the thing');
    expect((input as HTMLInputElement).value).toBe('');
  });

  it('will not submit empty or whitespace-only text', () => {
    const onSubmit = vi.fn();
    render(<PromptInput onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText('Prompt'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows the reason it is disabled instead of failing on submit', () => {
    const onSubmit = vi.fn();
    render(
      <PromptInput
        disabled
        disabledReason="This harness cannot accept prompts on a running session."
        onSubmit={onSubmit}
      />,
    );
    expect(screen.getByText(/cannot accept prompts/)).toBeDefined();
    expect((screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.submit(screen.getByLabelText('Prompt'));
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
