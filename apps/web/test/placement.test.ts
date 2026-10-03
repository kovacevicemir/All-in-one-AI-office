import { describe, expect, it } from 'vitest';
import {
  clampPose,
  defaultPoses,
  facingFromDelta,
  movePose,
  movePoseTo,
  normalizeFacing,
  reconcilePoses,
  roomBounds,
  type RoomBounds,
} from '../src/office/placement.js';
import { agentView, department } from './fixtures.js';

const BOUNDS: RoomBounds = { minX: -5, maxX: 5, minY: -4, maxY: 4 };

describe('defaultPoses', () => {
  it('places one pose per agent, deterministically', () => {
    const engineering = department('Engineering');
    const agents = [
      agentView({ id: 'a', departmentId: engineering.id }),
      agentView({ id: 'b', departmentId: engineering.id }),
    ];
    const first = defaultPoses(agents, [engineering]);
    const second = defaultPoses(agents, [engineering]);

    expect(Object.keys(first).sort()).toEqual(['a', 'b']);
    expect(first).toEqual(second);
    expect(first.a).toEqual({ x: -1.7, y: -1.6, facing: 0 });
  });

  it('is empty for an office with no agents', () => {
    expect(defaultPoses([], [])).toEqual({});
  });
});

describe('roomBounds', () => {
  it('grows with the number of department zones', () => {
    const engineering = department('Engineering');
    const ops = department('Ops');
    const one = roomBounds([agentView({ id: 'a', departmentId: engineering.id })], [engineering]);
    const two = roomBounds(
      [
        agentView({ id: 'a', departmentId: engineering.id }),
        agentView({ id: 'b', departmentId: ops.id }),
      ],
      [engineering, ops],
    );
    expect(two.maxX).toBeGreaterThan(one.maxX);
    expect(two.minX).toBe(one.minX);
  });
});

describe('reconcilePoses', () => {
  it('keeps a stored pose and fills in a default for a new agent', () => {
    const defaults = { a: { x: 0, y: 0, facing: 0 }, b: { x: 1, y: 0, facing: 0 } };
    const stored = { a: { x: 9, y: 0.5, facing: 1 } };
    expect(reconcilePoses(stored, defaults)).toEqual({
      a: { x: 9, y: 0.5, facing: 1 },
      b: { x: 1, y: 0, facing: 0 },
    });
  });

  it('drops a stored pose for an agent that no longer exists', () => {
    const defaults = { a: { x: 0, y: 0, facing: 0 } };
    const stored = { gone: { x: 9, y: 9, facing: 0 }, a: { x: 1, y: 1, facing: 0 } };
    expect(Object.keys(reconcilePoses(stored, defaults))).toEqual(['a']);
  });
});

describe('clampPose', () => {
  it('clamps every edge into the room', () => {
    expect(clampPose({ x: -99, y: 0, facing: 0 }, BOUNDS)).toEqual({ x: -5, y: 0, facing: 0 });
    expect(clampPose({ x: 99, y: 0, facing: 0 }, BOUNDS)).toEqual({ x: 5, y: 0, facing: 0 });
    expect(clampPose({ x: 0, y: -99, facing: 0 }, BOUNDS)).toEqual({ x: 0, y: -4, facing: 0 });
    expect(clampPose({ x: 0, y: 99, facing: 0 }, BOUNDS)).toEqual({ x: 0, y: 4, facing: 0 });
  });

  it('normalises facing into the 0–360° range', () => {
    expect(normalizeFacing(-Math.PI / 2)).toBeCloseTo((3 * Math.PI) / 2);
    expect(clampPose({ x: 0, y: 0, facing: -Math.PI }, BOUNDS).facing).toBeCloseTo(Math.PI);
  });
});

describe('facingFromDelta', () => {
  const cases: Array<[string, number, number, number]> = [
    ['down (+y)', 0, 1, 0],
    ['right (+x)', 1, 0, Math.PI / 2],
    ['up (-y)', 0, -1, Math.PI],
    ['left (-x)', -1, 0, (3 * Math.PI) / 2],
    ['diagonal', 1, 1, Math.PI / 4],
  ];

  it.each(cases)('turns to face %s', (_label, dx, dy, expected) => {
    expect(facingFromDelta(dx, dy, 0)).toBeCloseTo(expected);
  });

  it('keeps the previous heading when there is no movement', () => {
    expect(facingFromDelta(0, 0, 2.5)).toBeCloseTo(2.5);
  });

  it('can reverse direction by a full 180°', () => {
    const heading = facingFromDelta(0, 1, 0);
    const reversed = facingFromDelta(0, -1, heading);
    expect(Math.abs(reversed - heading)).toBeCloseTo(Math.PI);
  });
});

describe('movePose and movePoseTo', () => {
  it('moves by a delta, faces the move, and clamps at the edge', () => {
    const moved = movePose({ x: 4.5, y: 0, facing: 0 }, 2, 0, BOUNDS);
    expect(moved.x).toBe(5);
    expect(moved.facing).toBeCloseTo(Math.PI / 2);
  });

  it('moves to an absolute point and faces the direction of travel', () => {
    const moved = movePoseTo({ x: 0, y: 0, facing: 0 }, -1, 0, BOUNDS);
    expect(moved).toEqual({ x: -1, y: 0, facing: (3 * Math.PI) / 2 });
  });
});
