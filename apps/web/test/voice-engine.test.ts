import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { resample } from '../src/voice/pcm.js';

const voiceDir = fileURLToPath(new URL('../src/voice', import.meta.url));

describe('voice PCM resampling', () => {
  it('returns the input unchanged when the rate already matches', () => {
    const input = new Float32Array([0, 0.5, -0.5]);
    expect(resample(input, 16_000)).toBe(input);
  });

  it('halves the sample count and interpolates when downsampling by two', () => {
    const input = new Float32Array([0, 1, 2, 3, 4, 5, 6, 7]);
    const output = resample(input, 32_000, 16_000);
    expect(output.length).toBe(4);
    expect([...output]).toEqual([0, 2, 4, 6]);
  });
});

describe('voice privacy', () => {
  it('never persists or uploads audio in any voice source file', async () => {
    const files = (await readdir(voiceDir)).filter(
      (file) => file.endsWith('.ts') || file.endsWith('.tsx'),
    );
    expect(files.length).toBeGreaterThan(3);

    const forbidden = ['localStorage', 'sessionStorage', 'indexedDB', 'XMLHttpRequest', 'fetch('];
    for (const file of files) {
      const text = await readFile(join(voiceDir, file), 'utf8');
      for (const api of forbidden) {
        expect(text, `${file} must not use ${api}`).not.toContain(api);
      }
    }
  });
});
