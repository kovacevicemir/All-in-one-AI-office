import { FURNITURE_KINDS, type FurnitureKind } from './floorplan.js';

/** Bump when the on-disk shape changes so older files are refused, not misread. */
export const LAYOUT_VERSION = 1;

/** A full turn is four quarter-turns, so a rotation is an index in `0..3`. */
export const ROTATION_STEPS = 4;

/** One placed piece of furniture. Height comes from the kind, not the item. */
export interface LayoutItem {
  id: string;
  kind: FurnitureKind;
  /** Floor coordinates, in the same space as an agent pose. */
  x: number;
  y: number;
  /** Quarter-turns clockwise, `0..3`. */
  rotation: number;
}

export interface LayoutDocument {
  version: number;
  items: LayoutItem[];
}

export interface LayoutBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface ParseResult {
  document: LayoutDocument | null;
  /** Why the whole document was rejected; null when a document was produced. */
  reason: string | null;
  /** How many entries were dropped because they were unusable. */
  skipped: number;
}

const KINDS: ReadonlySet<string> = new Set(FURNITURE_KINDS);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function isFurnitureKind(value: unknown): value is FurnitureKind {
  return typeof value === 'string' && KINDS.has(value);
}

/** Keeps a floor point inside the editable room. */
export function clampToRoom(x: number, y: number, bounds: LayoutBounds): { x: number; y: number } {
  return { x: clamp(x, bounds.minX, bounds.maxX), y: clamp(y, bounds.minY, bounds.maxY) };
}

/** Normalises any rotation into a 0-3 quarter-turn index. */
export function normalizeRotation(value: number): number {
  return ((Math.round(value) % ROTATION_STEPS) + ROTATION_STEPS) % ROTATION_STEPS;
}

/** Picks the next free `<kind>_<n>` id, so ids stay stable and unique. */
export function nextItemId(ids: Iterable<string>, kind: FurnitureKind): string {
  const prefix = `${kind}_`;
  let highest = 0;
  for (const id of ids) {
    if (!id.startsWith(prefix)) continue;
    const suffix = Number(id.slice(prefix.length));
    if (Number.isInteger(suffix) && suffix > highest) highest = suffix;
  }
  return `${prefix}${highest + 1}`;
}

export function addItem(
  document: LayoutDocument,
  kind: FurnitureKind,
  x: number,
  y: number,
  bounds: LayoutBounds,
  rotation = 0,
): LayoutDocument {
  const point = clampToRoom(x, y, bounds);
  const item: LayoutItem = {
    id: nextItemId(document.items.map((entry) => entry.id), kind),
    kind,
    x: point.x,
    y: point.y,
    rotation: normalizeRotation(rotation),
  };
  return { ...document, items: [...document.items, item] };
}

export function moveItem(
  document: LayoutDocument,
  id: string,
  x: number,
  y: number,
  bounds: LayoutBounds,
): LayoutDocument {
  const point = clampToRoom(x, y, bounds);
  return {
    ...document,
    items: document.items.map((item) =>
      item.id === id ? { ...item, x: point.x, y: point.y } : item,
    ),
  };
}

export function rotateItem(document: LayoutDocument, id: string, steps = 1): LayoutDocument {
  return {
    ...document,
    items: document.items.map((item) =>
      item.id === id ? { ...item, rotation: normalizeRotation(item.rotation + steps) } : item,
    ),
  };
}

export function removeItem(document: LayoutDocument, id: string): LayoutDocument {
  return { ...document, items: document.items.filter((item) => item.id !== id) };
}

/**
 * The rectangle the default office occupies, padded so there is somewhere to
 * place new furniture and imported coordinates stay on the floor.
 */
export function layoutBounds(document: LayoutDocument, margin = 2): LayoutBounds {
  if (document.items.length === 0) {
    return { minX: -8, maxX: 8, minY: -8, maxY: 8 };
  }
  return {
    minX: Math.min(...document.items.map((item) => item.x)) - margin,
    maxX: Math.max(...document.items.map((item) => item.x)) + margin,
    minY: Math.min(...document.items.map((item) => item.y)) - margin,
    maxY: Math.max(...document.items.map((item) => item.y)) + margin,
  };
}

export function serializeLayout(document: LayoutDocument): string {
  return JSON.stringify({ version: document.version, items: document.items }, null, 2);
}

function parseItem(value: unknown, bounds: LayoutBounds, used: Set<string>): LayoutItem | null {
  if (!isRecord(value) || !isFurnitureKind(value.kind)) return null;
  if (!isFiniteNumber(value.x) || !isFiniteNumber(value.y)) return null;
  const point = clampToRoom(value.x, value.y, bounds);
  const id =
    typeof value.id === 'string' && value.id.length > 0 && !used.has(value.id)
      ? value.id
      : nextItemId(used, value.kind);
  return {
    id,
    kind: value.kind,
    x: point.x,
    y: point.y,
    rotation: normalizeRotation(isFiniteNumber(value.rotation) ? value.rotation : 0),
  };
}

/**
 * Reads a layout file defensively. A document that cannot be used at all yields
 * a reason; individual unusable entries are counted in `skipped` and dropped,
 * and finite out-of-room coordinates are clamped rather than discarded.
 */
export function parseLayout(raw: string, bounds: LayoutBounds): ParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { document: null, reason: 'The file is not valid JSON.', skipped: 0 };
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.items)) {
    return { document: null, reason: 'The file is not a layout document.', skipped: 0 };
  }
  if (parsed.version !== LAYOUT_VERSION) {
    return {
      document: null,
      reason: `Unsupported layout version ${String(parsed.version)}; this build reads version ${LAYOUT_VERSION}.`,
      skipped: 0,
    };
  }
  const used = new Set<string>();
  const items: LayoutItem[] = [];
  let skipped = 0;
  for (const entry of parsed.items) {
    const item = parseItem(entry, bounds, used);
    if (item === null) {
      skipped += 1;
      continue;
    }
    used.add(item.id);
    items.push(item);
  }
  return { document: { version: LAYOUT_VERSION, items }, reason: null, skipped };
}
