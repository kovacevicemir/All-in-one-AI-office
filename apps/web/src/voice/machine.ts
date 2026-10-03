/**
 * The voice-prompt state machine, kept as a pure transition table so every path
 * can be unit-tested without a recorder or a model.
 *
 * Speech never goes straight to an agent: the only way to reach `sending` is
 * through `confirming` (directly or via `editing`), so a mis-transcription can
 * never become a mis-send.
 */

export type VoicePhase =
  | 'idle'
  | 'listening'
  | 'transcribing'
  | 'confirming'
  | 'editing'
  | 'sending'
  | 'cancelled';

export type VoiceEvent =
  | 'start'
  | 'stop'
  | 'transcript-ready'
  | 'edit-start'
  | 're-arm'
  | 'confirm'
  | 'send'
  | 'cancel'
  | 'reset';

const TRANSITIONS: Record<VoicePhase, Partial<Record<VoiceEvent, VoicePhase>>> = {
  idle: { start: 'listening', cancel: 'cancelled' },
  listening: { stop: 'transcribing', cancel: 'cancelled' },
  transcribing: { 'transcript-ready': 'confirming', cancel: 'cancelled' },
  confirming: {
    'edit-start': 'editing',
    're-arm': 'confirming',
    confirm: 'sending',
    cancel: 'cancelled',
  },
  editing: { 're-arm': 'confirming', send: 'sending', cancel: 'cancelled' },
  sending: { reset: 'idle' },
  cancelled: { start: 'listening', reset: 'idle' },
};

/** The phase after `event`, or the same phase when the event is a no-op. */
export function transition(phase: VoicePhase, event: VoiceEvent): VoicePhase {
  return TRANSITIONS[phase][event] ?? phase;
}

/** True while the confirmation draft is open (editable or listening). */
export function isDraftOpen(phase: VoicePhase): boolean {
  return phase === 'confirming' || phase === 'editing' || phase === 'sending';
}
