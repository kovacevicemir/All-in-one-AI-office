import { useCallback, useRef, useState } from 'react';
import { DEFAULT_CONFIRM_PHRASES, cleanTranscript } from './clean.js';
import { isDraftOpen, transition, type VoicePhase } from './machine.js';
import {
  VOICE_REASON_TEXT,
  VoiceError,
  resolveUnavailableReason,
  type VoiceUnavailableReason,
} from './port.js';
import { useConfirmListener } from './use-confirm-listener.js';
import { useVoice } from './VoiceContext.js';

const DEFAULT_LISTEN_WINDOW_MS = 5000;
const NOT_HEARD = 'Did not hear the confirmation word. Listen again or send by hand.';

export interface UseVoicePromptOptions {
  disabled: boolean;
  disabledReason?: string;
  onSubmit(text: string): void;
}

export interface VoicePromptController {
  readonly phase: VoicePhase;
  readonly draftOpen: boolean;
  readonly transcript: string;
  readonly listening: boolean;
  readonly error: string | null;
  readonly unavailableReason: VoiceUnavailableReason | null;
  readonly unavailableText: string | null;
  start(): void;
  stop(): void;
  stopListening(): void;
  edit(text: string): void;
  reArm(): void;
  send(): void;
  cancel(): void;
}

interface VoicePromptState {
  phase: VoicePhase;
  transcript: string;
  error: string | null;
  listening: boolean;
  blocked: VoiceUnavailableReason | null;
  arm: number;
}

const INITIAL: VoicePromptState = {
  phase: 'idle',
  transcript: '',
  error: null,
  listening: false,
  blocked: null,
  arm: 0,
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Voice input failed.';
}

/**
 * Binds the voice-prompt state machine to the injected engine and recorder, and
 * to the prompt action. All state that matters to the UI lives here, so the
 * speech flow can be driven end to end through fakes.
 */
export function useVoicePrompt(options: UseVoicePromptOptions): VoicePromptController {
  const { disabled, disabledReason, onSubmit } = options;
  const { engine, recorder, fillerWords, confirmPhrases, listenWindowMs } = useVoice();
  const [state, setState] = useState<VoicePromptState>(INITIAL);
  const stateRef = useRef(state);
  stateRef.current = state;

  const unavailableReason = disabled
    ? 'no-session'
    : resolveUnavailableReason(engine, recorder, state.blocked);
  const unavailableText = describeUnavailable(unavailableReason, disabled, disabledReason);

  const cleanUtterance = useCallback(
    (raw: string) => cleanTranscript(raw, fillerWords === undefined ? {} : { fillers: fillerWords }),
    [fillerWords],
  );
  const commands = confirmPhrases ?? DEFAULT_CONFIRM_PHRASES;

  const failTranscription = useCallback((error: unknown) => {
    setState((prev) => ({
      ...prev,
      phase: 'idle',
      listening: false,
      error: errorMessage(error),
      blocked:
        error instanceof VoiceError && error.reason === 'model-unavailable'
          ? 'model-unavailable'
          : prev.blocked,
    }));
  }, []);

  const setListening = useCallback((listening: boolean) => {
    setState((prev) => (prev.listening === listening ? prev : { ...prev, listening }));
  }, []);

  const reportMiss = useCallback(() => {
    setState((prev) => (prev.phase === 'confirming' ? { ...prev, error: NOT_HEARD } : prev));
  }, []);

  const commit = useCallback(
    (event: 'confirm' | 'send') => {
      const text = stateRef.current.transcript.trim();
      setState((prev) => {
        const sending = transition(prev.phase, event);
        return {
          ...prev,
          phase: transition(sending, 'reset'),
          transcript: '',
          error: null,
          listening: false,
        };
      });
      if (text.length > 0) onSubmit(text);
    },
    [onSubmit],
  );

  const confirmByVoice = useCallback(() => commit('confirm'), [commit]);
  const sendByHand = useCallback(() => commit('send'), [commit]);

  const settleNow = useConfirmListener({
    active: state.phase === 'confirming',
    arm: state.arm,
    recorder,
    engine,
    clean: cleanUtterance,
    commands,
    listenWindowMs: listenWindowMs ?? DEFAULT_LISTEN_WINDOW_MS,
    submit: confirmByVoice,
    onMiss: reportMiss,
    onError: failTranscription,
    onListening: setListening,
  });

  const transcribeIntoDraft = useCallback(
    async (clip: Blob) => {
      try {
        const text = cleanUtterance(await engine.transcribe(clip));
        setState((prev) => ({
          ...prev,
          phase: transition(prev.phase, 'transcript-ready'),
          transcript: text,
          error: null,
        }));
      } catch (error) {
        failTranscription(error);
      }
    },
    [engine, cleanUtterance, failTranscription],
  );

  const start = useCallback(() => {
    if (unavailableReason !== null) return;
    setState((prev) => ({
      ...prev,
      phase: transition(prev.phase, 'start'),
      transcript: '',
      error: null,
      listening: false,
    }));
    recorder.start().catch((error: unknown) => {
      setState((prev) => ({
        ...prev,
        phase: 'cancelled',
        listening: false,
        error: errorMessage(error),
        blocked: error instanceof VoiceError ? error.reason : 'permission-denied',
      }));
    });
  }, [unavailableReason, recorder]);

  const stop = useCallback(() => {
    setState((prev) => ({ ...prev, phase: transition(prev.phase, 'stop'), listening: false }));
    void (async () => {
      let clip: Blob;
      try {
        clip = await recorder.stop();
      } catch (error) {
        failTranscription(error);
        return;
      }
      await transcribeIntoDraft(clip);
    })();
  }, [recorder, transcribeIntoDraft, failTranscription]);

  const edit = useCallback((text: string) => {
    setState((prev) => ({
      ...prev,
      transcript: text,
      phase: prev.phase === 'confirming' ? transition(prev.phase, 'edit-start') : prev.phase,
      error: null,
    }));
  }, []);

  const reArm = useCallback(() => {
    setState((prev) => ({
      ...prev,
      phase: transition(prev.phase, 're-arm'),
      arm: prev.arm + 1,
      error: null,
    }));
  }, []);

  const cancel = useCallback(() => {
    setState((prev) => ({
      ...prev,
      phase: transition(prev.phase, 'cancel'),
      transcript: '',
      error: null,
      listening: false,
    }));
  }, []);

  return {
    phase: state.phase,
    draftOpen: isDraftOpen(state.phase),
    transcript: state.transcript,
    listening: state.listening,
    error: state.error,
    unavailableReason,
    unavailableText,
    start,
    stop,
    stopListening: settleNow,
    edit,
    reArm,
    send: sendByHand,
    cancel,
  };
}

function describeUnavailable(
  reason: VoiceUnavailableReason | null,
  disabled: boolean,
  disabledReason: string | undefined,
): string | null {
  if (disabled) return disabledReason ?? VOICE_REASON_TEXT['no-session'];
  return reason === null ? null : VOICE_REASON_TEXT[reason];
}
