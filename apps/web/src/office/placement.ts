import type { AgentView, Department } from '@ai-office/contracts';
import { layoutAgents } from './layout.js';

/**
 * Where an agent stands on the office floor.
 *
 * `x` and `y` are floor coordinates (the renderer maps `y` onto three.js's `z`
 * axis) and `facing` is a heading in radians, normalised to `[0, 2π)`. A heading
 * of `0` faces the room's `+y` direction, which is where the camera sits.
 */
export interface AgentPose {
  x: number;
  y: number;
  facing: number;
}

/** agentId -> pose. Missing when the agent has never been placed. */
export type PoseMap = Record<string, AgentPose>;

/** The rectangle an agent may be moved within. */
export interface RoomBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

const TAU = Math.PI * 2;

/** Narrowing guard for a value read back from browser storage. */
export function isAgentPose(value: unknown): value is AgentPose {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.x === 'number' &&
    Number.isFinite(record.x) &&
    typeof record.y === 'number' &&
    Number.isFinite(record.y) &&
    typeof record.facing === 'number' &&
    Number.isFinite(record.facing)
  );
}

/** Padding around the department zones that still counts as "inside". */
const ROOM_PADDING_X = 3.4;
const ROOM_PADDING_Y = 3.6;

/** Normalises any angle into `[0, 2π)`, so facing is always a 0–360° heading. */
export function normalizeFacing(angle: number): number {
  return ((angle % TAU) + TAU) % TAU;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * The room the office is clamped to. Follows the same department-zone layout as
 * the furniture plan, so bounds, desks and bots always agree.
 */
export function roomBounds(agents: AgentView[], departments: Department[]): RoomBounds {
  const { zones } = layoutAgents(agents, departments);
  const first = zones[0]?.x ?? 0;
  const last = zones[zones.length - 1]?.x ?? 0;
  return {
    minX: first - ROOM_PADDING_X,
    maxX: last + ROOM_PADDING_X,
    minY: -ROOM_PADDING_Y,
    maxY: ROOM_PADDING_Y,
  };
}

/**
 * Deterministic starting positions: one per agent, grouped by department, taken
 * from the same pure layout the furniture uses. Agents the layout does not place
 * (there are none today) are simply absent.
 */
export function defaultPoses(agents: AgentView[], departments: Department[]): PoseMap {
  const { placed } = layoutAgents(agents, departments);
  const poses: PoseMap = {};
  for (const { agent, position } of placed) {
    poses[agent.id] = { x: position[0], y: position[2], facing: 0 };
  }
  return poses;
}

/**
 * Keeps every stored pose whose agent still exists and fills in a default pose
 * for agents without one. Poses for removed agents are dropped, so a stale
 * layout cannot leak back in.
 */
export function reconcilePoses(existing: PoseMap, defaults: PoseMap): PoseMap {
  const next: PoseMap = {};
  for (const [agentId, fallback] of Object.entries(defaults)) {
    next[agentId] = existing[agentId] ?? fallback;
  }
  return next;
}

export function clampPose(pose: AgentPose, bounds: RoomBounds): AgentPose {
  return {
    x: clamp(pose.x, bounds.minX, bounds.maxX),
    y: clamp(pose.y, bounds.minY, bounds.maxY),
    facing: normalizeFacing(pose.facing),
  };
}

/**
 * Heading from a movement vector. The renderer rotates a bot that faces `+y` by
 * `atan2(dx, dy)`, so this is the heading that makes the bot face the direction
 * it is moving. Standing still keeps the previous heading.
 */
export function facingFromDelta(dx: number, dy: number, previous: number): number {
  if (dx === 0 && dy === 0) return normalizeFacing(previous);
  return normalizeFacing(Math.atan2(dx, dy));
}

/** Moves a pose by a delta, clamping to the room and turning to face the move. */
export function movePose(
  pose: AgentPose,
  dx: number,
  dy: number,
  bounds: RoomBounds,
): AgentPose {
  return clampPose(
    { x: pose.x + dx, y: pose.y + dy, facing: facingFromDelta(dx, dy, pose.facing) },
    bounds,
  );
}

/** Moves a pose to an absolute floor point, facing the direction of travel. */
export function movePoseTo(
  pose: AgentPose,
  x: number,
  y: number,
  bounds: RoomBounds,
): AgentPose {
  const facing = facingFromDelta(x - pose.x, y - pose.y, pose.facing);
  return clampPose({ x, y, facing }, bounds);
}
