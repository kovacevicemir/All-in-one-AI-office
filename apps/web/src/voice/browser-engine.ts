/**
 * The browser speech-to-text adapter: decode the recorded clip to 16 kHz PCM on
 * the main thread, then hand it to the Whisper worker. The audio never leaves
 * the machine and is never persisted; only the model is fetched, once, and it is
 * cached by the runtime.
 */
import { createBrowserRecorder } from './browser-recorder.js';
import { createBrowserLiveTranscriber } from './browser-live.js';
import { TARGET_SAMPLE_RATE, resample } from './pcm.js';
import {
  VoiceError,
  type SpeechToText,
  type VoiceController,
  type VoiceUnavailableReason,
} from './port.js';
import type { WhisperResponse } from './whisper-protocol.js';

interface WorkerClient {
  request(audio: Float32Array): Promise<WhisperResponse>;
}

/** True when the browser can run the worker-backed engine at all. */
export function canTranscribeSpeech(): boolean {
  return typeof Worker !== 'undefined' && typeof AudioContext !== 'undefined';
}

function createWorkerClient(): WorkerClient {
  const worker = new Worker(new URL('./whisper.worker.ts', import.meta.url), { type: 'module' });
  const pending = new Map<number, (response: WhisperResponse) => void>();
  let nextId = 0;

  worker.addEventListener('message', (event: MessageEvent<WhisperResponse>) => {
    const resolve = pending.get(event.data.id);
    if (resolve === undefined) return;
    pending.delete(event.data.id);
    resolve(event.data);
  });

  return {
    request(audio) {
      const id = nextId;
      nextId += 1;
      return new Promise<WhisperResponse>((resolve) => {
        pending.set(id, resolve);
        worker.postMessage({ id, audio }, [audio.buffer as ArrayBuffer]);
      });
    },
  };
}

/** Decodes any browser-playable clip into mono PCM at {@link TARGET_SAMPLE_RATE}. */
async function decodeToPcm(clip: Blob): Promise<Float32Array> {
  const context = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE });
  try {
    const buffer = await context.decodeAudioData(await clip.arrayBuffer());
    return resample(buffer.getChannelData(0).slice(), buffer.sampleRate, TARGET_SAMPLE_RATE);
  } finally {
    await context.close();
  }
}

/** The real, on-device {@link SpeechToText} engine. */
export function createBrowserSpeechToText(): SpeechToText {
  const supported = canTranscribeSpeech();
  let client: WorkerClient | null = null;

  return {
    available: supported,
    ...(supported ? {} : { reason: 'unsupported' as VoiceUnavailableReason }),
    async transcribe(clip) {
      if (!supported) {
        throw new VoiceError('unsupported', 'Speech recognition is not supported in this browser.');
      }
      client ??= createWorkerClient();
      const response = await client.request(await decodeToPcm(clip));
      if (!response.ok) throw new VoiceError('model-unavailable', response.message);
      return response.text;
    },
  };
}

/** The browser engine and recorder as one injected controller. */
export function createBrowserVoice(): VoiceController {
  return {
    engine: createBrowserSpeechToText(),
    recorder: createBrowserRecorder(),
    live: createBrowserLiveTranscriber(),
  };
}
