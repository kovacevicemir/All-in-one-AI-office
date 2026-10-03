/**
 * Speech-to-text and audio-capture ports for the web prompt UI.
 *
 * Both are deliberately tiny so the UI and the confirmation flow can be tested
 * with fakes — no microphone, model, or network — and so no speech-vendor
 * specific leaks into the call site.
 */

/** Why voice cannot be used, in the order the UI should report it. */
export type VoiceUnavailableReason =
  | 'no-session'
  | 'unsupported'
  | 'permission-denied'
  | 'model-unavailable';

/** Turns a recorded clip into text. The browser adapter runs Whisper on-device. */
export interface SpeechToText {
  readonly available: boolean;
  /** Set when {@link available} is false, so the UI can explain why. */
  readonly reason?: VoiceUnavailableReason;
  transcribe(audio: Blob): Promise<string>;
}

/** Captures microphone audio and hands it back as an in-memory clip. */
export interface AudioRecorder {
  readonly available: boolean;
  /** Set when {@link available} is false, so the UI can explain why. */
  readonly reason?: VoiceUnavailableReason;
  start(): Promise<void>;
  /** Ends recording and returns the captured audio. Never touches storage. */
  stop(): Promise<Blob>;
  /** Ends recording and discards the audio, for cancelling a listener. */
  cancel(): void;
}

/** Callbacks a {@link LiveTranscriber} fires while the user is speaking. */
export interface LiveTranscriptionCallbacks {
  /**
   * Fired as speech is recognized: the full transcript so far, including the
   * still-being-refined tail, so a field can show text while the user talks.
   */
  onPartial(text: string): void;
  /** Fired when a chunk is finalized: the full transcript so far. */
  onFinal(text: string): void;
  onError(message: string): void;
}

/**
 * Streaming speech recognition, backed by the browser's own engine when it has
 * one. It emits text continuously, so dictation can appear as the user speaks
 * instead of only after recording stops.
 */
export interface LiveTranscriber {
  readonly available: boolean;
  readonly reason?: VoiceUnavailableReason;
  start(callbacks: LiveTranscriptionCallbacks): void;
  stop(): void;
}

/** Everything the prompt UI needs to offer voice, injected as one value. */
export interface VoiceController {
  readonly engine: SpeechToText;
  readonly recorder: AudioRecorder;
  /** Streaming engine; used for live dictation when the browser supports it. */
  readonly live?: LiveTranscriber;
  /** Replaces the built-in filler list when provided. */
  readonly fillerWords?: readonly string[];
  /** Replaces the default `confirm` words when provided. */
  readonly confirmPhrases?: readonly string[];
  /** How long the confirmation listener records before settling, in ms. */
  readonly listenWindowMs?: number;
}

/** A rejection that carries a reason the UI can show without parsing prose. */
export class VoiceError extends Error {
  readonly reason: VoiceUnavailableReason;

  constructor(reason: VoiceUnavailableReason, message: string) {
    super(message);
    this.name = 'VoiceError';
    this.reason = reason;
  }
}

/** Human-facing explanation for each reason voice can be unavailable. */
export const VOICE_REASON_TEXT: Record<VoiceUnavailableReason, string> = {
  'no-session': 'No live session: start a run to prompt this agent.',
  unsupported: 'This browser cannot record or transcribe speech.',
  'permission-denied': 'Microphone permission was denied.',
  'model-unavailable': 'The speech model could not be loaded.',
};

/** The first reason that makes voice unusable, or null when it is ready. */
export function resolveUnavailableReason(
  engine: SpeechToText,
  recorder: AudioRecorder,
  blocked: VoiceUnavailableReason | null,
): VoiceUnavailableReason | null {
  if (blocked !== null) return blocked;
  if (!recorder.available) return recorder.reason ?? 'unsupported';
  if (!engine.available) return engine.reason ?? 'unsupported';
  return null;
}

/** A controller whose engine and recorder are both unavailable. */
export function createUnavailableVoice(
  reason: VoiceUnavailableReason = 'unsupported',
): VoiceController {
  return {
    engine: {
      available: false,
      reason,
      transcribe: async () => {
        throw new VoiceError(reason, 'speech-to-text is unavailable');
      },
    },
    recorder: {
      available: false,
      reason,
      start: async () => {
        throw new VoiceError(reason, 'the microphone is unavailable');
      },
      stop: async () => {
        throw new VoiceError(reason, 'the microphone is unavailable');
      },
      cancel: () => undefined,
    },
  };
}
