import { describe, expect, it } from 'vitest';
import { LAYOUT_FILE_NAME, applyImport, exportLayout, importLayout } from '../src/office/layout-file.js';
import { addItem, type LayoutBounds } from '../src/office/layout-document.js';
import { defaultLayout } from '../src/office/default-layout.js';
import { memoryLayoutFile } from './layout-fakes.js';
import { agentView, department } from './fixtures.js';

const BOUNDS: LayoutBounds = { minX: -50, maxX: 50, minY: -50, maxY: 50 };

function document() {
  const engineering = department('Engineering');
  const base = defaultLayout(
    [agentView({ id: 'a', departmentId: engineering.id })],
    [engineering],
  );
  return addItem(base, 'plant', 3, 3, BOUNDS);
}

describe('layout import and export', () => {
  it('round-trips the exported file back through import', async () => {
    const port = memoryLayoutFile();
    const original = document();
    exportLayout(port, original);

    expect(port.exported).toHaveLength(1);
    expect(port.exported[0]?.name).toBe(LAYOUT_FILE_NAME);
    port.nextImport = port.exported[0]?.text ?? null;

    const outcome = await importLayout(port, BOUNDS);
    expect(outcome.reason).toBeNull();
    expect(outcome.skipped).toBe(0);
    expect(outcome.document).toEqual(original);
  });

  it('reports a cancelled pick without an error', async () => {
    const outcome = await importLayout(memoryLayoutFile(), BOUNDS);
    expect(outcome).toEqual({ document: null, reason: null, skipped: 0 });
  });

  it('rejects each bad file with a specific reason', async () => {
    const cases: [string, RegExp][] = [
      ['not json', /not valid JSON/],
      ['{"hello":true}', /not a layout document/],
      ['{"version":9,"items":[]}', /Unsupported layout version/],
    ];
    for (const [text, expected] of cases) {
      const port = memoryLayoutFile();
      port.nextImport = text;
      const outcome = await importLayout(port, BOUNDS);
      expect(outcome.document, text).toBeNull();
      expect(outcome.reason, text).toMatch(expected);
    }
  });

  it('reports an unreadable file instead of throwing', async () => {
    const outcome = await importLayout(
      {
        exportFile: () => undefined,
        importFile: () => Promise.reject(new Error('blocked')),
      },
      BOUNDS,
    );
    expect(outcome.document).toBeNull();
    expect(outcome.reason).toContain('could not be read');
  });

  it('imports the known items and reports the skipped count', async () => {
    const port = memoryLayoutFile();
    port.nextImport = JSON.stringify({
      version: 1,
      items: [
        { id: 'a', kind: 'desk', x: 1, y: 1, rotation: 0 },
        { id: 'b', kind: 'ufo', x: 2, y: 2, rotation: 0 },
      ],
    });
    const outcome = await importLayout(port, BOUNDS);
    expect(outcome.document?.items).toHaveLength(1);
    expect(outcome.skipped).toBe(1);
  });

  it('leaves the current layout untouched when a file is refused', async () => {
    const current = document();
    const port = memoryLayoutFile();
    port.nextImport = '{"version":9,"items":[]}';
    const refused = applyImport(current, await importLayout(port, BOUNDS));
    expect(refused.document).toBe(current);
    expect(refused.status?.tone).toBe('error');
    expect(refused.status?.text).toContain('Unsupported layout version');
  });

  it('replaces the current layout and discloses skipped items on success', () => {
    const current = document();
    const next = addItem(current, 'plant', 1, 1, BOUNDS);
    const applied = applyImport(current, { document: next, reason: null, skipped: 2 });
    expect(applied.document).toBe(next);
    expect(applied.status?.tone).toBe('info');
    expect(applied.status?.text).toContain('2 unknown items skipped');
  });

  it('reports nothing for a cancelled import', () => {
    const current = document();
    const applied = applyImport(current, { document: null, reason: null, skipped: 0 });
    expect(applied.document).toBe(current);
    expect(applied.status).toBeNull();
  });
});
