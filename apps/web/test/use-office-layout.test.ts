// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  layoutReducer,
  useOfficeLayout,
  type LayoutContext,
} from '../src/office/use-office-layout.js';
import { LAYOUT_VERSION, type LayoutDocument } from '../src/office/layout-document.js';
import { LAYOUT_STORAGE_KEY } from '../src/office/layout-storage.js';
import { memoryStorage } from './layout-fakes.js';

const DEFAULT: LayoutDocument = {
  version: LAYOUT_VERSION,
  items: [{ id: 'desk_1', kind: 'desk', x: 0, y: 0, rotation: 0 }],
};

const CONTEXT: LayoutContext = {
  bounds: { minX: -10, maxX: 10, minY: -10, maxY: 10 },
  defaultDocument: DEFAULT,
};

describe('layout reducer', () => {
  it('loads a replaced document', () => {
    const next: LayoutDocument = {
      version: LAYOUT_VERSION,
      items: [{ id: 'plant_1', kind: 'plant', x: 1, y: 1, rotation: 0 }],
    };
    expect(layoutReducer(DEFAULT, { type: 'replace', document: next }, CONTEXT)).toEqual(next);
  });

  it('edits the document for add, move, rotate and remove', () => {
    const added = layoutReducer(DEFAULT, { type: 'add', kind: 'chair', x: 2, y: 3 }, CONTEXT);
    expect(added.items).toHaveLength(2);
    expect(added.items[1]).toMatchObject({ id: 'chair_1', x: 2, y: 3, rotation: 0 });

    const moved = layoutReducer(added, { type: 'move', id: 'chair_1', x: 40, y: -40 }, CONTEXT);
    expect(moved.items[1]).toMatchObject({ x: 10, y: -10 });

    const rotated = layoutReducer(moved, { type: 'rotate', id: 'chair_1' }, CONTEXT);
    expect(rotated.items[1]?.rotation).toBe(1);

    const removed = layoutReducer(rotated, { type: 'remove', id: 'desk_1' }, CONTEXT);
    expect(removed.items.map((item) => item.id)).toEqual(['chair_1']);
  });

  it('resets to the default', () => {
    const edited = layoutReducer(DEFAULT, { type: 'add', kind: 'plant', x: 0, y: 0 }, CONTEXT);
    expect(layoutReducer(edited, { type: 'reset' }, CONTEXT)).toEqual(DEFAULT);
  });
});

describe('useOfficeLayout', () => {
  it('persists an edit and restores it for a later hook', () => {
    const storage = memoryStorage();
    const first = renderHook(() => useOfficeLayout([], [], storage));
    const before = first.result.current.document.items.length;

    act(() => {
      first.result.current.dispatch({ type: 'add', kind: 'chair', x: 0, y: 0 });
    });
    expect(first.result.current.document.items).toHaveLength(before + 1);
    expect(storage.values[LAYOUT_STORAGE_KEY]).toBeTypeOf('string');
    first.unmount();

    const second = renderHook(() => useOfficeLayout([], [], storage));
    expect(second.result.current.document.items).toHaveLength(before + 1);
  });

  it('resets the working layout to the default', () => {
    const storage = memoryStorage();
    const { result } = renderHook(() => useOfficeLayout([], [], storage));
    const original = result.current.document;

    act(() => {
      result.current.dispatch({ type: 'add', kind: 'plant', x: 0, y: 0 });
    });
    expect(result.current.document.items.length).toBe(original.items.length + 1);

    act(() => {
      result.current.reset();
    });
    expect(result.current.document.items.length).toBe(original.items.length);
  });

  it('works with no storage at all', () => {
    const { result } = renderHook(() => useOfficeLayout([], [], null));
    act(() => {
      result.current.dispatch({ type: 'add', kind: 'stool', x: 1, y: 1 });
    });
    expect(result.current.document.items.some((item) => item.kind === 'stool')).toBe(true);
  });
});
