import { useId } from 'react';

export interface VoicePromptModalProps {
  /** The cleaned transcript, editable before committing. */
  transcript: string;
  /** Whether the confirmation listener is currently recording. */
  listening: boolean;
  error: string | null;
  /** Modal heading and accessible name; defaults to the prompt wording. */
  heading?: string;
  /** Label of the text field, e.g. "Voice prompt" or "Task instruction". */
  fieldLabel?: string;
  onChange(text: string): void;
  onSend(): void;
  onCancel(): void;
  onReArm(): void;
  onStopListening(): void;
}

/**
 * Review step for dictated text. Nothing is committed until the user sends by
 * voice or by hand, and a pointer Cancel is always available so a failed
 * microphone can never strand the draft.
 */
export function VoicePromptModal({
  transcript,
  listening,
  error,
  heading = 'Confirm voice prompt',
  fieldLabel = 'Voice prompt',
  onChange,
  onSend,
  onCancel,
  onReArm,
  onStopListening,
}: VoicePromptModalProps) {
  const fieldId = useId();

  return (
    <div className="voice-modal-backdrop">
      <div className="voice-modal" role="dialog" aria-modal="true" aria-label={heading}>
        <h2>{heading}</h2>
        <label className="sr-only" htmlFor={fieldId}>
          {fieldLabel}
        </label>
        <textarea
          id={fieldId}
          value={transcript}
          onChange={(event) => onChange(event.target.value)}
          onFocus={() => onChange(transcript)}
          rows={3}
        />
        {listening ? (
          <p className="muted small" data-testid="voice-listening">
            Listening for confirmation…
          </p>
        ) : null}
        {error !== null ? (
          <p className="small" role="alert">
            {error}
          </p>
        ) : null}
        <div className="voice-modal-actions">
          <button type="button" onClick={onSend} disabled={transcript.trim().length === 0}>
            Send
          </button>
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          {listening ? (
            <button type="button" onClick={onStopListening}>
              Stop listening
            </button>
          ) : (
            <button type="button" onClick={onReArm}>
              Listen again
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
