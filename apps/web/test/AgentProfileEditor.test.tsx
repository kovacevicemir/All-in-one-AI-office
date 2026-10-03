// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AgentProfileEditor } from '../src/components/AgentProfileEditor.js';

afterEach(cleanup);

function renderEditor(overrides: Partial<Parameters<typeof AgentProfileEditor>[0]> = {}) {
  const props = {
    agentId: 'agent_1',
    profile: { description: '', instructions: '' },
    onLoad: vi.fn(),
    onSave: vi.fn(async () => ({ ok: true })),
    ...overrides,
  };
  return { props, ...render(<AgentProfileEditor {...props} />) };
}

describe('AgentProfileEditor', () => {
  it('edits and saves, then shows a success confirmation', async () => {
    const onSave = vi.fn(async () => ({ ok: true }));
    renderEditor({ onSave });

    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Tech lead' } });
    fireEvent.change(screen.getByLabelText('Instructions'), {
      target: { value: 'own the build' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));

    expect(await screen.findByTestId('profile-saved')).toBeDefined();
    expect(onSave).toHaveBeenCalledWith({ description: 'Tech lead', instructions: 'own the build' });
  });

  it('shows the error and keeps the text when a save is rejected', async () => {
    const onSave = vi.fn(async () => ({ ok: false, error: 'Description is too long' }));
    renderEditor({ onSave });

    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Too long' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));

    const error = await screen.findByTestId('profile-error');
    expect(error.textContent).toContain('Description is too long');
    expect((screen.getByLabelText('Description') as HTMLInputElement).value).toBe('Too long');
  });

  it('loads each agent’s saved profile when the selection changes', () => {
    const onLoad = vi.fn();
    const { rerender } = renderEditor({
      agentId: 'agent_1',
      profile: { description: 'Ada profile', instructions: 'ada instructions' },
      onLoad,
    });
    expect((screen.getByLabelText('Description') as HTMLInputElement).value).toBe('Ada profile');

    rerender(
      <AgentProfileEditor
        agentId="agent_2"
        profile={{ description: 'Grace profile', instructions: 'grace instructions' }}
        onLoad={onLoad}
        onSave={vi.fn(async () => ({ ok: true }))}
      />,
    );
    expect((screen.getByLabelText('Description') as HTMLInputElement).value).toBe('Grace profile');
    expect((screen.getByLabelText('Instructions') as HTMLTextAreaElement).value).toBe(
      'grace instructions',
    );
  });
});
