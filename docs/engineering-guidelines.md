# Engineering Guidelines

The point of these rules is that the next person — human or agent — can change this
system quickly and know it still works. Everything here exists to serve that.

> Shorter version for agents: [AGENTS.md](../AGENTS.md). Specs live in
> [`openspec/`](../openspec). Behaviour changes go through a spec change first.

---

## 1. Rule of thumb

Read this list before writing code. Most review comments are one of these.

1. **Simplest thing that satisfies the spec.** Not the cleverest, not the most
   general. Generality is added when a second caller appears, not before.
2. **Optimise for the reader.** Code is read far more often than written. A clear
   name beats a short name. An explicit loop beats a dense reduce chain.
3. **If it needs a comment to explain it, extract it into a named function.** The
   name replaces the comment.
4. **Delete before adding.** Preferred order: delete → change → reuse → add. Every
   new file, dependency, and abstraction is a liability.
5. **Push I/O to the edges.** Logic lives in pure functions; the impure shell around
   them stays as thin as possible.
6. **Make illegal states unrepresentable.** Validate once at the boundary (zod in
   `packages/contracts`), then trust the type everywhere inside.
7. **Fail loudly.** A swallowed error is worse than a crash. If something is
   best-effort, say so in the name and the comment.
8. **No dead code, no commented-out code, no speculative flags.** Version control
   remembers.
9. **Leave the codebase more uniform than you found it.** One way to do a thing.
10. **Small diffs, one concern.** A refactor and a feature are two commits.

---

## 2. Cognitive complexity — the numbers

The hard rule: **a function should be readable in one screen, on one pass.** Every
threshold below exists to catch the moment that stops being true.

| Metric | Budget | Why |
|---|---|---|
| Decision points per function (if / loop / case / catch / `&&` / `\|\|` / `?:`) | **≤ 12** (gate allows 14) | Past ~12 branches, you can no longer hold the paths in your head. |
| Function length | **≤ 95 lines** | A long function is usually several functions wearing a trench coat. |
| Nested blocks (if/loop/switch/try) | **≤ 3 levels** | Nesting multiplies the mental stack; flat code is testable code. |
| Source file length | **≤ 600 lines** | Beyond that, the file has more than one reason to change. |

These are checked automatically by
[`test/code-health.test.ts`](../test/code-health.test.ts) on every `npm test`. The gate
uses source-text scanning because `typescript-eslint` does not yet support the
TypeScript 7 toolchain; when it does, swap the scan for
`sonarjs/cognitive-complexity` with the same numbers.

**Exceptions are allowed and must be documented.** Add an entry to
`LARGE_FILE_EXCEPTIONS` (or the equivalent list) with a reason and an explicit
ceiling. The gate fails on a *stale* exception, so the list can only shrink.

### Techniques that keep the number low

| Instead of | Do |
|---|---|
| `if (x) { ... 40 lines ... } else { ... }` | Return early: `if (!x) return ...;` then continue flat. |
| `if (state === 'a') ... else if (state === 'b') ...` chained | A lookup table: `const HANDLERS = { a: ..., b: ... }`. |
| A boolean parameter that switches behaviour | Two functions with two names. |
| Nested ternaries | A named variable, or an `if`. |
| `for` → `if` → `if` → `switch` | Extract the inner decision into a function, call it from the loop. |
| Null checks spread over 30 lines | Validate at the boundary; inside, the type is already non-null. |

Worked example from this repo — pressure derivation is one flat function with a
short guard, instead of nested branches:

```ts
export function computePressure({ percent, previous, thresholds }: PressureInput): ContextPressureLevel {
  if (percent === null || Number.isNaN(percent)) return 'unknown';

  const raw = rawLevel(percent, thresholds);
  if (previous === 'unknown' || RANK[raw] >= RANK[previous]) return raw;

  const margin = thresholds.hysteresis;
  if (previous === 'critical') return percent <= thresholds.critical - margin ? raw : 'critical';
  if (previous === 'warning') return percent <= thresholds.warning - margin ? raw : 'warning';
  return raw;
}
```

---

## 3. Testability — the rule of thumb

**If a function needs a running server, a real browser, a wall clock, a network, or
credentials to test, its design is wrong.** That is not a testing problem, it is a
design smell. Fix the design.

Concretely:

- **Inject what you cannot control.** Time, ids, HTTP, spawned processes, and file
  systems arrive through constructor options or parameters. See `OfficeOptions` in
  `packages/core/src/ports.ts`.
- **One port per thing that can vary.** `HarnessAdapter`, `ModelProvider`,
  `SpawnPort`, `StorePort`, `EventSink`. Adapters implement them; `core` only knows
  the interfaces.
- **Every workspace that ships `src/` ships tests.** Enforced by the code-health gate.
- **Test doubles are first-class and shared.** They live in
  `packages/adapter-fake`, not copied into each test file.
- **Test behaviour, not internals.** Reach for the public function or the rendered
  output, never a private helper.
- **Name tests after the spec scenario they cover**, so a failure points at a
  requirement: `it('unblocks dependents when the dependency completes')`.
- **Prefer many small tests over one integration monster.** The fast unit tests are
  the ones that actually get run.
- **Deterministic tests only.** No `sleep`, no real timers when fake ones work, no
  ordering assumptions. If a test is flaky, it is a bug in the code or the test —
  never "just rerun it".

The payoff is visible in this repo: the entire office — dependency graphs, context
pressure, run lifecycle, realtime events — is exercised in **under 2 seconds** with
no browser, no PI install, and no API key.

### Test speed budget

