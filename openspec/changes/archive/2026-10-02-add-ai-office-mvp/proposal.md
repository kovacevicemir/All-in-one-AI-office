# Proposal

## Why

Running several coding agents today means juggling terminals, losing track of which
agent is doing what, and hand-wiring each vendor's CLI. This change defines the
smallest useful "AI office": a 3D office where each agent is a bot you can click to
see what it is doing, what it will do next, how close it is to running out of
context, and the live prompt and terminal it is driving. It is specified
vendor-neutrally so harnesses and models can be swapped later without rewriting the
core.

## What Changes

- Introduce a **runtime** that owns agents, departments, tasks, and terminal
  sessions, exposed over a versioned HTTP + realtime WebSocket contract.
- Introduce **vendor-neutral ports**: a *harness adapter* (how an agent process is
  started, driven, and observed) and a *model provider* (which model and credentials
  a run uses).
- Ship the first implementations: the **PI harness** (driven in its machine-readable
  RPC mode) and the **DeepSeek** model provider.
- Give every agent a **real terminal session**, one session per task, with streaming
  output, input, bounded scrollback, and status. A session is either PTY-backed or
  backed by a harness-provided structured event stream; the observable behavior is
  the same.
- Track **context pressure** per agent from the harness's own context-usage
  telemetry and expose it as an observable level, defaulting to warning at 30% and
  critical at 50%.
- Support **parallel work with dependencies**: agents run concurrently, tasks may
  depend on other tasks, a dependent task waits for its dependencies, and completed
  tasks produce a result that dependents receive as clearly labelled input.
- Guarantee **faithful, zero-overhead execution**: a task's instruction reaches the
  harness unmodified, and the office injects no prompt text, system prompt content,
  or extra model calls of its own.
- Build a **minimal React + Three.js office UI**: one bot per agent, departments as
  zones, a swappable bot avatar, bots that visibly complain or stress under context
  pressure, and a click-to-inspect panel showing current activity, next task,
  context usage, dependency status, and the live terminal.
- Provide a **non-3D accessible list view** of the same data so the product is
  usable, testable, and verifiable without WebGL.

Explicitly out of scope for the MVP: multi-user auth, remote/cloud execution,
billing, an avatar marketplace, deep agent-to-agent negotiation (only task
delegation and dependency hand-off are specified, with expansion points noted), and
any harness or model vendor beyond PI/DeepSeek.

## Capabilities

### New Capabilities

- `harness-adapters`: vendor-neutral harness and model ports, a registry, normalized
  run events, faithful zero-overhead execution, session telemetry, interactive
  prompting, plus the PI harness and DeepSeek model provider.
- `agent-terminals`: one PTY- or stream-backed session per task run, streaming I/O,
  scrollback backfill, telemetry, and termination semantics.
- `agent-orchestration`: agents, departments, task queues, task dependencies and
  parallel execution, task results, the run loop, context pressure, observable agent
  state, delegation, and durable persistence.
- `office-runtime-api`: the versioned HTTP + realtime contract the UI consumes,
  including snapshots, telemetry, dependency visibility, filters, and errors.
- `office-3d-ui`: the 3D office scene, swappable bot model, state- and
  pressure-driven bot visuals, click-to-inspect panel, live updates, and an
  accessible list fallback.

### Modified Capabilities

- None. This is the initial baseline; `openspec/specs/` is intentionally empty until
  this change is archived.

## Impact

- **New:** a TypeScript monorepo (shared contracts + core + runtime server + React
  web app).
- **New runtime dependencies at the edge only:** a PTY library (server, for
  non-structured harnesses) and Three.js/React Three Fiber (web). Core packages stay
  dependency-light and framework-agnostic.
- **New external process dependency:** the PI CLI must be installed and
  authenticated on the host; DeepSeek access is supplied through PI's provider
  configuration.
- **No added token cost:** the office does not wrap prompts, inject system prompt
  text, or make model calls of its own. Dependency results are passed as explicit,
  opt-in input, never silently merged.
- **New local data:** agent/department/task/run definitions and run history under a
  project-local data directory (no database required for the MVP).
- **No existing systems are modified**, so there is no migration or breaking change.
