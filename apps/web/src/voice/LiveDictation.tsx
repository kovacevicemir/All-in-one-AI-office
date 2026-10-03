import { useEffect, useRef, useState } from 'react';
import { cleanTranscript } from './clean.js';
import type { LiveTranscriber } from './port.js';

export interface LiveDictationProps {
  /** Names the target, e.g. "voice prompt" or "task instruction". */
  label: string;
  disabled: boolean;
  busy: boolean;
  /** The field's current text; dictation appends to it. */
  value: string;
  fillerWords?: readonly string[];
  onText(text: string): void;
  live: LiveTranscriber;
}

/**
 * Dictation through the browser's streaming speech engine: recognized text is
 * written into the target field as the user speaks, so they see it while
 * talking. The mic never sends anything — the field's own Send/Add button does.
 */
export function LiveDictation({
  label,
  disabled,
  busy,
  value,
  fillerWords,
  onText,
  live,
}: LiveDictationProps) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const baseRef = useRef('');
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => () => live.stop(), [live]);

  const compose = (transcript: string): string => {
    const merged = `${baseRef.current}${transcript}`;
    return cleanTranscript(merged, fillerWords === undefined ? {} : { fillers: fillerWords });
  };

  const start = (): void => {
    if (disabled || busy || !live.available) return;
    const existing = valueRef.current.trim();
    baseRef.current = existing.length > 0 ? `${existing} ` : '';
    setError(null);
    setListening(true);
    live.start({
      onPartial: (text) => onText(compose(text)),
      onFinal: (text) => onText(compose(text)),
      onError: (message) => {
        setError(message);
        setListening(false);
      },
    });
  };

  const stop = (): void => {
    live.stop();
    setListening(false);
  };

  return (
    <>
      <button
        type="button"
        className={listening ? 'voice-button recording' : 'voice-button'}
        aria-label={listening ? 'Stop recording' : `Start ${label}`}
        title={listening ? 'Stop recording' : `Start ${label}`}
        onClick={() => (listening ? stop() : start())}
        disabled={disabled || busy}
      >
        {listening ? 'Stop' : 'Voice'}
      </button>
      {error !== null ? (
        <p className="small" role="alert" data-testid="voice-error">
          {error}
        </p>
      ) : null}
    </>
  );
}
