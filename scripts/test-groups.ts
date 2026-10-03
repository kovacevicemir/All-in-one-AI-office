/**
 * Single source of truth for how the suite is split and how long it may take.
 *
 * Imported by `vitest.config.ts` (to declare one Vitest project per group) and
 * by `scripts/run-test-groups.ts` (to run and time those groups). Keeping the
 * split in one place means the editor, the CI script, and the docs cannot drift.
 *
 * The rules, enforced by `scripts/run-test-groups.ts` and `test/code-health.test.ts`:
 *
 * - Every group finishes in `TEST_BUDGET_MS`.
 * - No test or config declares a timeout above `MAX_TEST_TIMEOUT_MS`.
 *
 * See `docs/engineering-guidelines.md` §3.
 */

/** Wall-clock ceiling for one group. Groups longer than this must be split. */
export const TEST_BUDGET_MS = 30_000;

/** Absolute timeout ceiling for any single test or runner step, in ms. */
export const MAX_TEST_TIMEOUT_MS = 40_000;

/**
 * Hard project-wide ceiling for any timeout declared anywhere in the repo. No
 * command, script, test, or config may ask for longer than this. Enforced by
 * `test/code-health.test.ts`; agents must also keep their own tool timeouts at
 * or below it (see `AGENTS.md`).
 */
export const ABSOLUTE_TIMEOUT_MS = 60_000;

export interface TestGroup {
  /** Vitest project name and the value passed to `--project` / `--group`. */
  readonly name: string;
  /** Human-readable scope, printed by `npm run test:list`. */
  readonly description: string;
  /** Vitest `include` globs owned by this group. */
  readonly include: readonly string[];
  /** Vitest `exclude` globs, used to keep slow opt-in tests out of a group. */
  readonly exclude?: readonly string[];
  /**
   * Opt-in groups are skipped by a plain `npm test` and by `--changed`; run
   * them with `npm run test:group -- <name>`. Their wall time is still capped.
   */
  readonly optIn?: boolean;
}

/**
 * The groups, ordered from cheapest and most global to slowest and most local.
 * A file belongs to exactly one group; the mapping below decides which other
 * groups a change to it can reach.
 */
export const TEST_GROUPS: readonly TestGroup[] = [
  {
    name: 'gates',
    description: 'Architecture, dependency direction, and code-health budgets',
    include: ['test/**/*.test.ts'],
  },
  {
    name: 'contracts',
    description: 'Shared zod schemas at the API boundary',
    include: ['packages/contracts/test/**/*.test.ts'],
  },
  {
    name: 'core',
    description: 'Pure domain logic and ports (no I/O)',
    include: ['packages/core/test/**/*.test.ts'],
  },
  {
    name: 'adapters',
    description: 'Vendor adapters behind the ports',
    include: ['packages/adapter-*/test/**/*.test.ts'],
  },
  {
    name: 'runtime',
    description: 'HTTP + WebSocket runtime and composition root',
    include: ['apps/runtime/test/**/*.test.ts'],
    exclude: ['apps/runtime/test/real-pi-smoke.test.ts'],
  },
  {
    name: 'web',
    description: 'React UI and office view (jsdom via per-file pragma)',
    include: ['apps/web/test/**/*.test.ts', 'apps/web/test/**/*.test.tsx'],
    exclude: ['apps/web/test/voice-smoke.test.ts'],
  },
  {
    name: 'smoke',
    description: 'Opt-in real PI + DeepSeek check; needs AI_OFFICE_REAL_SMOKE=1 and DEEPSEEK_API_KEY',
    include: ['apps/runtime/test/real-pi-smoke.test.ts'],
    optIn: true,
  },
  {
    name: 'voice-smoke',
    description: 'Opt-in real Whisper transcription; needs AI_OFFICE_VOICE_SMOKE=1',
    include: ['apps/web/test/voice-smoke.test.ts'],
    optIn: true,
  },
];

export const TEST_GROUP_NAMES: readonly string[] = TEST_GROUPS.map((group) => group.name);

/** Throws when a group name is not one of `TEST_GROUPS`. */
export function assertGroupName(name: string): void {
  if (!TEST_GROUP_NAMES.includes(name)) {
    throw new Error(`unknown test group "${name}" (known: ${TEST_GROUP_NAMES.join(', ')})`);
  }
}

/**
 * Groups a changed file can reach, following the dependency direction in
 * `docs/engineering-guidelines.md` §4. `gates` is added for every change
 * because it scans the whole repository and takes under a second.
 */
export function groupsForPath(path: string): string[] {
  const file = path.replace(/\\/g, '/').replace(/^\.\//, '');

  if (file.startsWith('apps/web/')) return ['web'];
  if (file.startsWith('apps/runtime/')) return ['runtime'];
  if (file.startsWith('packages/contracts/')) {
    return ['contracts', 'core', 'adapters', 'runtime', 'web'];
  }
  if (file.startsWith('packages/core/')) return ['core', 'adapters', 'runtime'];
  if (file.startsWith('packages/adapter-')) return ['adapters', 'runtime'];
  if (file.startsWith('packages/')) return ['core', 'adapters', 'runtime', 'web'];
  if (file.startsWith('apps/')) return ['runtime', 'web'];

  // Root tooling, docs, and configs: the gates are cheap and repo-wide.
  return ['gates'];
}

/** Ordered, de-duplicated groups to run for a set of changed files. */
export function groupsForFiles(files: readonly string[]): string[] {
  const chosen = new Set<string>(['gates']);
  for (const file of files) {
    for (const group of groupsForPath(file)) chosen.add(group);
  }
  return TEST_GROUP_NAMES.filter(
    (name) => chosen.has(name) && !TEST_GROUPS.find((group) => group.name === name)?.optIn,
  );
}

/** Groups a plain `npm test` runs: everything except opt-in groups. */
export const DEFAULT_GROUP_NAMES: readonly string[] = TEST_GROUPS.filter(
  (group) => group.optIn !== true,
).map((group) => group.name);
