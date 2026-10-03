import { describe, expect, it } from 'vitest';
import { POSE_STORAGE_KEY, loadPoses, parsePoses, savePoses } from '../src/office/pose-storage.js';
import type { PoseStorage } from '../src/office/pose-storage.js';

function memoryStorage(seed: Record<string, string> = {}): PoseStorage & { values: Record<string, string> } {
  const values = { ...seed };
  return {
    values,
    getItem: (key) => values[key] ?? null,
    setItem: (key, value) => {
      values[key] = value;
    },
  };
}

describe('pose storage', () => {
  it('round-trips a pose map', () => {
    const storage = memoryStorage();
    const poses = { a: { x: 1, y: 2, facing: 0.5 } };
    savePoses(storage, poses);
    expect(loadPoses(storage)).toEqual(poses);
    expect(storage.values[POSE_STORAGE_KEY]).toBeTypeOf('string');
  });

  it('reads missing data as an empty layout', () => {
    expect(loadPoses(memoryStorage())).toEqual({});
    expect(parsePoses(null)).toEqual({});
  });

  it('ignores malformed JSON instead of throwing', () => {
    expect(parsePoses('{not json')).toEqual({});
    expect(parsePoses('42')).toEqual({});
    expect(parsePoses('null')).toEqual({});
  });

  it('ignores entries that are not finite poses', () => {
    const raw = JSON.stringify({
      good: { x: 1, y: 2, facing: 0 },
      missingFacing: { x: 1, y: 2 },
      notFinite: { x: null, y: 2, facing: 0 },
      notObject: 'nope',
    });
    expect(parsePoses(raw)).toEqual({ good: { x: 1, y: 2, facing: 0 } });
  });

  it('does not throw when the store is unavailable', () => {
    const broken: PoseStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(loadPoses(broken)).toEqual({});
    expect(() => savePoses(broken, { a: { x: 0, y: 0, facing: 0 } })).not.toThrow();
  });
});
