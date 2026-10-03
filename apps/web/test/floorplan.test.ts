import { describe, expect, it } from 'vitest';
import { countKind, planOffice } from '../src/office/floorplan.js';
import { ZONE_WIDTH } from '../src/office/layout.js';
import { agentView, department } from './fixtures.js';

describe('office floor plan', () => {
  it('has no desks for an empty office but is still furnished', () => {
    const plan = planOffice([], []);
    expect(countKind(plan, 'desk')).toBe(0);
    expect(countKind(plan, 'chair')).toBe(0);
    expect(countKind(plan, 'monitor')).toBe(0);
    expect(countKind(plan, 'plant')).toBeGreaterThanOrEqual(2);
    expect(countKind(plan, 'rug')).toBe(1);
    expect(countKind(plan, 'calendar')).toBe(1);
    expect(countKind(plan, 'whiteboard')).toBe(1);
  });

  it('gives one desk, chair and monitor per agent', () => {
    const engineering = department('Engineering');
    const agents = [agentView({ id: 'a', departmentId: engineering.id })];
    const plan = planOffice(agents, [engineering]);

    expect(countKind(plan, 'desk')).toBe(1);
    expect(countKind(plan, 'chair')).toBe(1);
    expect(countKind(plan, 'monitor')).toBe(1);
    expect(countKind(plan, 'cabinet')).toBe(1);
    expect(countKind(plan, 'plant')).toBeGreaterThanOrEqual(2);
  });

  it('places several agents across two departments deterministically', () => {
    const engineering = department('Engineering');
    const ops = department('Ops');
    const agents = [
      agentView({ id: 'a', departmentId: engineering.id }),
      agentView({ id: 'b', departmentId: engineering.id }),
      agentView({ id: 'c', departmentId: ops.id }),
      agentView({ id: 'd', departmentId: undefined }),
    ];

    const first = planOffice(agents, [engineering, ops]);
    const second = planOffice(agents, [engineering, ops]);

    expect(first).toEqual(second);
    expect(first.zones.map((zone) => zone.name)).toEqual(['Engineering', 'Ops', 'Unassigned']);
    expect(first.zones[1]?.x).toBe((first.zones[0]?.x ?? 0) + ZONE_WIDTH);
    expect(countKind(first, 'desk')).toBe(agents.length);
    expect(countKind(first, 'chair')).toBe(agents.length);
    expect(countKind(first, 'monitor')).toBe(agents.length);
    // One shared cabinet per furnished zone.
    expect(countKind(first, 'cabinet')).toBe(3);
  });
});
