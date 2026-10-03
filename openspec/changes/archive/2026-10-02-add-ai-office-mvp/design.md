# Design

## Context

See `proposal.md` for motivation. The repository is empty; this design establishes
the baseline architecture. Four constraints drive every decision below:

1. **No vendor terms in core.** PI and DeepSeek must be removable by deleting a
   package and one registry line.
2. **A run through the office must equal a run from the shell.** No prompt wrapping,
   no injected system prompt, no extra model calls. This is a hard product promise,
   so it is specified (`harness-adapters`: faithful zero-overhead execution) and
   tested by comparing what the harness records against what the office sent.
3. **Context pressure is a first-class signal** and must come from the harness's own
   accounting, not from estimating tokens ourselves.
4. **The 3D UI must not be the only way to verify the system.** CI cannot rely on
   WebGL, and it must not require a real PI install or DeepSeek credentials.

## Goals / Non-Goals

**Goals:**

- A dependency direction that makes vendor leaks structurally hard, not just
  discouraged by convention.
- One shared contract artifact so the runtime and UI cannot drift.
- Everything testable with fakes: a scripted harness adapter and an in-memory session
  port drive the full end-to-end path, including pressure thresholds and dependency
  unblocking.
- Smallest runnable surface: `npm run dev` starts runtime + web, no database, no
  container, no auth.

**Non-Goals:**

- Multi-user, remote execution, horizontal scaling, or queue durability beyond
  restart recovery.
- A plugin auto-discovery mechanism, a DI container, or a workflow engine.
- Deep agent-to-agent negotiation. Only delegation, dependency hand-off, and result
  reporting are specified; the task record's `origin` and `dependsOn` fields are the
  expansion points.
- Shipping any third-party avatar model. The built-in bot is procedural and
  asset-free; users point the manifest at their own models.

## Decisions

### D1. npm workspaces monorepo with a strict dependency rule

Layout:

```
apps/runtime      composition root: wires ports, serves HTTP + WebSocket
apps/web          React UI
packages/contracts  zod schemas, types, event envelope, error shape, version
packages/core       domain model, state machine, pressure rules, port interfaces
packages/adapter-pi           PI harness adapter + DeepSeek model provider
packages/adapter-session      PTY sessions + structured-stream sessions
packages/adapter-store-file   write-behind JSON snapshot store
packages/adapter-fake         test doubles: scripted harness, memory store/session
```

Allowed dependency edges: `contracts` ← `core` ← adapters ← `apps/runtime`; `apps/web`
→ `contracts` only. Anything else is a bug, checked in CI by a test that reads each
package's manifest.

*Alternatives considered:* pnpm workspaces (stricter, faster, but an extra tool for a
four-package repo — the swap later is a `packageManager` field and a lockfile);
separate repos per package (rejected: version skew with no benefit at this size).

### D2. Ports as plain TypeScript interfaces, wired explicitly

`core` declares `HarnessAdapter`, `ModelProvider`, `SessionPort`, `StorePort`, and an
`EventSink`. `apps/runtime` constructs concrete adapters and passes them in.

*Why not auto-discovery:* a registry that finds plugins by convention hides wiring
failures until runtime and makes "which adapters exist" a runtime question. An
explicit registry object makes the whole surface visible in one file and type-checked.

*Why not a DI container or decorators:* the graph is ~6 objects deep and depth 1.

### D3. Contracts package is the single source of truth

All API payloads and realtime events are zod schemas in `packages/contracts`, with
types inferred. The runtime validates inbound payloads with them; the UI parses
inbound events with them and ignores unknown event types (versioned by a `v` field,
additive changes only).

### D4. Realtime transport: one WebSocket, snapshot-then-delta

Single WS endpoint. On connect the client sends a `subscribe` message with an optional
filter; the server replies with a `snapshot` event and then emits deltas. Input
commands go over the same socket; CRUD goes over HTTP.

*Alternatives considered:* SSE downstream plus HTTP commands (simpler, but input is
bidirectional and low-latency, and this doubles the connection surface); one WS per
session (rejected: multiplies connections and complicates the snapshot, since roster,
telemetry, and dependency events are global).

Sequence numbers are per-stream and monotonic; a client that detects a gap
re-subscribes rather than replaying.

### D5. Sessions: one per task, transport-independent

**This is the one place we deliberately diverge from "a raw PTY per task".** We keep
the PTY as a supported backing, but the default PI backing is PI's structured RPC
stream, because it is the only way to get the context telemetry the product now
requires without screen-scraping a TUI footer.

