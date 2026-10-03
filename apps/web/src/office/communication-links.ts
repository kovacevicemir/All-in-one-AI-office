import type { AgentCommunication } from '@ai-office/contracts';

export type Vec3 = [number, number, number];

export interface CommunicationSegment {
  id: string;
  communication: AgentCommunication;
  from: Vec3;
  to: Vec3;
  /** Geometric midpoint between the two agents, before any offset. */
  midpoint: Vec3;
  /** Displacement so links between the same pair stay individually hoverable. */
  offset: Vec3;
}

/**
 * Pure link geometry for the 3D scene. Returns one segment per communication
 * whose two agents are both placed. Links between the same pair are offset along
 * the pair's perpendicular so they do not overlap into one unhoverable line.
 * Kept free of Three.js so it can be tested without WebGL.
 */
export function communicationSegments(
  events: AgentCommunication[],
  positions: Record<string, Vec3>,
): CommunicationSegment[] {
  const perPair = new Map<string, number>();
  const segments: CommunicationSegment[] = [];

  for (const event of events) {
    const from = positions[event.fromAgentId];
    const to = positions[event.toAgentId];
    if (from === undefined || to === undefined) continue;

    const pair = [event.fromAgentId, event.toAgentId].sort().join('>');
    const index = perPair.get(pair) ?? 0;
    perPair.set(pair, index + 1);

    const dx = to[0] - from[0];
    const dz = to[2] - from[2];
    const length = Math.hypot(dx, dz) || 1;
    const shift = index * 0.5;
    const offset: Vec3 = [
      (-dz / length) * shift || 0,
      0,
      (dx / length) * shift || 0,
    ];

    segments.push({
      id: event.id,
      communication: event,
      from,
      to,
      midpoint: [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2],
      offset,
    });
  }

  return segments;
}

/** Where the envelope sits: the midpoint, displaced by the overlap offset. */
export function markerPosition(segment: CommunicationSegment): Vec3 {
  return [
    segment.midpoint[0] + segment.offset[0],
    segment.midpoint[1] + segment.offset[1],
    segment.midpoint[2] + segment.offset[2],
  ];
}

export const COMMUNICATION_STATUS_COLOR: Record<AgentCommunication['status'], string> = {
  open: '#38bdf8',
  answered: '#34d399',
  failed: '#ef4444',
  cancelled: '#94a3b8',
};
