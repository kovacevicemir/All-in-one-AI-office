import { describe, expect, it } from 'vitest';
import {
  LAYOUT_STORAGE_KEY,
  loadLayout,
  saveLayout,
  type LayoutStorage,
} from '../src/office/layout-storage.js';
import { addItem, layoutBounds, type LayoutBounds } from '../src/office/layout-document.js';
import { defaultLayout } from '../src/office/default-layout.js';
import { memoryStorage } from './layout-fakes.js';
import { agentView, department } from './fixtures.js';

const BOUNDS: LayoutBounds = { minX: -50, maxX: 50, minY: -50, maxY: 50 };

function defaultDocument() {
  const engineering = department('Engineering');
  return defaultLayout([agentView({ id: 'a', departmentId: engineering.id })], [engineering]);
}

describe('layout storage', () => {
  it('round-trips a document under its own key', () => {
    const storage = memoryStorage();
    const document = addItem(defaultDocument(), 'chair', 1, 2, BOUNDS);
    saveLayout(storage, document);
    expect(storage.values[LAYOUT_STORAGE_KEY]).toBeTypeOf('string');
    expect(loadLayout(storage, defaultDocument(), BOUNDS)).toEqual(document);
  });

  it('falls back to the default when nothing is stored', () => {
    const fallback = defaultDocument();
    expect(loadLayout(memoryStorage(), fallback, BOUNDS)).toEqual(fallback);
  });

  it('falls back to the default on malformed stored data', () => {
    const fallback = defaultDocument();
    const storage = memoryStorage({ [LAYOUT_STORAGE_KEY]: '{not json' });
    expect(loadLayout(storage, fallback, BOUNDS)).toEqual(fallback);
    const wrongVersion = memoryStorage({ [LAYOUT_STORAGE_KEY]: '{"version":9,"items":[]}' });
    expect(loadLayout(wrongVersion, fallback, BOUNDS)).toEqual(fallback);
  });

  it('does not throw when the store is unavailable', () => {
    const broken: LayoutStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    const fallback = defaultDocument();
    expect(loadLayout(broken, fallback, BOUNDS)).toEqual(fallback);
    expect(() => saveLayout(broken, fallback)).not.toThrow();
  });

  it('keeps an intentionally empty layout instead of falling back', () => {
    const storage = memoryStorage({
      [LAYOUT_STORAGE_KEY]: JSON.stringify({ version: 1, items: [] }),
    });
    expect(loadLayout(storage, defaultDocument(), BOUNDS).items).toEqual([]);
  });

  it('exposes bounds the default document fits inside', () => {
    const document = defaultDocument();
    const bounds = layoutBounds(document);
    for (const item of document.items) {
      expect(item.x).toBeGreaterThanOrEqual(bounds.minX);
      expect(item.x).toBeLessThanOrEqual(bounds.maxX);
      expect(item.y).toBeGreaterThanOrEqual(bounds.minY);
      expect(item.y).toBeLessThanOrEqual(bounds.maxY);
    }
  });
});
