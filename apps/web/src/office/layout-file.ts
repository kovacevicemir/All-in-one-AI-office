import {
  parseLayout,
  serializeLayout,
  type LayoutBounds,
  type LayoutDocument,
} from './layout-document.js';

export interface LayoutFilePort {
  exportFile(name: string, text: string): void;
  importFile(): Promise<string | null>;
}

export const LAYOUT_FILE_NAME = 'ai-office-layout.json';

export interface ImportOutcome {
  document: LayoutDocument | null;
  /** Why the file was refused, or null when it was cancelled or accepted. */
  reason: string | null;
  skipped: number;
}

/** Feedback shown after an import attempt. */
export interface ImportStatus {
  tone: 'info' | 'error';
  text: string;
}

/**
 * Decides what an import attempt does. A valid document replaces the current
 * layout; a refused one leaves it untouched; a cancelled pick does both
 * silently.
 */
export function applyImport(
  current: LayoutDocument,
  outcome: ImportOutcome,
): { document: LayoutDocument; status: ImportStatus | null } {
  if (outcome.document !== null) {
    const plural = outcome.skipped === 1 ? '' : 's';
    const skipped =
      outcome.skipped > 0 ? ` ${outcome.skipped} unknown item${plural} skipped.` : '';
    return { document: outcome.document, status: { tone: 'info', text: `Layout imported.${skipped}` } };
  }
  if (outcome.reason !== null) {
    return { document: current, status: { tone: 'error', text: outcome.reason } };
  }
  return { document: current, status: null };
}

export function exportLayout(
  port: LayoutFilePort,
  document: LayoutDocument,
  name = LAYOUT_FILE_NAME,
): void {
  port.exportFile(name, serializeLayout(document));
}

/**
 * Reads and validates a layout file. A cancelled picker resolves to no document
 * and no reason; a refused file reports a specific reason, and the caller keeps
 * its current layout.
 */
export async function importLayout(
  port: LayoutFilePort,
  bounds: LayoutBounds,
): Promise<ImportOutcome> {
  let text: string | null;
  try {
    text = await port.importFile();
  } catch {
    return { document: null, reason: 'The layout file could not be read.', skipped: 0 };
  }
  if (text === null) return { document: null, reason: null, skipped: 0 };
  const result = parseLayout(text, bounds);
  return { document: result.document, reason: result.reason, skipped: result.skipped };
}

/** Browser port: download a Blob and read a File. Tests inject a fake instead. */
export function browserLayoutFile(): LayoutFilePort {
  return {
    exportFile(name, text) {
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = name;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    },
    importFile() {
      return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'application/json,.json';
        input.addEventListener('change', () => {
          const file = input.files?.[0];
          if (file === undefined) {
            resolve(null);
            return;
          }
          file.text().then(resolve, () => resolve(null));
        });
        input.addEventListener('cancel', () => resolve(null));
        input.click();
      });
    },
  };
}
