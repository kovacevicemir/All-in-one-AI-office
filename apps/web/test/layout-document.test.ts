import { describe, expect, it } from 'vitest';
import {
  LAYOUT_VERSION,
  addItem,
  clampToRoom,
  layoutBounds,
  moveItem,
  normalizeRotation,
  parseLayout,
  removeItem,
  rotateItem,
  serializeLayout,
  type LayoutBounds,
  type LayoutDocument,
} from '../src/office/layout-document.js';
import { FURNITURE_KINDS } from '../src/office/floorplan.js';

const BOUNDS: LayoutBounds = { minX: -10, maxX: 10, minY: -8, maxY: 8 };

const empty = (): LayoutDocument => ({ version: LAYOUT_VERSION, items: [] });

describe('layout document shape', () => {
  it('uses exactly the existing furniture kinds and the current version', () => {
    expect(LAYOUT_VERSION).toBe(1);
    expect([...FURNITURE_KINDS]).toEqual([
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
    ]);
  });
});

describe('pure layout operations', () => {
  it('adds items with unique stable ids and a zero rotation', () => {
    let document = empty();
    document = addItem(document, 'desk', 1, 2, BOUNDS);
    document = addItem(document, 'desk', 3, 4, BOUNDS);
    document = addItem(document, 'plant', 0, 0, BOUNDS);

    expect(document.items.map((item) => item.id)).toEqual(['desk_1', 'desk_2', 'plant_1']);
    expect(document.items.every((item) => item.rotation === 0)).toBe(true);
    expect(new Set(document.items.map((item) => item.id)).size).toBe(3);
  });

  it('clamps a new item to every edge of the room', () => {
    const cases: [number, number, { x: number; y: number }][] = [
      [-100, 0, { x: BOUNDS.minX, y: 0 }],
      [100, 0, { x: BOUNDS.maxX, y: 0 }],
      [0, -100, { x: 0, y: BOUNDS.minY }],
      [0, 100, { x: 0, y: BOUNDS.maxY }],
    ];
    for (const [x, y, expected] of cases) {
      const [item] = addItem(empty(), 'chair', x, y, BOUNDS).items;
      expect({ x: item?.x, y: item?.y }).toEqual(expected);
    }
    expect(clampToRoom(0, 0, BOUNDS)).toEqual({ x: 0, y: 0 });
  });

  it('moves only the named item and clamps the move', () => {
    let document = addItem(empty(), 'desk', 1, 1, BOUNDS);
    document = addItem(document, 'plant', 2, 2, BOUNDS);
    const moved = moveItem(document, 'desk_1', 100, -100, BOUNDS);

    expect(moved.items[0]).toMatchObject({ x: BOUNDS.maxX, y: BOUNDS.minY });
    expect(moved.items[1]).toEqual(document.items[1]);
  });

  it('adds at each of the four orientations', () => {
    for (const rotation of [0, 1, 2, 3]) {
      const [item] = addItem(empty(), 'chair', 0, 0, BOUNDS, rotation).items;
      expect(item?.rotation, `rotation ${rotation}`).toBe(rotation);
    }
    expect(addItem(empty(), 'chair', 0, 0, BOUNDS, 5).items[0]?.rotation).toBe(1);
    expect(addItem(empty(), 'chair', 0, 0, BOUNDS, -1).items[0]?.rotation).toBe(3);
  });

  it('rotates by a quarter turn and wraps through four steps', () => {
    let document = addItem(empty(), 'chair', 0, 0, BOUNDS);
    document = rotateItem(document, 'chair_1');
    expect(document.items[0]?.rotation).toBe(1);
    document = rotateItem(document, 'chair_1', 5);
    expect(document.items[0]?.rotation).toBe(2);
    expect(normalizeRotation(-1)).toBe(3);
    expect(normalizeRotation(4)).toBe(0);
  });

  it('removes the named item and leaves the rest', () => {
    let document = addItem(empty(), 'desk', 0, 0, BOUNDS);
    document = addItem(document, 'chair', 1, 1, BOUNDS);
    const removed = removeItem(document, 'desk_1');
    expect(removed.items.map((item) => item.id)).toEqual(['chair_1']);
  });
});

describe('serialise and parse', () => {
  it('round-trips a document', () => {
    let document = addItem(empty(), 'desk', 1.5, -2.25, BOUNDS);
    document = rotateItem(document, 'desk_1');
    const parsed = parseLayout(serializeLayout(document), BOUNDS);
    expect(parsed.reason).toBeNull();
    expect(parsed.skipped).toBe(0);
    expect(parsed.document).toEqual(document);
  });

  it('rejects a file that is not a layout document', () => {
    for (const raw of ['not json', '42', 'null', '{"hello":true}']) {
      const parsed = parseLayout(raw, BOUNDS);
      expect(parsed.document, raw).toBeNull();
      expect(parsed.reason, raw).toBeTypeOf('string');
    }
  });

  it('reports an unsupported version instead of guessing', () => {
    const parsed = parseLayout('{"version":99,"items":[]}', BOUNDS);
    expect(parsed.document).toBeNull();
    expect(parsed.reason).toContain('Unsupported layout version 99');
  });

  it('skips an unknown kind and keeps the rest', () => {
    const raw = JSON.stringify({
      version: LAYOUT_VERSION,
      items: [
        { id: 'a', kind: 'spaceship', x: 0, y: 0, rotation: 0 },
        { id: 'b', kind: 'desk', x: 1, y: 2, rotation: 0 },
        { id: 'c', kind: 'chair', x: null, y: 0, rotation: 0 },
      ],
    });
    const parsed = parseLayout(raw, BOUNDS);
    expect(parsed.skipped).toBe(2);
    expect(parsed.document?.items).toEqual([
      { id: 'b', kind: 'desk', x: 1, y: 2, rotation: 0 },
    ]);
  });

  it('clamps out-of-room coordinates and renames duplicate ids', () => {
    const raw = JSON.stringify({
      version: LAYOUT_VERSION,
      items: [
        { id: 'same', kind: 'desk', x: 100, y: -100, rotation: 7 },
        { id: 'same', kind: 'desk', x: 0, y: 0, rotation: 0 },
      ],
    });
    const parsed = parseLayout(raw, BOUNDS);
    expect(parsed.document?.items[0]).toMatchObject({
      id: 'same',
      x: BOUNDS.maxX,
      y: BOUNDS.minY,
      rotation: 3,
    });
    expect(parsed.document?.items[1]?.id).toBe('desk_1');
  });

  it('derives padded bounds from a document', () => {
    const document: LayoutDocument = {
      version: LAYOUT_VERSION,
      items: [
        { id: 'a', kind: 'desk', x: -3, y: 4, rotation: 0 },
        { id: 'b', kind: 'plant', x: 5, y: -2, rotation: 0 },
      ],
    };
    expect(layoutBounds(document)).toEqual({ minX: -5, maxX: 7, minY: -4, maxY: 6 });
  });
});
