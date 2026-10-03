import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../', import.meta.url));

/** Allowed internal dependency edges (design D1). */
const ALLOWED: Record<string, string[]> = {
  contracts: [],
  core: ['contracts'],
  'adapter-fake': ['contracts', 'core'],
  'adapter-session': ['contracts', 'core'],
  'adapter-store-file': ['contracts', 'core'],
  'adapter-pi': ['contracts', 'core'],
};

const WORKSPACES = [
  ...Object.keys(ALLOWED).map((name) => ({ name, dir: join(root, 'packages', name) })),
  { name: 'runtime', dir: join(root, 'apps', 'runtime') },
  { name: 'web', dir: join(root, 'apps', 'web') },
];

async function internalImports(dir: string): Promise<Set<string>> {
  const found = new Set<string>();
  const src = join(dir, 'src');
  let entries: string[];
  try {
    entries = await readdir(src, { recursive: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    if (!/\.tsx?$/.test(entry)) continue;
    const text = await readFile(join(src, entry), 'utf8');
    for (const match of text.matchAll(/from '(@ai-office\/[a-z-]+)'/g)) {
      found.add(match[1]!.replace('@ai-office/', ''));
    }
  }
  return found;
}

describe('architecture: dependency direction', () => {
  it('enforces that core never depends on a vendor adapter', async () => {
    for (const workspace of WORKSPACES) {
      const imports = await internalImports(workspace.dir);
      const allowed = workspace.name === 'runtime' || workspace.name === 'web'
        ? workspace.name === 'web'
          ? ['contracts']
          : [...Object.keys(ALLOWED)]
        : ALLOWED[workspace.name] ?? [];

      for (const imported of imports) {
        expect(
          allowed.includes(imported),
          `${workspace.name} must not import @ai-office/${imported} (allowed: ${allowed.join(', ') || 'none'})`,
        ).toBe(true);
      }
    }
  });

  it('keeps vendor names out of core and contracts', async () => {
    for (const pkg of ['core', 'contracts']) {
      const src = join(root, 'packages', pkg, 'src');
      const entries = await readdir(src, { recursive: true });
      for (const entry of entries) {
        if (!/\.tsx?$/.test(entry)) continue;
        const text = await readFile(join(src, entry), 'utf8');
        for (const vendor of ['pi --mode', 'deepseek', 'node-pty', 'DataSeek']) {
          expect(
            text.toLowerCase().includes(vendor.toLowerCase()),
            `packages/${pkg}/src/${entry} mentions a vendor ("${vendor}")`,
          ).toBe(false);
        }
      }
    }
  });

  it('keeps the UI free of harness and model vendor specifics', async () => {
    const src = join(root, 'apps', 'web', 'src');
    let entries: string[] = [];
    try {
      entries = await readdir(src, { recursive: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!/\.tsx?$/.test(entry)) continue;
      const text = (await readFile(join(src, entry), 'utf8')).toLowerCase();
      for (const vendor of ['deepseek', "'pi'", 'node-pty', '@ai-office/adapter-']) {
        expect(text.includes(vendor), `apps/web/src/${entry} mentions a vendor ("${vendor}")`).toBe(
          false,
        );
      }
    }
  });
});
