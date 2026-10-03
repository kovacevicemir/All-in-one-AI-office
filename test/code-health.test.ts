import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Dependency-free enforcement of the numeric budgets in
 * docs/engineering-guidelines.md.
 *
 * Why not ESLint: `typescript-eslint` does not yet support the TypeScript 7
 * toolchain this repo uses, and TypeScript 7 removed the classic compiler API,
 * so a compiler-plugin check is not available either. These checks are the
 * reliable subset that can be measured from source text alone. Per-function
 * cognitive complexity stays a review criterion until ESLint support lands.
 */
const BUDGETS = {
  /** Lines in one source file. Files this long are doing too much. */
  maxFileLines: 600,
  /** Maximum `{}` nesting in one file — proxy for deeply nested logic. */
  maxBraceDepth: 7,
  /** Every workspace with a src/ directory must ship tests. */
  requireTests: true,
} as const;

/**
 * Documented, shrink-only baseline. Nothing may be added here without a reason
 * and an explicit size ceiling; entries are expected to disappear, not grow.
 */
const LARGE_FILE_EXCEPTIONS: Record<string, { reason: string; ceiling: number }> = {
  'packages/core/src/office.ts': {
    reason:
      'Known outlier. Split the run loop into run-loop.ts and the read-model derivation into derive.ts. Tracked in tasks.md.',
    ceiling: 1100,
  },
};

/**
 * `adapter-fake` is itself a test double: every other package tests against it,
 * so demanding its own tests would be circular.
 */
const NO_TESTS_EXCEPTIONS = ['packages/adapter-fake'];

const root = fileURLToPath(new URL('../', import.meta.url));
const WORKSPACE_GROUPS = ['packages', 'apps'];

interface ScanResult {
  file: string;
  lines: number;
  braceDepth: number;
  typedAny: string[];
  suppressions: string[];
}

/** Blanks out comments and string bodies so structural scanning is not fooled. */
export function stripNonCode(source: string): string {
  let out = '';
  let state: 'code' | 'line' | 'block' | 'single' | 'double' | 'template' = 'code';

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i] as string;
    const next = source[i + 1];

    if (state === 'code') {
      if (char === '/' && next === '/') {
        state = 'line';
        out += '  ';
        i += 1;
        continue;
      }
      if (char === '/' && next === '*') {
        state = 'block';
        out += '  ';
        i += 1;
        continue;
      }
      if (char === "'") {
        state = 'single';
        out += ' ';
        continue;
      }
      if (char === '"') {
        state = 'double';
        out += ' ';
        continue;
      }
      if (char === '`') {
        state = 'template';
        out += ' ';
        continue;
      }
      out += char;
      continue;
    }

    if (state === 'line') {
      if (char === '\n') {
        state = 'code';
        out += '\n';
      } else {
        out += ' ';
      }
      continue;
    }

    if (state === 'block') {
      if (char === '*' && next === '/') {
        state = 'code';
        out += '  ';
        i += 1;
        continue;
      }
      out += char === '\n' ? '\n' : ' ';
      continue;
    }

    // Inside a string: keep newlines (line numbers stay honest), drop content.
    if (char === '\\') {
      out += '  ';
      i += 1;
      continue;
    }
    if (
      (state === 'single' && char === "'") ||
      (state === 'double' && char === '"') ||
      (state === 'template' && char === '`')
    ) {
      state = 'code';
    }
    out += char === '\n' ? '\n' : ' ';
  }

  return out;
}

export function scan(file: string, source: string): ScanResult {
  const code = stripNonCode(source);
  let depth = 0;
  let maxDepth = 0;
  for (const char of code) {
    if (char === '{') {
      depth += 1;
      maxDepth = Math.max(maxDepth, depth);
    } else if (char === '}') {
      depth -= 1;
    }
  }

  const typedAny: string[] = [];
  const suppressions: string[] = [];
  const codeLines = code.split('\n');
  const rawLines = source.split('\n');
  codeLines.forEach((line, index) => {
    if (/(^|[\s(,:<[])(any|any\[\])([\s),;>\]|&]|$)/.test(line) && !/\b(company|many)\b/i.test(line)) {
      typedAny.push(`${index + 1}: ${rawLines[index]?.trim() ?? ''}`);
    }
    if (/@ts-(ignore|expect-error)/.test(line) && !/--/.test(line)) {
      suppressions.push(`${index + 1}: ${rawLines[index]?.trim() ?? ''}`);
    }
  });

  return {
    file: relative(root, file),
    lines: rawLines.length,
    braceDepth: maxDepth,
    typedAny,
    suppressions,
  };
}