`SessionPort` therefore has two implementations behind one contract:

- **`rpc-session` (default for PI):** spawns `pi --mode rpc` with pipes. Emits
  structured session events (`message_update`, `tool_execution_*`, `compaction_*`) and
  answers commands (`prompt`, `steer`, `follow_up`, `abort`, `bash`,
  `get_session_stats`). No ANSI parsing, no terminal emulation, and `get_session_stats`
  returns `contextUsage: { tokens, contextWindow, percent }` — exactly the pressure
  input we need.
- **`pty-session` (generic):** a real `node-pty` terminal for harnesses that only
  speak a terminal, and for the future "give the agent a raw shell" feature.

Observable behavior is identical by contract: ordered output, input, status,
scrollback, telemetry. `resize` is declared as a capability, so structured sessions
report it unsupported instead of silently ignoring it.

On the "same as straight from the terminal" requirement: PI in RPC mode runs the same
agent, same system prompt, same tools, same model as the TUI. It performs no extra
model calls. The instruction is sent as the `prompt` message verbatim. So the run is
token-identical, and the UI gets a faithful, lossless transcript instead of a
re-rendered terminal. A user who prefers raw bytes can select the PTY backing without
changing anything else.

*Alternatives considered:* PTY + tailing PI's session JSONL for usage (works, and is
the fallback if RPC ever proves limiting — but it adds file-watching, a second source
of truth, and a race between the live stream and the persisted file); PTY + parsing
the footer (rejected: fragile, locale/theme dependent); `--mode json` one-shot
(rejected: no mid-run prompting, so the UI could not steer a working agent).

Sessions are not reused across tasks (spec: `agent-terminals`). Each run creates one,
and each ends with its run. A shared long-lived session is a future, off-by-default
agent setting.

### D6. Persistence: in-memory is the source of truth, disk is a write-behind snapshot

Answering the "isn't in-memory fastest?" question directly: yes, and we should have
it — but not at the cost of losing your office on a crash. So: **the runtime keeps
all state in memory and every read path is a memory read with no I/O.** Mutations
apply to memory first and are journaled to disk asynchronously (debounced ~50 ms,
atomic write-temp-then-rename), so write latency never sits on the request path.

```
command → validate (zod) → apply to in-memory store → respond + emit event
                                     ↓ (async, debounced)
                              snapshot to .ai-office/*.json
```

*Alternatives considered:* pure in-memory (rejected: losing departments, agents, and
run history on restart is unacceptable for a tool that spends real tokens);
synchronous file writes per mutation (rejected: disk latency on every event when a
chatty run emits hundreds); SQLite now (rejected: a native dependency and migrations
for a few hundred records — `StorePort` makes it a later drop-in).

`StorePort` also owns startup recovery: any run without a terminal outcome is
rewritten to `interrupted`.

### D7. Run loop: parallel across agents, sequential within, dependency-gated

- At most one run per agent; different agents run concurrently.
- A task is **runnable** when every task in its `dependsOn` list is `done`. Otherwise
  it is `blocked`, and the agent reports `waiting` with the blocking task ids.
- A failed or cancelled dependency leaves dependents blocked (not failed), so fixing
  the dependency and re-running it unblocks them without recreating the queue.
- When a run reaches a terminal outcome the task is marked done/failed/cancelled, its
  **result** is recorded, and the loop **stops**. The next task starts only on an
  explicit instruction. No auto-drain in the MVP: it makes runaway token spend too
  easy while the system is young.
- A dependent task's prompt context is composed of its own instruction plus the
  labelled results of its dependencies, sent as a separate user message. The
  instruction itself is never rewritten (spec: faithful execution).

Runtime state (`idle | thinking | working | blocked | waiting | error | done`) is a
pure reducer over `(state, event)`; pressure is a second pure function over usage
percent with configurable thresholds (default 30% / 50%) and hysteresis. Both are
unit-testable with no process, no clock, and no I/O.

### D8. PI adapter drives RPC, DeepSeek resolves the model

The PI adapter launches `pi --mode rpc` in the agent's working directory with the
resolved model, a per-run session id under the agent workspace
(`--session-dir` / `--session-id`), and no extra prompt flags — never
`--append-system-prompt`, never a wrapper message. It maps PI records to normalized
events and polls `get_session_stats` on a timer and after each assistant message to
publish telemetry.

