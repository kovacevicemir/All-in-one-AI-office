import type { LayoutFilePort } from '../src/office/layout-file.js';
import type { LayoutStorage } from '../src/office/layout-storage.js';

export function memoryStorage(
  seed: Record<string, string> = {},
): LayoutStorage & { values: Record<string, string> } {
  const values = { ...seed };
  return {
    values,
    getItem: (key) => values[key] ?? null,
    setItem: (key, value) => {
      values[key] = value;
    },
  };
}

export interface MemoryLayoutFile extends LayoutFilePort {
  exported: { name: string; text: string }[];
  /** The text the next `importFile` resolves to; null models a cancelled pick. */
  nextImport: string | null;
}

export function memoryLayoutFile(): MemoryLayoutFile {
  const state: MemoryLayoutFile = {
    exported: [],
    nextImport: null,
    exportFile(name, text) {
      state.exported.push({ name, text });
    },
    importFile() {
      return Promise.resolve(state.nextImport);
    },
  };
  return state;
}