Tests are split into named groups in
[`scripts/test-groups.ts`](../scripts/test-groups.ts). **Every group finishes in under
30 seconds** — a group that outgrows the budget gets split, not tolerated. The
absolute ceiling for any single test or runner step is **40 seconds**; nothing may
declare a longer timeout.

| Command | Use |
|---|---|
| `npm test` | Every group, timed by `scripts/run-test-groups.ts`; fails when a group overruns. |
| `npm run test:changed` | Only the groups a working-tree change can reach, following §4. Use this while implementing. |
| `npm run test:group -- <name>` | One named group. |
| `npm run test:list` | The groups and the current budget. |

The [code-health gate](../test/code-health.test.ts) also fails on any timeout above 40
seconds, so the ceiling is machine-checked. Keep test counts honest: put a new test in
the smallest group that covers it, and do not let it push that group past 30 seconds.

The browser suite is grouped by spec for the same reason: run one at a time with
`npm run e2e:office`, `npm run e2e:office-2d`, or `npm run e2e:office-layout`. Each spec
must stay under 30 seconds, and its per-test timeout is already 30 seconds.

---

## 4. Architecture rules

Two rules are enforced by [`test/architecture.test.ts`](../test/architecture.test.ts),
not by convention. Breaking them fails `npm test`.

**Dependency direction:**

```
contracts  ←  core  ←  adapters  ←  apps/runtime
     ↑
  apps/web
```

- `packages/contracts` depends on nothing internal.
- `packages/core` may import `contracts` only.
- adapters may import `contracts` and `core`.
- `apps/runtime` is the composition root: the only place that knows which vendors
  exist.
- `apps/web` imports `contracts` and nothing else internal.

**No vendor names in the shared layers.** `core`, `contracts`, and `apps/web` must
not mention a harness or model vendor. Adding a vendor = a new adapter package plus
one registry line in `apps/runtime`.

**Agent profiles are vendor-neutral data.** A profile is a description (operator-facing,
never sent to the model) plus instructions (delivered to the harness). It is stored as
one markdown file per agent at `<AI_OFFICE_DATA_DIR>/agents/<agentId>.md`, with two
recognised sections:

```markdown
## Description

Tech lead for the payments squad.

## Instructions

You own the build. Run `npm test` before marking work done.
```

The parser and formatter are pure functions in `core`; persistence goes through
`StorePort.readAgentProfile` / `writeAgentProfile`. Limits are 500 characters for the
description and 20,000 for the instructions, enforced by the contract and again in the
domain. Only the adapter decides how instructions reach the harness (PI uses
`--append-system-prompt`), so core, the contract, and the UI stay vendor-free.

---

## 5. Code style

- TypeScript strict, ESM, `verbatimModuleSyntax` (use `import type`).
- `kebab-case` file names, `camelCase` functions and variables, `PascalCase` types
  and React components, `useX` for hooks.
- `.ts` for logic, `.tsx` only when the file contains JSX.
- No `any` in `src` (enforced). Prefer `unknown` at the boundary and narrow with zod.
- No `@ts-ignore` / `@ts-expect-error` without a reason comment on the same line
  (enforced).
- Exported functions carry a short doc comment when the *why* is not obvious from the
  signature.
- Errors crossing the API boundary use the `OfficeError` shape with a code from
  `ERROR_CODES`. Never invent a new ad-hoc shape.

---

## 6. Spec-driven development

This project is **spec-first**. `openspec/specs/` is the source of truth for what the
system does; code is an implementation of it.

The loop:

1. **Propose** — `/opsx-propose "<idea>"` (or `openspec new change <name>`). Produces
   `proposal.md`, delta specs, `design.md`, and `tasks.md`.
2. **Review** — the specs describe *observable behaviour*, the design describes *how*.
   Ambiguity that would change scope or acceptance gets resolved here, not in code.
3. **Apply** — `/opsx-apply`. Work through `tasks.md`, ticking boxes as their stated
   verification passes.
4. **Archive** — `/opsx-archive`. The delta specs merge into `openspec/specs/` and
   become the new baseline.

Rules for changes:

- **No behaviour change without a spec change.** If you cannot point at the
  requirement you are implementing, stop and write it.
- **Specs say *what*, designs say *how*.** A spec that mentions a library, a class, or
  a function name is a spec bug.
- **Land tests and docs in the same task group as the work that needs them.** A
  trailing "write tests" group means every failure cascades back through every group
  before it.
- **Every task states how it is verified.** "Implement X" is not a task;
  "Implement X, verified by <test/command/observable>" is.
- **Archive only when `openspec validate --strict` is clean.**

---

## 7. Security and secrets

- Secrets live in `.env` (git-ignored) and the host environment. `.env.example` is
  committed and documents every variable.
- Never log, persist, or return a credential. `packages/contracts` has no field for
  one, and a test asserts no API response contains a credential-shaped value.
- The runtime binds to `127.0.0.1` by default. Authorization is an explicit extension
  point, not an afterthought.
- Agents run real commands. By default the office passes no project-trust flag,
  so PI applies the same decision as an interactive run. `AI_OFFICE_APPROVE_PROJECT`
  forces the choice for unattended runs; `false` ignores project-local resources.

---

## 8. Commands

| Command | Purpose |
|---|---|
| `npm test` | All groups through the budget-enforcing runner (each group < 30s). |
| `npm run test:changed` | Only the groups the working-tree changes can reach. |
| `npm run test:group -- <name>` | One named group from `scripts/test-groups.ts`. |
| `npm run test:list` | List the groups and the per-group budget. |
| `npm run typecheck` | `tsc --noEmit` across every workspace. |
| `npm run dev` | Runtime + web dev servers. |
| `npm run build` | Production build of the web app. |
| `npm run lint` | Not wired up yet — see §2 for the reason and the replacement gate. |
