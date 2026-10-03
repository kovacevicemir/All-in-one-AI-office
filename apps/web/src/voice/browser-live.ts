import type { LiveTranscriber, VoiceUnavailableReason } from './port.js';

/**
 * Minimal shape of the browser's Web Speech API. It is a platform capability,
 * not an npm package: `SpeechRecognition` (or `webkitSpeechRecognition` in
 * Chromium) streams partial transcripts as the user speaks.
 */
interface SpeechAlternative {
  readonly transcript: string;
}
interface SpeechResult {
  readonly isFinal: boolean;
  readonly length: number;
  readonly [index: number]: SpeechAlternative | undefined;
}
interface SpeechResultList {
  readonly length: number;
  readonly [index: number]: SpeechResult | undefined;
}
interface SpeechResultEvent {
  readonly resultIndex: number;
  readonly results: SpeechResultList;
}
interface SpeechErrorEvent {
  readonly error?: string;
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: ((event: SpeechErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function recognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const scope = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

/** True when the browser has a live speech engine. */
export function canRecognizeLive(): boolean {
  return recognitionConstructor() !== null;
}

/**
 * Live dictation through the browser's built-in speech engine.
 *
 * It emits the growing transcript on every result, so text can be shown in the
 * field while the user is still talking. Chromium may send the audio to its
 * vendor's speech service; this is the browser's engine, not the local model.
 */
export function createBrowserLiveTranscriber(): LiveTranscriber {
  const Constructor = recognitionConstructor();
  const available = Constructor !== null;
  let active: SpeechRecognitionLike | null = null;

  return {
    available,
    ...(available ? {} : { reason: 'unsupported' as VoiceUnavailableReason }),
    start(callbacks) {
      if (Constructor === null) {
        callbacks.onError('Live speech recognition is not supported in this browser.');
        return;
      }
      let finalized = '';
      const engine = new Constructor();
      active = engine;
      engine.lang = 'en-US';
      engine.continuous = true;
      engine.interimResults = true;
      engine.onresult = (event) => {
        let interim = '';
        let gotFinal = false;
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const result = event.results[i];
          if (result === undefined) continue;
          const text = result[0]?.transcript ?? '';
          if (result.isFinal) {
            finalized += text;
            gotFinal = true;
          } else {
            interim += text;
          }
        }
        callbacks.onPartial(`${finalized}${interim}`);
        if (gotFinal) callbacks.onFinal(finalized);
      };
      engine.onerror = (event) => {
        active = null;
        callbacks.onError(describeError(event.error));
      };
      engine.onend = () => {
        active = null;
      };
      engine.start();
    },
    stop() {
      active?.stop();
      active = null;
    },
  };
}

function describeError(code: string | undefined): string {
  if (code === 'not-allowed' || code === 'service-not-allowed') {
    return 'Microphone permission was denied.';
  }
  if (code === 'no-speech') return 'No speech was heard.';
  return 'Speech recognition failed.';
}
