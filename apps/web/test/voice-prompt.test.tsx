// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, act } from '@testing-library/react';
import { PromptInput } from '../src/components/PromptInput.js';
import { VoiceProvider } from '../src/voice/VoiceContext.js';
import { createFakeEngine, createFakeRecorder } from '../src/voice/fakes.js';
import type { SpeechToText, VoiceController } from '../src/voice/port.js';

afterEach(cleanup);

function renderPrompt(voice: VoiceController, props: Partial<Parameters<typeof PromptInput>[0]> = {}) {
  const onSubmit = props.onSubmit ?? vi.fn();
  render(
    <VoiceProvider value={voice}>
      <PromptInput {...props} onSubmit={onSubmit} />
    </VoiceProvider>,
  );
  return { onSubmit };
}

function voiceWith(overrides: Partial<VoiceController> = {}): VoiceController {
  return {
    engine: createFakeEngine(),
    recorder: createFakeRecorder(),
    // A window long enough that the tests settle the listener by hand.
    listenWindowMs: 60_000,
    ...overrides,
  };
}

async function openDraft(): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: 'Start voice prompt' }));
  fireEvent.click(screen.getByRole('button', { name: 'Stop recording' }));
  await screen.findByRole('dialog');
}

function draftField(): HTMLTextAreaElement {
  return screen.getByLabelText('Voice prompt') as HTMLTextAreaElement;
}

function promptField(): HTMLInputElement {
  return screen.getByLabelText('Prompt') as HTMLInputElement;
}

describe('voice prompt input', () => {
  it('shows recording and transcribing states before opening the modal', async () => {
    let finish: (text: string) => void = () => undefined;
    const engine: SpeechToText = {
      available: true,
      transcribe: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    };
    renderPrompt(voiceWith({ engine }));

    fireEvent.click(screen.getByRole('button', { name: 'Start voice prompt' }));
    expect(screen.getByRole('button', { name: 'Stop recording' })).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Stop recording' }));
    const transcribing = await screen.findByRole('button', { name: 'Transcribing' });
    expect((transcribing as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole('dialog')).toBeNull();

    await act(async () => finish('hello there'));
    await screen.findByRole('dialog');
    expect(draftField().value).toBe('Hello there.');
  });

  it('fills the prompt field with the cleaned text, and Send submits it', async () => {
    const engine = createFakeEngine({ transcripts: ['um hello there um', 'confirm'] });
    const recorder = createFakeRecorder();
    const { onSubmit } = renderPrompt(voiceWith({ engine, recorder }));

    await openDraft();
    expect(draftField().value).toBe('Hello there.');

    await screen.findByRole('button', { name: 'Stop listening' });
    fireEvent.click(screen.getByRole('button', { name: 'Stop listening' }));

    await waitFor(() => expect(promptField().value).toBe('Hello there.'));
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(onSubmit).toHaveBeenCalledWith('Hello there.');
  });

  it('sends the edited text when the user edits and then confirms', async () => {
    const engine = createFakeEngine({ transcripts: ['hello there', 'noise', 'confirm'] });
    const recorder = createFakeRecorder();
    const { onSubmit } = renderPrompt(voiceWith({ engine, recorder }));

    await openDraft();

    // First listen window hears something that is not the command.
    await screen.findByRole('button', { name: 'Stop listening' });
    fireEvent.click(screen.getByRole('button', { name: 'Stop listening' }));
    await screen.findByText(/Did not hear/);

    fireEvent.change(draftField(), { target: { value: 'Edited text' } });
    fireEvent.click(screen.getByRole('button', { name: 'Listen again' }));
    await screen.findByRole('button', { name: 'Stop listening' });
    fireEvent.click(screen.getByRole('button', { name: 'Stop listening' }));

    await waitFor(() => expect(promptField().value).toBe('Edited text'));
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(onSubmit).toHaveBeenCalledWith('Edited text');
  });

  it('stops the confirmation listener as soon as the user edits', async () => {
    const recorder = createFakeRecorder();
    renderPrompt(voiceWith({ recorder }));

    await openDraft();
    await screen.findByRole('button', { name: 'Stop listening' });
    const cancelsBefore = recorder.cancels;

    fireEvent.change(draftField(), { target: { value: 'Edited' } });

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Stop listening' })).toBeNull());
    expect(recorder.cancels).toBeGreaterThan(cancelsBefore);
  });

  it('sends nothing when the draft is cancelled', async () => {
    const { onSubmit } = renderPrompt(voiceWith());

    await openDraft();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(promptField().value).toBe('');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('records a prompt only once and does not reuse the confirmation clip', async () => {
    const engine = createFakeEngine({ transcripts: ['first prompt', 'confirm'] });
    const { onSubmit } = renderPrompt(voiceWith({ engine }));

    await openDraft();
    await screen.findByRole('button', { name: 'Stop listening' });
    fireEvent.click(screen.getByRole('button', { name: 'Stop listening' }));

    await waitFor(() => expect(promptField().value).toBe('First prompt.'));
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith('First prompt.');
  });
});

describe('voice prompt degraded states', () => {
  it('disables the microphone with a reason when the browser is unsupported but keeps text prompting', async () => {
    const onSubmit = vi.fn();
    renderPrompt(
      voiceWith({ engine: createFakeEngine({ available: false, reason: 'unsupported' }) }),
      { onSubmit },
    );

    const mic = screen.getByRole('button', { name: 'Start voice prompt' });
    expect((mic as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId('voice-unavailable').textContent).toMatch(/cannot record/);

    fireEvent.change(screen.getByLabelText('Prompt'), { target: { value: 'typed prompt' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(onSubmit).toHaveBeenCalledWith('typed prompt');
  });

  it('disables voice after microphone permission is denied and keeps text prompting', async () => {
    const onSubmit = vi.fn();
    renderPrompt(voiceWith({ recorder: createFakeRecorder({ denyPermission: true }) }), {
      onSubmit,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Start voice prompt' }));

    await screen.findByText(/permission was denied/i);
    expect((screen.getByRole('button', { name: 'Start voice prompt' }) as HTMLButtonElement).disabled).toBe(
      true,
    );

    fireEvent.change(screen.getByLabelText('Prompt'), { target: { value: 'typed prompt' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(onSubmit).toHaveBeenCalledWith('typed prompt');
  });

  it('surfaces a transcription failure without opening a modal and keeps text prompting', async () => {
    const onSubmit = vi.fn();
    renderPrompt(voiceWith({ engine: createFakeEngine({ failWith: 'model-unavailable' }) }), {
      onSubmit,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Start voice prompt' }));
    fireEvent.click(screen.getByRole('button', { name: 'Stop recording' }));

    await screen.findByTestId('voice-error');
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.change(screen.getByLabelText('Prompt'), { target: { value: 'typed prompt' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(onSubmit).toHaveBeenCalledWith('typed prompt');
  });

  it('disables the microphone with the no-live-session reason when prompting is disabled', () => {
    renderPrompt(voiceWith(), { disabled: true, disabledReason: 'No live session: start a run.' });

    expect(
      (screen.getByRole('button', { name: 'Start voice prompt' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(screen.getByText(/No live session/)).toBeDefined();
  });
});
