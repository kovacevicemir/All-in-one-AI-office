import { VoiceError, type AudioRecorder, type VoiceUnavailableReason } from './port.js';

/** True when the browser can capture microphone audio at all. */
export function canRecordSpeech(): boolean {
  if (typeof navigator === 'undefined' || typeof MediaRecorder === 'undefined') return false;
  return navigator.mediaDevices?.getUserMedia !== undefined;
}

/**
 * Microphone capture through `MediaRecorder`. Clips are held only in memory and
 * are never written to storage or handed to the network.
 */
export function createBrowserRecorder(): AudioRecorder {
  const supported = canRecordSpeech();
  let stream: MediaStream | null = null;
  let recorder: MediaRecorder | null = null;
  let chunks: Blob[] = [];

  const release = (): void => {
    for (const track of stream?.getTracks() ?? []) track.stop();
    stream = null;
    recorder = null;
    chunks = [];
  };

  return {
    available: supported,
    ...(supported ? {} : { reason: 'unsupported' as VoiceUnavailableReason }),
    async start() {
      if (!supported) {
        throw new VoiceError('unsupported', 'Recording is not supported in this browser.');
      }
      stream = await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => {
        throw new VoiceError('permission-denied', 'Microphone permission was denied.');
      });
      chunks = [];
      recorder = new MediaRecorder(stream);
      recorder.addEventListener('dataavailable', (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      });
      recorder.start();
    },
    stop() {
      const active = recorder;
      if (active === null || active.state === 'inactive') {
        return Promise.resolve(new Blob([], { type: 'audio/webm' }));
      }
      return new Promise<Blob>((resolve) => {
        active.addEventListener(
          'stop',
          () => {
            const clip = new Blob(chunks, { type: active.mimeType || 'audio/webm' });
            release();
            resolve(clip);
          },
          { once: true },
        );
        active.stop();
      });
    },
    cancel() {
      if (recorder !== null && recorder.state !== 'inactive') recorder.stop();
      release();
    },
  };
}