async function collectSources(): Promise<{ sources: string[]; testFiles: string[] }> {
  const sources: string[] = [];
  const testFiles: string[] = [];

  for (const group of WORKSPACE_GROUPS) {
    const base = join(root, group);
    let workspaces: string[];
    try {
      workspaces = await readdir(base);
    } catch {
      continue;
    }
    for (const workspace of workspaces) {
      for (const kind of ['src', 'test'] as const) {
        const dir = join(base, workspace, kind);
        let entries: string[];
        try {
          entries = await readdir(dir, { recursive: true });
        } catch {
          continue;
        }
        for (const entry of entries) {
          if (!/\.tsx?$/.test(entry)) continue;
          const full = join(dir, entry);
          if (kind === 'src') sources.push(full);
          else testFiles.push(full);
        }
      }
    }
  }

  // Root-level architectural tests live outside the workspace globs.
  const rootTests = await readdir(join(root, 'test')).catch(() => [] as string[]);
  for (const entry of rootTests) {
    if (/\.test\.tsx?$/.test(entry)) testFiles.push(join(root, 'test', entry));
  }

  return { sources, testFiles };
}

describe('code health budgets', () => {
  it('scans a realistic sample of source, not an empty set', async () => {
    const { sources, testFiles } = await collectSources();
    expect(sources.length).toBeGreaterThan(15);
    expect(testFiles.length).toBeGreaterThan(5);
  });

  it('keeps files short and logic shallow', async () => {
    const { sources } = await collectSources();
    const problems: string[] = [];

    for (const file of sources) {
      const result = scan(file, await readFile(file, 'utf8'));
      const exception = LARGE_FILE_EXCEPTIONS[result.file.replace(/\\/g, '/')];
      const ceiling = exception?.ceiling ?? BUDGETS.maxFileLines;
      if (result.lines > ceiling) {
        problems.push(
          `${result.file} is ${result.lines} lines (limit ${ceiling})${exception === undefined ? '' : ` — exception: ${exception.reason}`}`,
        );
      }
      if (result.braceDepth > BUDGETS.maxBraceDepth) {
        problems.push(
          `${result.file} nests braces ${result.braceDepth} deep (limit ${BUDGETS.maxBraceDepth}) — extract a helper`,
        );
      }
    }

    expect(problems, `\n${problems.join('\n')}\n`).toEqual([]);
  });

  it('keeps the source free of `any` and unexplained suppressions', async () => {
    const { sources } = await collectSources();
    const problems: string[] = [];

    for (const file of sources) {
      const result = scan(file, await readFile(file, 'utf8'));
      for (const hit of result.typedAny) problems.push(`${result.file}:${hit} uses \`any\`; type it properly`);
      for (const hit of result.suppressions) {
        problems.push(`${result.file}:${hit} suppresses the type checker without a reason comment`);
      }
    }

    expect(problems, `\n${problems.join('\n')}\n`).toEqual([]);
  });

  it('requires every workspace that ships code to ship tests', async () => {
    if (!BUDGETS.requireTests) return;
    const { sources, testFiles } = await collectSources();
    const withCode = new Set(sources.map((file) => relative(root, file).split(/[\\/]/).slice(0, 2).join('/')));
    const withTests = new Set(
      testFiles.map((file) => relative(root, file).split(/[\\/]/).slice(0, 2).join('/')),
    );

    const missing = [...withCode].filter(
      (workspace) => !withTests.has(workspace) && !NO_TESTS_EXCEPTIONS.includes(workspace),
    );
    expect(missing, `\nworkspaces without tests: ${missing.join(', ')}\n`).toEqual([]);
  });

  it('keeps the documented exceptions honest and shrinking', async () => {
    const { sources } = await collectSources();
    const present = new Set(sources.map((file) => relative(root, file).replace(/\\/g, '/')));
    const stale = Object.keys(LARGE_FILE_EXCEPTIONS).filter((file) => !present.has(file));
    expect(stale, `\nstale exceptions to delete: ${stale.join(', ')}\n`).toEqual([]);
  });
});
