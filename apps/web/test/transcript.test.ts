import { describe, expect, it } from 'vitest';
import { interleaveTranscript, segmentsToText } from '../src/runtime/transcript.js';
import { communication } from './fixtures.js';

const chunks = [
  { seq: 1, text: 'first\n' },
  { seq: 2, text: 'second\n' },
  { seq: 3, text: 'third\n' },
];

const anchored = (id: string, seq: number, sessionId = 'session_1') =>
  communication({ id, seq, sessionId });

describe('interleaveTranscript', () => {
  it('places a marker before the first chunk when its sequence precedes them', () => {
    const segments = interleaveTranscript(chunks, [anchored('comm_early', 0)]);
    expect(segments.map((segment) => segment.kind)).toEqual(['marker', 'text', 'text', 'text']);
    expect(segments[0]).toMatchObject({ kind: 'marker', communication: { id: 'comm_early' } });
  });

  it('places a marker between the chunks it falls among', () => {
    const segments = interleaveTranscript(chunks, [anchored('comm_mid', 2)]);
    expect(segments.map((segment) => segment.kind)).toEqual(['text', 'marker', 'text', 'text']);
    expect(segments[1]).toMatchObject({ kind: 'marker', communication: { id: 'comm_mid' } });
  });

  it('places a marker after the last chunk when its sequence is later', () => {
    const segments = interleaveTranscript(chunks, [anchored('comm_late', 9)]);
    expect(segments.at(-1)).toMatchObject({ kind: 'marker', communication: { id: 'comm_late' } });
  });

  it('keeps multiple markers at one sequence together and in order', () => {
    const segments = interleaveTranscript(chunks, [anchored('comm_b', 2), anchored('comm_a', 2)]);
    const markerIds = segments
      .filter((segment) => segment.kind === 'marker')
      .map((segment) => (segment.kind === 'marker' ? segment.communication.id : ''));
    expect(markerIds).toEqual(['comm_a', 'comm_b']);
    expect(segments.map((segment) => segment.kind)).toEqual(['text', 'marker', 'marker', 'text', 'text']);
  });

  it('excludes a marker with no session anchor', () => {
    const unanchored = communication({ id: 'comm_unanchored' });
    const segments = interleaveTranscript(chunks, [unanchored]);
    expect(segments.every((segment) => segment.kind === 'text')).toBe(true);
  });

  it('leaves the plain text unchanged when no communications apply', () => {
    const segments = interleaveTranscript(chunks, []);
    expect(segmentsToText(segments)).toBe('first\nsecond\nthird\n');
  });
});
