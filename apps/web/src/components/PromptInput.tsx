export interface PromptInputProps {
  disabled?: boolean;
  disabledReason?: string;
  busy?: boolean;
  placeholder?: string;
  onSubmit(text: string): void;
}

import { useState, type FormEvent } from 'react';
import { VoiceDictation } from '../voice/VoiceDictation.js';

/**
 * Prompts the agent's live session. Disabled with an explicit reason when the
 * harness cannot accept mid-run input, rather than failing on submit. When
 * speech is available, a microphone records a prompt that must be confirmed in
 * a review modal before it is sent.
 */
export function PromptInput({
  disabled = false,
  disabledReason,
  busy = false,
  placeholder = 'Send a prompt to this session…',
  onSubmit,
}: PromptInputProps) {
  const [text, setText] = useState('');

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    const trimmed = text.trim();
    if (trimmed.length === 0 || disabled) return;
    onSubmit(trimmed);
    setText('');
  };

  return (
    <form className="prompt-input" onSubmit={submit}>
      <label className="sr-only" htmlFor="prompt-text">
        Prompt
      </label>
      <input
        id="prompt-text"
        value={text}
        placeholder={disabled ? (disabledReason ?? 'Unavailable') : placeholder}
        disabled={disabled || busy}
        onChange={(event) => setText(event.target.value)}
      />
      <button type="submit" disabled={disabled || busy || text.trim().length === 0}>
        Send
      </button>
      <VoiceDictation
        label="voice prompt"
        disabled={disabled}
        {...(disabledReason === undefined ? {} : { disabledReason })}
        busy={busy}
        value={text}
        onText={setText}
      />
      {disabled && disabledReason !== undefined ? (
        <p className="muted small">{disabledReason}</p>
      ) : null}
    </form>
  );
}
