/** PCM helpers shared by the speech engine; pure and unit-testable. */

/** Whisper expects 16 kHz mono audio. */
export const TARGET_SAMPLE_RATE = 16_000;

/** Linear-interpolation resample, used when the browser ignores our rate hint. */
export function resample(
  input: Float32Array,
  from: number,
  to: number = TARGET_SAMPLE_RATE,
): Float32Array {
  if (from === to || input.length === 0) return input;
  const ratio = from / to;
  const length = Math.max(1, Math.round(input.length / ratio));
  const output = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    const position = i * ratio;
    const lower = Math.floor(position);
    const upper = Math.min(lower + 1, input.length - 1);
    const weight = position - lower;
    output[i] = (input[lower] ?? 0) * (1 - weight) + (input[upper] ?? 0) * weight;
  }
  return output;
}
