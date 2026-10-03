// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AddTaskForm } from '../src/components/AddTaskForm.js';
import { PromptInput } from '../src/components/PromptInput.js';
import { VoiceProvider } from '../src/voice/VoiceContext.js';
import {
  createFakeEngine,
  createFakeLiveTranscriber,
  createFakeRecorder,
  type FakeLiveTranscriber,
} from '../src/voice/fakes.js';
import type { VoiceController } from '../src/voice/port.js';

afterEach(cleanup);

function liveVoice(): { voice: VoiceController; live: FakeLiveTranscriber } {
  const live = createFakeLiveTranscriber();
  return { voice: { engine: createFakeEngine(), recorder: createFakeRecorder(), live }, live };
}

function promptField(): HTMLInputElement {
  return screen.getByLabelText('Prompt') as HTMLInputElement;
}

function instructionField(): HTMLTextAreaElement {
  return screen.getByLabelText('Task instruction') as HTMLTextAreaElement;
}

describe('live voice dictation', () => {
  it('writes recognized text into the prompt field while recording', async () => {
    const { voice, live } = liveVoice();
    render(
      <VoiceProvider value={voice}>
        <PromptInput onSubmit={vi.fn()} />
      </VoiceProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Start voice prompt' }));
    expect(screen.getByRole('button', { name: 'Stop recording' })).toBeDefined();

    await act(async () => live.emitPartial('um hello'));
    expect(promptField().value).toBe('Hello.');

    await act(async () => live.emit('um hello there um'));
    expect(promptField().value).toBe('Hello there.');
  });

  it('appends dictation to existing text and submits with Send', async () => {
    const { voice, live } = liveVoice();
    const onSubmit = vi.fn();
    render(
      <VoiceProvider value={voice}>
        <PromptInput onSubmit={onSubmit} />
      </VoiceProvider>,
    );

    fireEvent.change(promptField(), { target: { value: 'Please' } });
    fireEvent.click(screen.getByRole('button', { name: 'Start voice prompt' }));
    await act(async () => live.emit('run the tests'));
    fireEvent.click(screen.getByRole('button', { name: 'Stop recording' }));

    expect(promptField().value).toBe('Please run the tests.');
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(onSubmit).toHaveBeenCalledWith('Please run the tests.');
  });

  it('fills the task instruction as the user speaks, without a live run', async () => {
    const { voice, live } = liveVoice();
    render(
      <VoiceProvider value={voice}>
        <AddTaskForm agentName="Ada" onCreateTask={vi.fn(async () => true)} />
      </VoiceProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Start task instruction' }));
    await act(async () => live.emit('um add integration tests um'));

    await waitFor(() => expect(instructionField().value).toBe('Add integration tests.'));
  });
});
