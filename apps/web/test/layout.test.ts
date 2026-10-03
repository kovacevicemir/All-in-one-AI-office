import { describe, expect, it } from 'vitest';
import { PER_ROW, ZONE_WIDTH, layoutAgents } from '../src/office/layout.js';
import { agentView, department } from './fixtures.js';

describe('office layout', () => {
  it('places one bot per agent', () => {
    const engineering = department('Engineering');
    const agents = [
      agentView({ id: 'a', departmentId: engineering.id }),
      agentView({ id: 'b', departmentId: engineering.id }),
      agentView({ id: 'c', departmentId: engineering.id }),
    ];
    const { placed } = layoutAgents(agents, [engineering]);
    expect(placed).toHaveLength(3);
    expect(placed.map((entry) => entry.agent.id)).toEqual(['a', 'b', 'c']);
  });

  it('gives each department its own zone, spaced apart', () => {
    const engineering = department('Engineering');
    const ops = department('Ops');
    const { zones, placed } = layoutAgents(
      [
        agentView({ id: 'a', departmentId: engineering.id }),
        agentView({ id: 'b', departmentId: ops.id }),
      ],
      [engineering, ops],
    );
    expect(zones.map((zone) => zone.name)).toEqual(['Engineering', 'Ops']);
    expect(zones[1]?.x).toBe(zones[0]!.x + ZONE_WIDTH);
    expect(placed[0]?.position[0]).not.toBe(placed[1]?.position[0]);
  });

  it('buckets agents with no department, or an unknown one, into Unassigned', () => {
    const engineering = department('Engineering');
    const { zones, placed } = layoutAgents(
      [
        agentView({ id: 'a', departmentId: engineering.id }),
        agentView({ id: 'b' }),
        agentView({ id: 'c', departmentId: 'ghost' }),
      ],
      [engineering],
    );
    expect(zones.map((zone) => zone.name)).toEqual(['Engineering', 'Unassigned']);
    expect(placed).toHaveLength(3);
  });

  it('omits empty departments entirely', () => {
    const engineering = department('Engineering');
    const empty = department('Empty');
    const { zones } = layoutAgents([agentView({ id: 'a', departmentId: engineering.id })], [
      engineering,
      empty,
    ]);
    expect(zones.map((zone) => zone.name)).toEqual(['Engineering']);
  });

  it('wraps a crowded department onto further rows', () => {
    const engineering = department('Engineering');
    const agents = Array.from({ length: PER_ROW + 1 }, (_, index) =>
      agentView({ id: `a${index}`, departmentId: engineering.id }),
    );
    const { placed } = layoutAgents(agents, [engineering]);
    const firstRow = placed.slice(0, PER_ROW).map((entry) => entry.position[2]);
    const overflow = placed[PER_ROW]!.position[2];
    expect(new Set(firstRow).size).toBe(1);
    expect(overflow).toBeGreaterThan(firstRow[0] as number);
  });

  it('is empty and safe for an office with no agents', () => {
    expect(layoutAgents([], [])).toEqual({ placed: [], zones: [] });
  });
});
