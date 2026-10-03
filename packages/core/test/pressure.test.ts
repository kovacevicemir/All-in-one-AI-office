import { describe, expect, it } from 'vitest';
import { DEFAULT_PRESSURE_THRESHOLDS, type ContextPressureLevel } from '@ai-office/contracts';
import { computePressure, reduceAgentState, OutputBuffer } from '@ai-office/core';

const thresholds = DEFAULT_PRESSURE_THRESHOLDS; // 30 / 50 / 5

function at(percent: number | null, previous: ContextPressureLevel = 'unknown') {
  return computePressure({ percent, previous, thresholds });
}

describe('context pressure', () => {
  it('is nominal below the warning threshold', () => {
    expect(at(12)).toBe('nominal');
    expect(at(29.9)).toBe('nominal');
  });

  it('escalates to warning at exactly 30 percent', () => {
    expect(at(30)).toBe('warning');
  });

  it('escalates to critical at exactly 50 percent', () => {
    expect(at(50)).toBe('critical');
    expect(at(92)).toBe('critical');
  });

  it('is unknown without telemetry', () => {
    expect(at(null)).toBe('unknown');
    expect(at(null, 'critical')).toBe('unknown');
  });

  it('does not flap while oscillating around a threshold', () => {
    let level: ContextPressureLevel = 'unknown';
    const readings = [29, 31, 29, 31, 30, 29, 31];
    const changes: ContextPressureLevel[] = [];
    for (const reading of readings) {
      const next = at(reading, level);
      if (next !== level) changes.push(next);
      level = next;
    }
    // One change out of unknown, then one escalation to warning; it never eases
    // back while inside the hysteresis margin.
    expect(changes).toEqual(['nominal', 'warning']);
    expect(level).toBe('warning');
  });

  it('does not flap while oscillating around the critical threshold', () => {
    let level: ContextPressureLevel = 'warning';
    for (const reading of [51, 49, 51, 48, 51]) level = at(reading, level);
    expect(level).toBe('critical');
  });

  it('eases once the percent drops past the hysteresis margin', () => {
    expect(at(24, 'warning')).toBe('nominal');
    expect(at(26, 'warning')).toBe('warning');
    expect(at(44, 'critical')).toBe('warning');
    expect(at(46, 'critical')).toBe('critical');
  });

  it('never changes task outcomes by itself (pure function)', () => {
    const before = { ...thresholds };
    at(99, 'nominal');
    expect(thresholds).toEqual(before);
  });

  it('eases critical all the way to nominal in one step past both margins', () => {
    expect(at(20, 'critical')).toBe('nominal');
  });
});

describe('agent state reducer', () => {
  it('moves idle -> working -> done on a successful run', () => {
    let state = reduceAgentState('idle', { type: 'run.started' });
    expect(state).toBe('working');
    state = reduceAgentState(state, { type: 'run.activity' });
    expect(state).toBe('thinking');
    state = reduceAgentState(state, { type: 'run.completed' });
    expect(state).toBe('done');
  });

  it('reports error after a failure and recovers on the next run', () => {
    const failed = reduceAgentState('working', { type: 'run.failed' });
    expect(failed).toBe('error');
    expect(reduceAgentState(failed, { type: 'run.started' })).toBe('working');
  });

  it('reports waiting when the queue is blocked', () => {
    expect(reduceAgentState('idle', { type: 'queue.waiting' })).toBe('waiting');
    expect(reduceAgentState('waiting', { type: 'queue.idle' })).toBe('idle');
  });

  it('cancelling returns to idle', () => {
    expect(reduceAgentState('working', { type: 'run.cancelled' })).toBe('idle');
  });

  it('leaves state unchanged for activity while idle', () => {
    expect(reduceAgentState('idle', { type: 'run.activity' })).toBe('idle');
  });
});

describe('output buffer', () => {
  it('assigns increasing sequence numbers', () => {
    const buffer = new OutputBuffer({ maxLines: 100, maxBytes: 10_000 });
    expect(buffer.append('a').seq).toBe(1);
    expect(buffer.append('b').seq).toBe(2);
    expect(buffer.since(0).map((chunk) => chunk.data)).toEqual(['a', 'b']);
    expect(buffer.since(1).map((chunk) => chunk.data)).toEqual(['b']);
  });

  it('drops the oldest output past the line budget and advances oldestSeq', () => {
    const buffer = new OutputBuffer({ maxLines: 3, maxBytes: 10_000 });
    buffer.append('one\n');
    buffer.append('two\n');
    buffer.append('three\n');
    buffer.append('four\n');
    expect(buffer.oldestSeq()).toBeGreaterThan(1);
    const remaining = buffer.since(0).map((chunk) => chunk.data).join('');
    expect(remaining).not.toContain('one');
    expect(remaining).toContain('four');
  });

  it('drops the oldest output past the byte budget', () => {
    const buffer = new OutputBuffer({ maxLines: 10_000, maxBytes: 20 });
    buffer.append('x'.repeat(15));
    buffer.append('y'.repeat(15));
    expect(buffer.oldestSeq()).toBe(2);
  });

  it('keeps at least one chunk', () => {
    const buffer = new OutputBuffer({ maxLines: 1, maxBytes: 4 });
    buffer.append('a'.repeat(100));
    expect(buffer.since(0)).toHaveLength(1);
  });

  it('tails the requested number of lines', () => {
    const buffer = new OutputBuffer();
    buffer.append('l1\nl2\nl3\n');
    expect(buffer.tailLines(2)).toBe('l2\nl3\n');
  });
});
