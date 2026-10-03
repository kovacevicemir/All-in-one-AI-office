/**
 * Runs the test groups defined in `scripts/test-groups.ts`, one Vitest project
 * at a time, and fails when any group exceeds its budget.
 *
 * Usage (wired into package.json):
 *
 *   npm test                     every group, budget-enforced
 *   npm run test:changed         only groups affected by working-tree changes
 *   npm run test:group -- web    one group
 *   npm run test:list            show the groups
 *
 * Why a wrapper instead of `vitest run`: Vitest has no per-project time budget,
 * so a group can quietly grow past 30 seconds. This script measures each group
 * and the hard `MAX_TEST_TIMEOUT_MS` cap, so both rules in
 * `docs/engineering-guidelines.md` §3 are machine-checked.
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_GROUP_NAMES,
  MAX_TEST_TIMEOUT_MS,
  TEST_BUDGET_MS,
  TEST_GROUPS,
  assertGroupName,
  groupsForFiles,
} from './test-groups.js';

const VITEST = fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url));

interface Failure {
  group: string;
  reason: string;
}

function changedFiles(): string[] {
  const files = new Set<string>();
  for (const args of [
    ['diff', '--name-only', 'HEAD'],
    ['ls-files', '--others', '--exclude-standard'],
  ]) {
    const result = spawnSync('git', args, { encoding: 'utf8' });
    if (result.status !== 0) continue;
    for (const line of result.stdout.split('\n')) {
      const file = line.trim();
      if (file.length > 0) files.add(file);
    }
  }
  return [...files];
}

function selectGroups(argv: string[]): string[] {
  if (argv.includes('--list') || argv.includes('--help')) {
    for (const group of TEST_GROUPS) {
      const suffix = group.optIn === true ? ' (opt-in)' : '';
      process.stdout.write(`  ${group.name.padEnd(11)} ${group.description}${suffix}\n`);
    }
    process.stdout.write(`\nBudget: ${TEST_BUDGET_MS / 1000}s per group, ${MAX_TEST_TIMEOUT_MS / 1000}s hard cap.\n`);
    process.exit(0);
  }

  const explicit: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] !== '--group') continue;
    const name = argv[i + 1];
    if (name === undefined) throw new Error('--group needs a name');
    assertGroupName(name);
    explicit.push(name);
    i += 1;
  }
  if (explicit.length > 0) return TEST_GROUPS.map((g) => g.name).filter((n) => explicit.includes(n));

  if (argv.includes('--changed')) {
    const files = changedFiles();
    const groups = groupsForFiles(files);
    process.stdout.write(
      files.length === 0
        ? 'No working-tree changes; running the gates only.\n'
        : `Changed files (${files.length}) map to: ${groups.join(', ')}\n`,
    );
    return groups;
  }

  return [...DEFAULT_GROUP_NAMES];
}

/** Runs one group and returns its duration, or a failure when it overruns. */
function runGroup(name: string): { ms: number; failure?: Failure } {
  const optIn = TEST_GROUPS.find((group) => group.name === name)?.optIn === true;
  const start = Date.now();
  const result = spawnSync(process.execPath, [VITEST, 'run', '--project', name], {
    stdio: 'inherit',
    timeout: MAX_TEST_TIMEOUT_MS,
  });
  const ms = Date.now() - start;
  const spawnError = result.error as NodeJS.ErrnoException | undefined;
  if (spawnError?.code === 'ETIMEDOUT') {
    return { ms, failure: { group: name, reason: `exceeded the ${MAX_TEST_TIMEOUT_MS / 1000}s hard cap` } };
  }
  if (result.status !== 0) {
    return { ms, failure: { group: name, reason: `vitest exited with code ${result.status ?? 'unknown'}` } };
  }
  if (!optIn && ms > TEST_BUDGET_MS) {
    return { ms, failure: { group: name, reason: `took ${(ms / 1000).toFixed(1)}s (budget ${TEST_BUDGET_MS / 1000}s)` } };
  }
  return { ms };
}

const groups = selectGroups(process.argv.slice(2));

process.stdout.write(`\nTest groups: ${groups.join(', ')}\n`);
const durations: Array<{ name: string; ms: number }> = [];
const failures: Failure[] = [];

for (const name of groups) {
  process.stdout.write(`\n=== ${name} ===\n`);
  const { ms, failure } = runGroup(name);
  durations.push({ name, ms });
  if (failure !== undefined) failures.push(failure);
}

process.stdout.write('\nGroup timings\n');
for (const { name, ms } of durations) {
  const optIn = TEST_GROUPS.find((group) => group.name === name)?.optIn === true;
  const overBudget = !optIn && ms > TEST_BUDGET_MS;
  process.stdout.write(`  ${name.padEnd(11)} ${(ms / 1000).toFixed(1)}s${overBudget ? ' OVER BUDGET' : ''}\n`);
}

if (failures.length > 0) {
  process.stdout.write('\nTest budget failures\n');
  for (const failure of failures) process.stdout.write(`  ${failure.group}: ${failure.reason}\n`);
  process.exit(1);
}
