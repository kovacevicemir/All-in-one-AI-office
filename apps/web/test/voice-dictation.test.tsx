// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AddTaskForm } from '../src/components/AddTaskForm.js';
import { VoiceProvider } from '../src/voice/VoiceContext.js';
import { createFakeEngine, createFakeRecorder } from '../src/voice/fakes.js';
import type { VoiceController } from '../src/voice/port.js';

afterEach(cleanup);

function voiceWith(overrides: Partial<VoiceController> = {}): VoiceController {
  return {
    engine: createFakeEngine(),
    recorder: createFakeRecorder(),
    // Long enough that the tests settle the confirmation listener by hand.
    listenWindowMs: 60_000,
    ...overrides,
  };
}

function renderForm(voice: VoiceController, onCreateTask = vi.fn(async () => true)) {
  render(
    <VoiceProvider value={voice}>
      <AddTaskForm agentName="Ada" busy={false} onCreateTask={onCreateTask} />
    </VoiceProvider>,
  );
  return { onCreateTask };
}

function instruction(): HTMLTextAreaElement {
  return screen.getByLabelText('Task instruction') as HTMLTextAreaElement;
}

describe('task voice dictation', () => {
  it('fills the instruction from a confirmed recording without a live session', async () => {
    const engine = createFakeEngine({ transcripts: ['um add integration tests um', 'confirm'] });
    const { onCreateTask } = renderForm(voiceWith({ engine }));

    fireEvent.click(screen.getByRole('button', { name: 'Start task instruction' }));
    fireEvent.click(screen.getByRole('button', { name: 'Stop recording' }));
    await screen.findByRole('dialog', { name: 'Confirm task instruction' });
    expect(instruction().value).toBe('');

    await screen.findByRole('button', { name: 'Stop listening' });
    fireEvent.click(screen.getByRole('button', { name: 'Stop listening' }));

    await waitFor(() => expect(instruction().value).toBe('Add integration tests.'));
    expect(onCreateTask).not.toHaveBeenCalled();
  });

  it('fills the edited text when the user edits and sends by hand', async () => {
    renderForm(voiceWith({ engine: createFakeEngine({ transcripts: ['draft instruction'] }) }));

    fireEvent.click(screen.getByRole('button', { name: 'Start task instruction' }));
    fireEvent.click(screen.getByRole('button', { name: 'Stop recording' }));
    const field = await screen.findByLabelText('Dictated instruction');
    fireEvent.change(field, { target: { value: 'edited instruction' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(instruction().value).toBe('edited instruction'));
  });

  it('leaves the instruction unchanged when the dictation is cancelled', async () => {
    renderForm(voiceWith({ engine: createFakeEngine({ transcripts: ['discard me'] }) }));

    fireEvent.change(instruction(), { target: { value: 'keep me' } });
    fireEvent.click(screen.getByRole('button', { name: 'Start task instruction' }));
    fireEvent.click(screen.getByRole('button', { name: 'Stop recording' }));
    await screen.findByRole('dialog', { name: 'Confirm task instruction' });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(instruction().value).toBe('keep me');
  });

  it('disables the microphone with a reason but still queues a typed task', async () => {
    const onCreateTask = vi.fn(async () => true);
    renderForm(
      voiceWith({ engine: createFakeEngine({ available: false, reason: 'unsupported' }) }),
      onCreateTask,
    );

    expect(
      (screen.getByRole('button', { name: 'Start task instruction' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(screen.getByTestId('voice-unavailable').textContent).toMatch(/cannot record/);

    fireEvent.change(screen.getByLabelText('Task title'), { target: { value: 'Ship it' } });
    fireEvent.change(instruction(), { target: { value: 'do the thing' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add to queue' }));

    await waitFor(() => expect(onCreateTask).toHaveBeenCalledWith('Ship it', 'do the thing'));
  });
});
