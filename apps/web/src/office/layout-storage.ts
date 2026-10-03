import {
  parseLayout,
  serializeLayout,
  type LayoutBounds,
  type LayoutDocument,
} from './layout-document.js';

export interface LayoutStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const LAYOUT_STORAGE_KEY = 'ai-office.layout.v1';

/**
 * Reads the saved layout, falling back to the default on missing, malformed, or
 * unavailable storage. A corrupt value must never stop the office rendering.
 */
export function loadLayout(
  storage: LayoutStorage,
  fallback: LayoutDocument,
  bounds: LayoutBounds,
  key = LAYOUT_STORAGE_KEY,
): LayoutDocument {
  try {
    const raw = storage.getItem(key);
    if (raw === null) return fallback;
    return parseLayout(raw, bounds).document ?? fallback;
  } catch {
    return fallback;
  }
}

/** Persistence is best effort: a full or blocked store must not break editing. */
export function saveLayout(
  storage: LayoutStorage,
  document: LayoutDocument,
  key = LAYOUT_STORAGE_KEY,
): void {
  try {
    storage.setItem(key, serializeLayout(document));
  } catch {
    return;
  }
}
