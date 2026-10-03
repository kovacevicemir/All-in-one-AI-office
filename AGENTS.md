# AGENTS.md

Instructions for AI coding agents working in this repository. Keep this file short;
put detail in [`docs/engineering-guidelines.md`](docs/engineering-guidelines.md).

## What this is

"All in one AI office": a local-first 3D office where each agent worker is a bot that
drives a real terminal session through a CLI coding harness. TypeScript end to end,
React for UI, vendor-neutral by design.

## Start here, in this order

1. [`docs/engineering-guidelines.md`](docs/engineering-guidelines.md) — the rules.
   Read §1 (rule of thumb), §2 (complexity numbers), §3 (testability), §4
   (architecture).
2. [`openspec/`](openspec) — the specs. **This is the source of truth for behaviour.**
3. `openspec/changes/add-ai-office-mvp/` — the baseline change: `proposal.md`,
   `design.md`, `tasks.md`, and the five capability specs.

## Three rules that are not negotiable

**1. Spec-driven development.** No behaviour change without a spec change.

```
/opsx-propose "<idea>"   # proposal + delta specs + design + tasks
/opsx-apply              # implement against tasks.md
/opsx-archive            # merge delta specs into openspec/specs/
```

- Every task in `tasks.md` states how it is verified. Tick the box only when that
  verification actually passes.
- Land tests and docs in the same task group as the work that needs them. Never open
  a trailing "write tests" group.
- Run `openspec validate <change> --strict` before archiving.
- If the spec and the code disagree, the spec wins — or the spec is updated in the
  same change, deliberately.

**2. Complexity and testability budgets.** Enforced by `npm test`, so you will find
out immediately.

- Decision points per function ≤ 12, function length ≤ 95 lines, nesting ≤ 3,
  file ≤ 600 lines. Prefer early returns and lookup tables over nesting.
- If something needs a server, a browser, a clock, a network, or credentials to test,
  the design is wrong. Inject it through a port.
- No `any`, no unexplained `@ts-ignore`.

**3. Test speed budgets.** Every named test group finishes in under 30 seconds, and no
single timeout may exceed 40 seconds. The groups live in `scripts/test-groups.ts`; the
`npm test` runner times each one and fails when a group overruns. Keep groups small;
split rather than tolerate a slow one, and never pass a test command a timeout longer
than 40 seconds.

## Timeouts — hard cap

**Never pass a timeout longer than 60 seconds to any command.** Not 120, not 180, not
"it might be slow". A command that has not finished in 60s is hung: stop it, report it,
and change the approach. Prefer 5–30s for anything that should be quick. The only way
to exceed 60s is a single, explicit instruction from the user for that one command —
and then only for that command.

This is machine-checked at project level: `test/code-health.test.ts` fails if any file
in the repo declares a timeout above `ABSOLUTE_TIMEOUT_MS` (60s, in
`scripts/test-groups.ts`). Test timeouts are capped tighter still, at 40s.

## Architecture invariants (enforced by `test/architecture.test.ts`)

```
contracts ← core ← adapters ← apps/runtime
       ↑
    apps/web          (contracts only)
```

- `packages/core` is pure: no I/O, no vendor names, no framework.
- `apps/runtime` is the only place that knows which vendors exist.
- `apps/web` talks to the runtime only through `packages/contracts`.
- Adding a harness or model vendor = one new adapter package + one registry line.
  Never a change to core, the API contract, or the UI.

## Commands

```bash
npm install          # Node >= 22.6
npm test             # every group, timed and budget-checked (< 30s each)
npm run test:changed # only the groups your working-tree changes can reach
npm run test:group -- core   # one group
npm run test:list    # groups and the budget
npm run typecheck
npm run dev          # runtime on :4317, web on :5173
```

`npm start` runs the runtime alone. PI must be on `PATH` for real runs;
`DEEPSEEK_API_KEY` goes in `.env` (see `.env.example`).

## While working

- Read the relevant spec before editing the code it governs.
- While implementing, run `npm run test:changed` (or the one relevant group) instead of
  the whole suite; run `npm test` before ticking the group's final task.
- Prefer deleting code to adding it; reuse `packages/adapter-fake` for test doubles.
- Keep new files under the budgets before you write them, not after.
- If you must exceed a budget, add a documented, ceiling-capped exception to the
  relevant list in `test/code-health.test.ts` — never by raising the global limit.
- Don't add a dependency for something the platform already provides.
- Update `tasks.md` checkboxes as you go; the checkbox is the progress record.
