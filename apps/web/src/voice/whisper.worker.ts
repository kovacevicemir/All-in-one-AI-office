/**
 * On-device Whisper transcription.
 *
 * Runs in a Web Worker so recording and the UI stay responsive. The model is
 * initialized on first use, not at app load, and its bytes are cached in browser
 * storage, so later transcriptions work offline. Audio arrives as PCM already
 * captured on the device and is never sent anywhere.
 */
import type { AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers';
import type { WhisperRequest, WhisperResponse } from './whisper-protocol.js';

/** Small English model: the default trade-off of size against accuracy. */
const MODEL_ID = 'Xenova/whisper-tiny.en';

const workerScope = self as unknown as { postMessage(message: WhisperResponse): void };

let transcriber: Promise<AutomaticSpeechRecognitionPipeline> | null = null;

function hasWebGpu(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator;
}

/** WebGPU when the browser offers it, falling back to WASM if it is unusable. */
async function createTranscriber(): Promise<AutomaticSpeechRecognitionPipeline> {
  const { pipeline } = await import('@huggingface/transformers');
  if (hasWebGpu()) {
    try {
      return await pipeline('automatic-speech-recognition', MODEL_ID, { device: 'webgpu' });
    } catch {
      // The adapter exists but could not be used; retry on the CPU path below.
    }
  }
  return pipeline('automatic-speech-recognition', MODEL_ID, { device: 'wasm' });
}

async function loadTranscriber(): Promise<AutomaticSpeechRecognitionPipeline> {
  transcriber ??= createTranscriber().catch((error: unknown) => {
    // Do not cache a failed load; the next attempt may succeed.
    transcriber = null;
    throw error;
  });
  return transcriber;
}

async function transcribe(request: WhisperRequest): Promise<string> {
  const pipe = await loadTranscriber();
  // whisper-tiny.en is English-only; passing `language`/`task` makes it throw.
  const output = await pipe(request.audio);
  return Array.isArray(output) ? (output[0]?.text ?? '') : output.text;
}

self.addEventListener('message', (event: MessageEvent<WhisperRequest>) => {
  const request = event.data;
  void transcribe(request)
    .then((text) => workerScope.postMessage({ id: request.id, ok: true, text }))
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'Transcription failed.';
      workerScope.postMessage({ id: request.id, ok: false, message });
    });
});
