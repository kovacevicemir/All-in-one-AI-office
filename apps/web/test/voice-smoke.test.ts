import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { cleanTranscript } from '../src/voice/clean.js';
import { TARGET_SAMPLE_RATE, resample } from '../src/voice/pcm.js';

/**
 * Opt-in smoke test for the real, on-device Whisper model.
 *
 * Skipped unless `AI_OFFICE_VOICE_SMOKE=1`, so `npm test` never downloads a
 * model or runs inference. It transcribes a checked-in clip with the same model
 * the browser engine uses and asserts the cleaned transcript is non-empty.
 *
 * Run it locally with:
 *   AI_OFFICE_VOICE_SMOKE=1 npm run test:group -- voice-smoke
 */
const ENABLED = process.env.AI_OFFICE_VOICE_SMOKE === '1';
const suite = ENABLED ? describe : describe.skip;
/** Hard cap for this opt-in group, matching `MAX_TEST_TIMEOUT_MS`. */
const TIMEOUT_MS = 40_000;
const MODEL_ID = 'Xenova/whisper-tiny.en';

interface DecodedAudio {
  samples: Float32Array;
  sampleRate: number;
}

function decodeWavPcm16(bytes: Buffer): DecodedAudio {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const channels = view.getUint16(22, true);
  const sampleRate = view.getUint32(24, true);
  const dataOffset = bytes.indexOf('data', 12, 'ascii') + 8;
  const frameCount = Math.floor((bytes.length - dataOffset) / (channels * 2));
  const samples = new Float32Array(frameCount);

  for (let frame = 0; frame < frameCount; frame += 1) {
    let sum = 0;
    for (let channel = 0; channel < channels; channel += 1) {
      sum += view.getInt16(dataOffset + (frame * channels + channel) * 2, true) / 32768;
    }
    samples[frame] = sum / channels;
  }
  return { samples, sampleRate };
}

suite('real Whisper transcription smoke (opt-in)', () => {
  it(
    'transcribes the checked-in clip into a non-empty cleaned prompt',
    async () => {
      const bytes = await readFile(new URL('./fixtures/voice-sample.wav', import.meta.url));
      const { samples, sampleRate } = decodeWavPcm16(bytes);
      const { pipeline } = await import('@huggingface/transformers');
      const transcriber = await pipeline('automatic-speech-recognition', MODEL_ID);
      const output = await transcriber(resample(samples, sampleRate, TARGET_SAMPLE_RATE));
      const text = Array.isArray(output) ? (output[0]?.text ?? '') : output.text;

      const cleaned = cleanTranscript(text);
      expect(cleaned.length).toBeGreaterThan(0);
      expect(cleaned.toLowerCase()).toContain('hello');
    },
    TIMEOUT_MS,
  );
});
