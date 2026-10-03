import { BufferedDictation } from './BufferedDictation.js';
import { LiveDictation } from './LiveDictation.js';
import { useVoice } from './VoiceContext.js';

export interface VoiceDictationProps {
  /** Names the target, e.g. "voice prompt" or "task instruction". */
  label: string;
  disabled?: boolean;
  disabledReason?: string;
  busy?: boolean;
  /** Label for the fallback modal's field; defaults to the capitalized `label`. */
  fieldLabel?: string;
  /** The field's current text; live dictation appends to it. */
  value?: string;
  /** Receives the dictated text. Whatever the field does with it is the caller's. */
  onText(text: string): void;
}

/**
 * Microphone control for any text field. It prefers the browser's streaming
 * engine so text appears as the user speaks, and falls back to record-then-
 * review on devices without one. It never sends; the field's own button does.
 */
export function VoiceDictation(props: VoiceDictationProps) {
  const { live, fillerWords } = useVoice();

  if (live !== undefined && live.available) {
    return (
      <LiveDictation
        label={props.label}
        disabled={props.disabled ?? false}
        busy={props.busy ?? false}
        value={props.value ?? ''}
        {...(fillerWords === undefined ? {} : { fillerWords })}
        onText={props.onText}
        live={live}
      />
    );
  }
  return <BufferedDictation {...props} />;
}
