import { describe, expect, it } from 'vitest';
import {
  EMPTY_MANIFEST,
  REQUIRED_CLIPS,
  clipNameFor,
  parseManifest,
  resolveAvatar,
} from '../src/office/manifest.js';

const complete = parseManifest({
  default: { clips: { idle: 'Idle', working: 'Work', blocked: 'Stuck' } },
  bots: {
    agent_1: {
      model: '/avatars/ada.glb',
      scale: 1.25,
      clips: {
        idle: 'Idle',
        working: 'Walk',
        blocked: 'Stuck',
        complaining: 'Complain',
        stressed: 'Panic',
      },
    },
  },
});

describe('avatar manifest: fallback', () => {
  it('falls back to the procedural bot when there is no entry at all', () => {
    const avatar = resolveAvatar(EMPTY_MANIFEST, 'agent_unknown');
    expect(avatar.usingFallbackModel).toBe(true);
    expect(avatar.model).toBeUndefined();
    expect(avatar.missingClips).toEqual([...REQUIRED_CLIPS]);
    expect(clipNameFor(avatar, 'working')).toBeNull();
  });

  it('falls back to the procedural bot when the entry has clips but no model', () => {
    const manifest = parseManifest({ bots: { agent_1: { clips: { idle: 'I', working: 'W', blocked: 'B' } } } });
    const avatar = resolveAvatar(manifest, 'agent_1');
    expect(avatar.usingFallbackModel).toBe(true);
    expect(avatar.missingClips).toEqual([]);
  });

  it('reports a missing asset when the model entry is unusable', () => {
    const manifest = parseManifest({ bots: { agent_1: { model: '   ', clips: { idle: 'I' } } } });
    const avatar = resolveAvatar(manifest, 'agent_1');
    expect(avatar.usingFallbackModel).toBe(true);
    expect(avatar.model).toBeUndefined();
  });

  it('reports which clips are missing and falls back between them', () => {
    const manifest = parseManifest({
      bots: { agent_1: { model: '/a.glb', clips: { idle: 'Idle' } } },
    });
    const avatar = resolveAvatar(manifest, 'agent_1');
    expect(avatar.usingFallbackModel).toBe(false);
    expect(avatar.missingClips).toEqual(['working', 'blocked']);
    expect(clipNameFor(avatar, 'blocked')).toBe('Idle');
    expect(clipNameFor(avatar, 'complaining')).toBe('Idle');
  });

  it('uses the default entry for an agent without its own entry', () => {
    const avatar = resolveAvatar(complete, 'agent_other');
    expect(avatar.usingFallbackModel).toBe(true);
    expect(avatar.missingClips).toEqual([]);
    expect(clipNameFor(avatar, 'working')).toBe('Work');
  });
});

describe('avatar manifest: complete entry', () => {
  it('resolves model, scale and clips', () => {
    const avatar = resolveAvatar(complete, 'agent_1');
    expect(avatar.model).toBe('/avatars/ada.glb');
    expect(avatar.scale).toBe(1.25);
    expect(avatar.usingFallbackModel).toBe(false);
    expect(avatar.missingClips).toEqual([]);
  });

  it('prefers the direct clip, then the fallback chain', () => {
    const avatar = resolveAvatar(complete, 'agent_1');
    expect(clipNameFor(avatar, 'complaining')).toBe('Complain');
    expect(clipNameFor(avatar, 'stressed')).toBe('Panic');
    expect(clipNameFor(avatar, 'thinking')).toBe('Walk');
    expect(clipNameFor(avatar, 'error')).toBe('Stuck');
    expect(clipNameFor(avatar, 'waiting')).toBe('Idle');
  });
});

describe('avatar manifest: defensive parsing', () => {
  it('degrades malformed data instead of throwing', () => {
    expect(parseManifest(null).bots).toEqual({});
    expect(parseManifest('nope').bots).toEqual({});
    expect(parseManifest({ bots: { a: 'nope', b: 42 } }).bots).toEqual({});
    expect(parseManifest({ bots: { a: { model: 5, clips: { idle: 1 }, scale: -3 } } }).bots).toEqual({
      a: {},
    });
  });

  it('ignores a non-string clip name but keeps the valid ones', () => {
    const manifest = parseManifest({ bots: { a: { clips: { idle: 'I', working: 9, blocked: 'B' } } } });
    const avatar = resolveAvatar(manifest, 'a');
    expect(avatar.missingClips).toEqual(['working']);
  });
});