Because PI's capabilities are broader than a generic harness's,
`HarnessAdapter.capabilities()` declares them (`midRunPrompt`, `telemetry`,
`resize`, `cancel`), and the runtime refuses undeclared operations explicitly rather
than pretending (spec: capability negotiation). The adapter must detect a missing or
unstartable PI binary and fail the start, not mark a run as running.

The DeepSeek provider resolves model identifiers (`deepseek-flash`, `deepseek-v4-pro`)
to provider + model id for PI. Secrets stay in the host environment or PI's own
config: nothing secret is written to `.ai-office/` or returned by the API, and a test
asserts no response field looks like a credential.

### D9. UI: contract-only transport, list view first, 3D second

`apps/web` depends only on `packages/contracts`. A `RuntimeClient` is provided through
a React context; presentational components receive data and command callbacks as
props, so they test with plain objects and no network.

Build order is deliberate: **list view, then inspector, then the 3D scene** as an
alternative renderer of the same store. The primary acceptance path is therefore
verifiable in Playwright without WebGL, and the 3D code never becomes load-bearing for
correctness. Three.js via `@react-three/fiber` + `@react-three/drei`; `zustand` for
the store.

### D10. Avatar manifest keeps the bot replaceable

`apps/web/public/avatars/manifest.json` maps a semantic bot identity to an optional
model asset and a clip map that must include `idle`, `working`, and `blocked`, and may
include `complaining` and `stressed` for context pressure. Missing entries, assets, or
clips fall back to a built-in procedural bot (a capsule with a visor — an
"Astro-Bot-like" silhouette from primitives, no external asset) and to a built-in
pressure indicator, so the scene never crashes on bad data.

### D11. Pressure is derived, displayed, and inert

Pressure is computed in `core` from the newest usage percent:

```
percent < warning            → nominal
warning ≤ percent < critical → warning      (default warning 30)
percent ≥ critical           → critical     (default critical 50)
no telemetry                 → unknown
```

Leaving `critical` requires dropping a hysteresis margin below the threshold so a
percent hovering at 50 does not flap the bot's mood. Pressure is deliberately
**advisory**: it changes the bot's mood and shows a number, and it never aborts,
pauses, or re-scopes a run. That keeps the "no surprise token spend or behavior
change" promise intact while giving the operator an early warning. Configurable
thresholds live in project settings, not in code, because a 1M-token DeepSeek model
and a 128K model want different numbers.

## Risks / Trade-offs

- **RPC mode is a PI interface we do not control** → a PI update could change record
  shapes. Mitigation: all PI shapes are parsed in one module behind the adapter, with
  fixtures; the PTY backing is a drop-in fallback since sessions are
  transport-independent.
- **`get_session_stats` polling adds a little traffic** → poll only while a run is
  active, and after each assistant message, not on a tight interval.
- **PTY (and generic harnesses) still exist** → `node-pty` is a native module with
  Windows ConPTY differences. Mitigation: it is confined to `adapter-session`; the
  fake session port means CI and the web app never need it.
- **"No added tokens" is easy to regress** → mitigation: a test compares the prompt
  the harness recorded against the instruction the office sent, and an opt-in smoke
  test compares usage against a direct CLI invocation.
- **WebGL unavailable in CI** → mitigation: the state→visual and pressure→mood
  mappings are pure, unit-tested modules; Playwright covers the list view; the 3D
  smoke check runs locally.
- **Chatty terminal output floods the WebSocket** → mitigation: coalesce output into
  ~16 ms frames, cap per-frame bytes, let the client drop to the tail above a
  threshold.
- **Write-behind loses the newest ~50 ms on hard kill** → mitigation: acceptable, and
  startup recovery marks in-flight runs interrupted rather than pretending they are
  live; flush on clean shutdown.
- **Many bots degrade frame rate** → mitigation: procedural bots are cheap; cap the
  MVP at ~50 rendered agents and report when exceeded.
- **Third-party avatar assets may be licensed** → mitigation: none are shipped; the
  manifest points at user-supplied files.

## Migration Plan

Nothing exists to migrate. Rollback is `git revert`, plus deleting the `.ai-office/`
data directory if the on-disk schema changes.

## Open Questions

- Exact scrollback size, output-frame caps, telemetry poll interval, and hysteresis
  margin (defaults above) — tunable constants with no spec impact.
- Whether auto-drain of the next runnable task becomes a first-class command
  (`start --drain`). Deferrable: the specs define next-task selection already, and
  starting is explicitly a command.
- Whether a future "long-lived shared session" agent setting is worth it. Deferrable:
  `agent-terminals` already reserves the switch, defaulting off.
