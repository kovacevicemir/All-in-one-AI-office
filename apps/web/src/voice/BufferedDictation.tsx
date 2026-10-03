import { useVoicePrompt } from './use-voice-prompt.js';
import { VoicePromptModal } from './VoicePromptModal.js';

export interface BufferedDictationProps {
  label: string;
  disabled?: boolean;
  disabledReason?: string;
  busy?: boolean;
  fieldLabel?: string;
  onText(text: string): void;
}

/**
 * Fallback dictation for browsers without a streaming speech engine: record,
 * transcribe on-device, review in a modal, then hand the text to `onText`.
 */
export function BufferedDictation({
  label,
  disabled = false,
  disabledReason,
  busy = false,
  fieldLabel,
  onText,
}: BufferedDictationProps) {
  const voice = useVoicePrompt({
    disabled,
    ...(disabledReason === undefined ? {} : { disabledReason }),
    onSubmit: onText,
  });

  const recording = voice.phase === 'listening';
  const transcribing = voice.phase === 'transcribing';
  const micDisabled = busy || transcribing || voice.unavailableReason !== null;

  return (
    <>
      <button
        type="button"
        className={recording ? 'voice-button recording' : 'voice-button'}
        aria-label={
          recording ? 'Stop recording' : transcribing ? 'Transcribing' : `Start ${label}`
        }
        title={recording ? 'Stop recording' : `Start ${label}`}
        onClick={() => (recording ? voice.stop() : voice.start())}
        disabled={micDisabled}
      >
        {recording ? 'Stop' : 'Voice'}
      </button>
      {!disabled && voice.unavailableText !== null && !voice.draftOpen ? (
        <p className="muted small" data-testid="voice-unavailable">
          {voice.unavailableText}
        </p>
      ) : null}
      {voice.error !== null && !voice.draftOpen ? (
        <p className="small" role="alert" data-testid="voice-error">
          {voice.error}
        </p>
      ) : null}
      {voice.draftOpen ? (
        <VoicePromptModal
          heading={`Confirm ${label}`}
          fieldLabel={fieldLabel ?? label.charAt(0).toUpperCase() + label.slice(1)}
          transcript={voice.transcript}
          listening={voice.listening}
          error={voice.error}
          onChange={voice.edit}
          onSend={voice.send}
          onCancel={voice.cancel}
          onReArm={voice.reArm}
          onStopListening={voice.stopListening}
        />
      ) : null}
    </>
  );
}
