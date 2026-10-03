// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { communicationSegments, markerPosition, type Vec3 } from '../src/office/communication-links.js';
import { communication } from './fixtures.js';

const positions: Record<string, Vec3> = {
  agent_1: [0, 0, 0],
  agent_2: [2, 0, 0],
};

describe('communicationSegments', () => {
  it('returns the midpoint between the two placed agents', () => {
    const segments = communicationSegments(
      [communication({ id: 'comm_1', fromAgentId: 'agent_1', toAgentId: 'agent_2' })],
      positions,
    );
    expect(segments).toHaveLength(1);
    expect(segments[0]?.midpoint).toEqual([1, 0, 0]);
    expect(markerPosition(segments[0]!)).toEqual([1, 0, 0]);
  });

  it('offsets two communications between the same pair so they stay distinct', () => {
    const segments = communicationSegments(
      [
        communication({ id: 'comm_a', fromAgentId: 'agent_1', toAgentId: 'agent_2' }),
        communication({ id: 'comm_b', fromAgentId: 'agent_2', toAgentId: 'agent_1' }),
      ],
      positions,
    );
    expect(segments).toHaveLength(2);
    expect(segments[0]?.offset).toEqual([0, 0, 0]);
    expect(markerPosition(segments[1]!)).not.toEqual(markerPosition(segments[0]!));
    // The offset is horizontal, so the marker stays at mid-height.
    expect(markerPosition(segments[1]!)[1]).toBe(0);
  });

  it('returns no segment when an agent is not placed', () => {
    const segments = communicationSegments(
      [communication({ id: 'comm_1', fromAgentId: 'agent_1', toAgentId: 'agent_unknown' })],
      positions,
    );
    expect(segments).toEqual([]);
  });
});
