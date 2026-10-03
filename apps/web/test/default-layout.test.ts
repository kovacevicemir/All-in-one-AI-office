import { describe, expect, it } from 'vitest';
import { defaultLayout } from '../src/office/default-layout.js';
import { FURNITURE_KINDS, countKind, planOffice } from '../src/office/floorplan.js';
import { agentView, department } from './fixtures.js';

describe('default layout', () => {
  it('matches the procedural plan piece for piece', () => {
    const engineering = department('Engineering');
    const agents = [
      agentView({ id: 'a', departmentId: engineering.id }),
      agentView({ id: 'b', departmentId: engineering.id }),
    ];
    const plan = planOffice(agents, [engineering]);
    const document = defaultLayout(agents, [engineering]);

    expect(document.version).toBe(1);
    expect(document.items).toHaveLength(plan.furniture.length);
    for (const kind of FURNITURE_KINDS) {
      expect(document.items.filter((item) => item.kind === kind)).toHaveLength(countKind(plan, kind));
    }
    expect(document.items.every((item) => item.rotation === 0)).toBe(true);
  });

  it('is deterministic with stable, unique ids', () => {
    const ops = department('Ops');
    const agents = [agentView({ id: 'a', departmentId: ops.id })];
    const first = defaultLayout(agents, [ops]);
    const second = defaultLayout(agents, [ops]);
    expect(first).toEqual(second);
    expect(new Set(first.items.map((item) => item.id)).size).toBe(first.items.length);
  });

  it('changes when the departments change', () => {
    const engineering = department('Engineering');
    const ops = department('Ops');
    const noDepartments = defaultLayout([], []);
    const one = defaultLayout(
      [agentView({ id: 'a', departmentId: engineering.id })],
      [engineering],
    );
    const two = defaultLayout(
      [
        agentView({ id: 'a', departmentId: engineering.id }),
        agentView({ id: 'b', departmentId: ops.id }),
      ],
      [engineering, ops],
    );
    expect(one.items.length).toBeGreaterThan(noDepartments.items.length);
    expect(two.items.length).toBeGreaterThan(one.items.length);
  });
});
