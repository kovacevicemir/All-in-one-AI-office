import type { AgentView, Department } from '@ai-office/contracts';
import { ZONE_WIDTH, layoutAgents, type PlacedAgent, type Zone } from './layout.js';

export const FURNITURE_KINDS = [
  'desk',
  'chair',
  'monitor',
  'plant',
  'rug',
  'calendar',
  'whiteboard',
  'cabinet',
  'bookshelf',
  'cooler',
  'table',
  'stool',
  'printer',
  'poster',
] as const;

export type FurnitureKind = (typeof FURNITURE_KINDS)[number];

/**
 * Floor elevation for a standalone piece. Elevation is a property of the kind,
 * not of a placement, so one layout item only needs `x`/`y`. The default plan
 * and the editable layout both read this, so the two cannot drift.
 */
export const FURNITURE_ELEVATION: Record<FurnitureKind, number> = {
  desk: 0,
  chair: 0,
  monitor: 0.99,
  plant: 0,
  rug: 0.012,
  calendar: 1.7,
  whiteboard: 1.75,
  cabinet: 0,
  bookshelf: 0,
  cooler: 0,
  table: 0,
  stool: 0,
  printer: 0,
  poster: 1.85,
};

export interface Placement {
  kind: FurnitureKind;
  position: [number, number, number];
  rotationY: number;
}

export interface OfficePlan {
  zones: Zone[];
  placed: PlacedAgent[];
  furniture: Placement[];
}

/** Back wall the decor hangs on. */
export const WALL_Z = -5.85;

function place(kind: FurnitureKind, position: [number, number, number]): Placement {
  return { kind, position, rotationY: 0 };
}

/** Converts a layout item (floor `x`/`y`, quarter-turn rotation) to a placement. */
export function placementFromItem(item: {
  kind: FurnitureKind;
  x: number;
  y: number;
  rotation: number;
}): Placement {
  return {
    kind: item.kind,
    position: [item.x, FURNITURE_ELEVATION[item.kind], item.y],
    rotationY: (item.rotation * Math.PI) / 2,
  };
}

/**
 * Pure office layout. Positions are deterministic and free of Three.js, so the
 * furnished scene can be asserted in a unit test without a rendering context.
 * Desk, chair and monitor are one per agent; shared props are one per zone; the
 * rug and wall decor are singular.
 */
export function planOffice(agents: AgentView[], departments: Department[]): OfficePlan {
  const { placed, zones } = layoutAgents(agents, departments);
  const furniture: Placement[] = [];

  for (const { position } of placed) {
    const [x, , z] = position;
    furniture.push(place('desk', [x, 0, z - 1.05]));
    furniture.push(place('chair', [x, 0, z - 0.55]));
    furniture.push(place('monitor', [x, FURNITURE_ELEVATION.monitor, z - 1.35]));
  }

  for (const zone of zones) {
    furniture.push(place('cabinet', [zone.x - 2.35, 0, -1.8]));
    furniture.push(place('plant', [zone.x + 2.35, 0, -1.8]));
  }

  // Two corner plants guarantee the "at least two plants" floor even with no zones.
  furniture.push(place('plant', [-3.4, 0, 1.8]));
  furniture.push(place('plant', [3.4, 0, 1.8]));

  const centerX = zones.length > 0 ? ((zones.length - 1) * ZONE_WIDTH) / 2 : 0;
  furniture.push(place('rug', [centerX, FURNITURE_ELEVATION.rug, 0.2]));
  furniture.push(place('calendar', [centerX - 2.4, FURNITURE_ELEVATION.calendar, WALL_Z]));
  furniture.push(place('whiteboard', [centerX + 1.6, FURNITURE_ELEVATION.whiteboard, WALL_Z]));

  // A shared break/meeting nook and the everyday office props, placed relative
  // to the work area so they stay with the department zones.
  furniture.push(place('bookshelf', [centerX - 3.6, 0, WALL_Z + 0.6]));
  furniture.push(place('cooler', [centerX - 1.4, 0, WALL_Z + 0.7]));
  furniture.push(place('poster', [centerX + 4.6, FURNITURE_ELEVATION.poster, WALL_Z + 0.06]));
  furniture.push(place('printer', [centerX + 4.6, 0, 2.6]));
  furniture.push(place('table', [centerX + 5.6, 0, 0.6]));
  furniture.push(place('stool', [centerX + 4.5, 0, -0.1]));
  furniture.push(place('stool', [centerX + 6.7, 0, -0.1]));
  furniture.push(place('stool', [centerX + 5.6, 0, 1.7]));

  return { zones, placed, furniture };
}

/** How many pieces of a kind the plan contains; a small test/read helper. */
export function countKind(plan: OfficePlan, kind: FurnitureKind): number {
  return plan.furniture.filter((placement) => placement.kind === kind).length;
}
