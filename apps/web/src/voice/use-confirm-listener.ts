import { useCallback, useEffect, useRef } from 'react';
import { isConfirmation } from './clean.js';
import type { AudioRecorder, SpeechToText } from './port.js';

export interface ConfirmListenerOptions {
  /** Whether the confirmation modal is currently listening for the command. */
  readonly active: boolean;
  /** Bumped to re-arm the listener after a miss or after editing. */
  readonly arm: number;
  readonly recorder: AudioRecorder;
  readonly engine: SpeechToText;
  readonly clean: (raw: string) => string;
  readonly commands: readonly string[];
  readonly listenWindowMs: number;
  /** Called when the spoken command matched. */
  readonly submit: () => void;
  /** Called when the utterance was heard but was not the command. */
  readonly onMiss: () => void;
  readonly onError: (error: unknown) => void;
  readonly onListening: (listening: boolean) => void;
}

/**
 * Records one short window while the confirmation modal is open, transcribes it,
 * and either confirms or reports a miss. The listener is cancelled the moment its
 * `active` flag clears, so starting to edit the field stops the microphone.
 */
export function useConfirmListener(options: ConfirmListenerOptions): () => void {
  const {
    active,
    arm,
    recorder,
    engine,
    clean,
    commands,
    listenWindowMs,
    submit,
    onMiss,
    onError,
    onListening,
  } = options;
  const settleRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!active) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const settle = async (): Promise<void> => {
      if (disposed) return;
      onListening(false);
      let clip: Blob;
      try {
        clip = await recorder.stop();
      } catch {
        return;
      }
      if (disposed) return;
      try {
        const utterance = clean(await engine.transcribe(clip));
        if (disposed) return;
        if (isConfirmation(utterance, commands)) submit();
        else onMiss();
      } catch (error) {
        if (!disposed) onError(error);
      }
    };

    settleRef.current = () => {
      void settle();
    };

    void (async () => {
      try {
        await recorder.start();
      } catch {
        return;
      }
      if (disposed) {
        recorder.cancel();
        return;
      }
      onListening(true);
      timer = setTimeout(() => {
        void settle();
      }, listenWindowMs);
    })();

    return () => {
      disposed = true;
      settleRef.current = null;
      if (timer !== undefined) clearTimeout(timer);
      recorder.cancel();
      onListening(false);
    };
  }, [
    active,
    arm,
    recorder,
    engine,
    clean,
    commands,
    listenWindowMs,
    submit,
    onMiss,
    onError,
    onListening,
  ]);

  return useCallback(() => {
    settleRef.current?.();
  }, []);
}
