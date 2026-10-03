/**
 * In-memory test doubles for the voice ports.
 *
 * Used by the component tests and by the browser suite (through the
 * `VITE_VOICE_FAKE` switch) so record → transcribe → confirm can be driven
 * with no microphone, model, or network.
 */
import {
  VoiceError,
  type AudioRecorder,
  type LiveTranscriber,
  type LiveTranscriptionCallbacks,
  type SpeechToText,
  type VoiceController,
  type VoiceUnavailableReason,
} from './port.js';

export interface FakeEngine extends SpeechToText {
  /** Number of `transcribe` calls, to assert a prompt was not re-recorded. */
  readonly calls: number;
  /** Replaces the pending transcripts; the last one repeats once exhausted. */
  setTranscripts(transcripts: readonly string[]): void;
}

export interface FakeEngineOptions {
  readonly available?: boolean;
  readonly reason?: VoiceUnavailableReason;
  readonly transcripts?: readonly string[];
  /** When set, `transcribe` rejects with this reason (after `calls` counts it). */
  readonly failWith?: VoiceUnavailableReason;
}

/** A deterministic {@link SpeechToText} that replays a fixed transcript queue. */
export function createFakeEngine(options: FakeEngineOptions = {}): FakeEngine {
  let pending = [...(options.transcripts ?? [])];
  let calls = 0;

  return {
    available: options.available ?? true,
    ...(options.reason === undefined ? {} : { reason: options.reason }),
    get calls() {
      return calls;
    },
    setTranscripts(transcripts) {
      pending = [...transcripts];
    },
    async transcribe() {
      calls += 1;
      if (options.failWith !== undefined) {
        throw new VoiceError(options.failWith, `fake transcription failed: ${options.failWith}`);
      }
      return pending.length > 1 ? (pending.shift() as string) : (pending[0] ?? '');
    },
  };
}

export interface FakeRecorder extends AudioRecorder {
  readonly starts: number;
  readonly stops: number;
  readonly cancels: number;
  readonly recording: boolean;
  /** Queues the clips `stop()` hands back, in order. */
  queueClip(clip: Blob): void;
}

export interface FakeRecorderOptions {
  readonly available?: boolean;
  readonly reason?: VoiceUnavailableReason;
  /** When true, `start` rejects as if the user denied microphone permission. */
  readonly denyPermission?: boolean;
}

/** A deterministic {@link AudioRecorder} that returns queued clips. */
export function createFakeRecorder(options: FakeRecorderOptions = {}): FakeRecorder {
  const clips: Blob[] = [];
  let starts = 0;
  let stops = 0;
  let cancels = 0;
  let recording = false;

  return {
    available: options.available ?? true,
    ...(options.reason === undefined ? {} : { reason: options.reason }),
    get starts() {
      return starts;
    },
    get stops() {
      return stops;
    },
    get cancels() {
      return cancels;
    },
    get recording() {
      return recording;
    },
    queueClip(clip) {
      clips.push(clip);
    },
    async start() {
      starts += 1;
      if (options.denyPermission === true) {
        throw new VoiceError('permission-denied', 'permission denied');
      }
      recording = true;
    },
    async stop() {
      stops += 1;
      recording = false;
      return clips.shift() ?? new Blob([], { type: 'audio/webm' });
    },
    cancel() {
      cancels += 1;
      recording = false;
    },
  };
}

/**
 * A complete fake controller for the browser suite, where the app must offer a
 * working microphone without one. Live dictation is used by the UI, so it emits
 * a fixed phrase as soon as it starts; the buffered script is the fallback.
 */
export function createFakeVoice(
  transcripts: readonly string[] = ['um hello there um', 'confirm'],
): VoiceController {
  return {
    engine: createFakeEngine({ transcripts }),
    recorder: createFakeRecorder(),
    live: createFakeLiveTranscriber({ autoText: 'um hello there um' }),
    // Long enough that the browser suite settles a listener by hand.
    listenWindowMs: 60_000,
  };
}

export interface FakeLiveTranscriber extends LiveTranscriber {
  readonly starts: number;
  readonly stops: number;
  /** Emits a partial transcript to the active callbacks. */
  emitPartial(text: string): void;
  /** Emits a partial then a final transcript. */
  emit(text: string): void;
}

export interface FakeLiveOptions {
  readonly available?: boolean;
  readonly reason?: VoiceUnavailableReason;
  /** Emitted automatically on `start`, so the browser suite sees live text. */
  readonly autoText?: string;
}

/** Deterministic {@link LiveTranscriber} driven by the test. */
export function createFakeLiveTranscriber(options: FakeLiveOptions = {}): FakeLiveTranscriber {
  let starts = 0;
  let stops = 0;
  let callbacks: LiveTranscriptionCallbacks | null = null;

  return {
    available: options.available ?? true,
    ...(options.reason === undefined ? {} : { reason: options.reason }),
    get starts() {
      return starts;
    },
    get stops() {
      return stops;
    },
    start(next) {
      starts += 1;
      callbacks = next;
      if (options.autoText !== undefined) {
        const text = options.autoText;
        setTimeout(() => {
          if (callbacks === next) next.onPartial(text);
        }, 0);
      }
    },
    stop() {
      stops += 1;
      callbacks = null;
    },
    emitPartial(text) {
      callbacks?.onPartial(text);
    },
    emit(text) {
      callbacks?.onPartial(text);
      callbacks?.onFinal(text);
    },
  };
}
