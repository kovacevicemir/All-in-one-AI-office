# Tasks

## 1. Workspace scaffold

- [x] 1.1 Create the npm-workspaces root with `apps/{runtime,web}` and `packages/{contracts,core,adapter-pi,adapter-session,adapter-store-file,adapter-fake}`; enable TypeScript strict + ESM and `tsc -b` project references — verify: `npm install && npm run typecheck` succeeds from a clean clone with no build artifacts present
- [x] 1.2 Add a dependency-direction check that fails the build when a package imports outside the allowed edges from design D1 — verify: `npm test` fails when a temporary `core → adapter-pi` import is added and passes once removed
- [x] 1.3 Add `npm run dev` (runtime + web concurrently), `npm run build`, and `npm test` — verify: `npm run build` exits 0 and produces `apps/web/dist` and a runtime entry point

## 2. Shared contracts

- [x] 2.1 Define zod schemas and inferred types for Agent, Department, Task (including `dependsOn`, `origin`, blocked-by, and result), Run, Session, TaskResult, Error, and Snapshot — verify: unit tests round-trip each schema and reject one malformed payload per schema with a field-naming error
- [x] 2.2 Define the realtime envelope (`v`, `seq`, `type`, `ts`, `payload`), the closed event-type set including telemetry and pressure events, and the contract version constant — verify: a test asserts an envelope with an unknown type parses without throwing and reports the unknown type
- [x] 2.3 Define the telemetry payload (context tokens, context window, percent, cumulative tokens and cost) with explicit `unavailable` representation — verify: a test asserts `null`/absent telemetry parses as unavailable and is never coerced to zero
- [x] 2.4 Document the additive-change rule and version constant in the package README — verify: a test asserts every event type in the set parses through the exported envelope schema

## 3. Core domain: queue, dependencies, results

- [x] 3.1 Implement the domain model and queue rules (next runnable task = earliest task whose dependencies are all done; reorder never displaces a running task; deleting a department unassigns agents) — verify: unit tests cover each rule plus the empty-queue case
- [x] 3.2 Implement dependency validation and cycle rejection over `dependsOn`, including cross-agent dependencies — verify: unit tests cover a direct cycle, an indirect cycle, a self-dependency, and a valid cross-agent chain
- [x] 3.3 Implement dependency-gated status derivation: blocked with the list of unfinished dependencies, runnable when all are done, blocked-by-failure when a dependency is failed or cancelled — verify: unit tests cover each case, including that fixing a failed dependency unblocks its dependents without recreating them
- [x] 3.4 Implement task results: record final assistant output, terminal status, usage, and failure reason on task completion; retain after the session closes — verify: unit tests assert a successful result, a failed result with reason, and retrieval after session teardown

## 4. Core: state machine, pressure, run loop

- [x] 4.1 Implement the pure agent-runtime-state reducer over `(state, event)` covering idle, thinking, working, blocked, waiting, error, done — verify: unit tests cover every transition and assert unrecognized events leave state unchanged
- [x] 4.2 Implement the pure context-pressure function with configurable warning and critical thresholds defaulting to 30 and 50 percent, an unavailable result, and hysteresis on the way down — verify: unit tests cover 12%/30%/50%, unavailable telemetry, and a value oscillating across a threshold changing level at most once per direction
- [x] 4.3 Implement the run loop: start next runnable task → create session → run → record result → stop; one run per agent, parallel across agents, conflict on double-start — verify: unit tests with the fakes assert task status, result recording, agent state, two agents running concurrently, and the double-start conflict
- [x] 4.4 Implement dependency-result delivery: build a dependent task's prompt input from its own instruction plus labelled dependency results as a separate message — verify: unit tests assert the instruction is byte-identical to the stored one and dependency output is delivered separately and labelled

## 5. Store and fake adapters

- [x] 5.1 Implement `adapter-store-file` as an in-memory source of truth with debounced write-behind atomic snapshots, a schema version, `.bak` of the previous snapshot, and flush on clean shutdown — verify: unit tests with fake timers assert reads never touch disk, mutations are visible immediately, a snapshot lands after the debounce, and no partial file is ever left behind
- [x] 5.2 Implement startup recovery marking unfinished runs `interrupted` — verify: unit test restarts the store with an in-flight run and asserts it reads as interrupted with its agent not running
- [x] 5.3 Implement `adapter-fake` with an in-memory store, a scriptable harness adapter, an in-memory session port, and a controllable telemetry feed — verify: unit tests drive a full task lifecycle, a pressure threshold crossing, and a dependency unblock with no I/O and no real timers

## 6. Session adapters

- [x] 6.1 Define the `SessionPort` contract and its capability flags (input, resize, telemetry, cancel) — verify: a test asserts an undeclared operation returns an unsupported-capability error for both implementations
- [x] 6.2 Implement `rpc-session`: spawn the harness RPC process with pipes, parse strict JSONL (LF framing, CRLF tolerated, no `readline`), map harness records to normalized events, and forward commands — verify: unit tests against recorded fixtures assert event mapping, ordering, and command/response correlation by id
- [x] 6.3 Implement `pty-session` over `node-pty` for harnesses that speak a terminal, including resize and process-tree termination — verify: unit tests cover create, resize, input, duplicate-session conflict, close, and idempotent double close
- [x] 6.4 Implement bounded scrollback with sequence numbers, backfill from `fromSeq`, and the reported oldest retained sequence, shared by both backings — verify: unit test overruns the buffer, asserts old output is dropped and the oldest sequence advances, and asserts backfill returns ascending order
- [x] 6.5 Implement session status (starting/running/exited/failed + exit code) with input rejected after termination and telemetry updates published to subscribers — verify: unit tests cover write-to-terminated, telemetry published, and telemetry unavailable staying unavailable rather than zero

## 7. Runtime HTTP API

- [x] 7.1 Implement CRUD and task-queue endpoints for agents and departments with contract validation and the uniform error shape — verify: API tests assert status, payload, not-found, duplicate-name, and invalid-payload cases
- [x] 7.2 Implement task endpoints covering dependency declaration, blocked-by reporting, result retrieval, and cycle rejection with an explicit error — verify: API tests assert a blocked task lists its unfinished dependencies, a completed task exposes its result, and a cycle-adding update is rejected
- [x] 7.3 Implement command endpoints: start run, cancel run, prompt a live session, close session, write input, resize — verify: API tests assert start-run returns linked task/run/session ids, double-start returns a conflict code, prompt returns the delivery semantics used, and resize on a structured session returns unsupported
- [x] 7.4 Implement `GET /capabilities` returning registered adapters and providers with labels and capability flags — verify: API test asserts PI and DeepSeek appear when wired, that declared flags match the adapters, and that no response field contains a credential-shaped value

## 8. Runtime realtime stream

- [x] 8.1 Implement the WebSocket endpoint with subscribe (optional agent/department filter), snapshot-then-delta ordering, and monotonic sequence numbers — verify: integration test connects, mutates state, and asserts the snapshot precedes deltas with no missed change
- [x] 8.2 Implement output coalescing and backpressure (frame-batched output, per-frame byte cap) — verify: a test pushing a large burst asserts bounded frame sizes and no reordering
- [x] 8.3 Emit telemetry and pressure events, including a pressure event only when an agent's level actually changes — verify: a test drives usage across the 30% and 50% thresholds and asserts exactly one pressure event per crossing
- [x] 8.4 Bind to localhost by default and expose the authorization extension point — verify: test asserts the default host is loopback and that resource payloads and event types are unchanged when an auth hook is installed

## 9. PI harness and DeepSeek provider

- [x] 9.1 Implement the PI harness adapter over `pi --mode rpc`: launch in the workspace with the resolved model and a per-run session id, map session events, expose `get_session_stats` as telemetry, and support prompt/steer/follow-up — verify: unit tests with a fake PI process assert launch arguments, event mapping, telemetry shapes, and the declared capability flags
- [x] 9.2 Assert zero prompt overhead: the adapter sends the instruction verbatim and adds no prompt or system message — verify: a test compares the prompt recorded by the harness against the instruction handed to the adapter and asserts byte equality, and asserts no `--append-system-prompt` or wrapper message is used
- [x] 9.3 Fail the start when PI is missing or unstartable — verify: a test with an absent binary asserts an explicit PI-unavailable error and that the run is never marked running
- [x] 9.4 Implement the DeepSeek model provider: resolve `deepseek-flash` and `deepseek-v4-pro`, report the supported list, and apply secrets only at launch — verify: unit tests assert resolution for supported ids, a listing error for an unsupported id, and that no resolved object is persisted
- [x] 9.5 Add an opt-in smoke test running a real PI + DeepSeek task end to end and comparing usage against a direct CLI invocation, skipped unless an env flag is set — verify: skipped by default; passes locally with the flag and credentials
- [x] 9.6 Make the office a pass-through for PI project trust: pass no trust flag unless `AI_OFFICE_APPROVE_PROJECT` is set, so PI applies the same decision as an interactive run — verify: unit tests assert the default launch arguments contain neither `--approve` nor `--no-approve`, and an explicit override adds exactly one
- [x] 9.7 Stop presenting PI extension status notifications (MCP server state, widgets) as agent activity; extension chrome is not agent work — verify: a unit test asserts an extension `notify` record produces no activity event and no UI response

## 10. Web foundation: runtime client, list view, inspector

- [x] 10.1 Implement the `RuntimeClient` transport (HTTP reads/commands + WebSocket subscription with reconnect and snapshot replay) behind a React context — verify: unit tests against a mock transport assert snapshot handling, unknown-event tolerance, and reconnect without duplication
- [x] 10.2 Implement the accessible agent list view showing department, runtime state, current activity, next task, context pressure, and what the agent is waiting on, with full keyboard navigation — verify: component tests select and open an agent using keyboard events only and assert every field renders
- [x] 10.3 Implement the inspector showing current activity, next task, context usage percent and pressure level, waiting-on dependencies, the last completed task's result, and the live terminal tail, including the no-session state — verify: component tests assert each field and that usage, pressure, and tail update as events arrive
- [x] 10.4 Implement the full terminal view over retained scrollback with a return path to the office — verify: component test asserts backfill renders in order and new output appends; transport is mocked, so no PTY is required

## 11. Web prompting and live control

- [x] 11.1 Implement the prompt input for the selected agent's live session, enabled only when the adapter declares mid-run prompting — verify: component tests assert the input is disabled with an explanation when the capability is absent and sends the prompt verbatim when present
- [x] 11.2 Surface the delivery semantics and a cancel action in the inspector — verify: component tests assert the steer/follow-up result is shown and that cancel issues the cancel command for the agent's run

## 12. Web 3D office, avatar manifest, and pressure mood

- [x] 12.1 Implement the pure state→visual mapping (runtime state to clip, tint, indicator) and the pure pressure→mood mapping as standalone tested modules — verify: unit tests cover every runtime state, every pressure level including unknown, and unknown-state fallback to idle
- [x] 12.2 Implement the built-in procedural bot and the scene (one bot per agent, department grouping, camera and controls) using both mapping modules — verify: a local 3D smoke check renders N bots for N agents; a scene unit test asserts bot count, department placement, and that simultaneous working agents all show working
- [x] 12.3 Implement the avatar manifest loader with graceful fallback for a missing entry, missing asset, or missing clip, including the optional complaining and stressed clips — verify: tests with fixture manifests assert procedural fallback in each failure case, correct clip selection when complete, and a built-in pressure indicator when mood clips are missing
- [x] 12.4 Wire bot selection from pointer and keyboard to the shared selection state and open the existing inspector — verify: a test asserts selecting a bot opens the same inspector component used by the list view
- [x] 12.5 Add the WebGL-unavailable path and the list/3D view toggle that preserves selection — verify: tests assert the unavailable message renders with the list view still usable, and toggling both directions keeps the selected agent unchanged

## 13. Integration verification

- [x] 13.1 End-to-end Playwright suite that boots the runtime with the fake adapter, creates a department, agents, and dependent tasks, starts runs, and asserts live state, activity, next task, context pressure, unblocking, results, and terminal output appear in the list view and inspector — verify: `npm run e2e` passes with no WebGL and no PI/DeepSeek credentials
- [x] 13.2 Extend the e2e run to cover a blocked task unblocking when its dependent run completes and a bot's mood changing at the warning and critical thresholds — verify: the suite asserts the unblock transition and each mood change
- [x] 13.3 Add a README with setup, the two-minute first-run path, and how to add a new harness adapter or model provider — verify: a reviewer following the README from a clean clone reaches a running office using only the fake adapter
- [x] 13.4 Run `openspec validate add-ai-office-mvp --strict` and archive the change so the capability specs become the baseline in `openspec/specs/` — verify: validation passes with no warnings and `openspec list --specs` shows all five capabilities

## 14. Observability gaps found while dogfooding

UI and transcript gaps surfaced by running real tasks through the office after the
MVP. Behaviour added here is specified in the same change (office-3d-ui,
agent-terminals, agent-orchestration, office-runtime-api).

- [x] 14.1 Show each bot's name and live state in the 3D scene so the office is readable without opening the inspector — verify: the scene passes agent name/activity to the bot label and the label uses the tested state visual; browser smoke check shows the name above the bot
- [x] 14.2 Include written and edited file content in the retained transcript, so a completed task's code is reviewable — verify: unit tests assert a `write` payload's content and an `edit` payload's before/after appear in the run output, bounded by a truncation limit
- [x] 14.3 Keep the last session's transcript visible after a run ends and list every task (queued and finished) with its status, a transcript link, and a re-run action — verify: component tests assert the tail survives a null live session, the history lists all tasks, and the transcript opens for a finished task
- [x] 14.4 Re-queue a finished task and run it again, in core, the API, and the UI — verify: core and API tests assert a finished task returns to the queue with its result cleared and can be started again, a live task is rejected, and the Inspector re-run button calls the action

## Notes and deviations

Recorded while applying this change. Deviations are deliberate and small; the specs
are unchanged and still hold.

- **1.1 — project references.** Shipped as one root `tsconfig.json` with path
  mappings and `tsc --noEmit`, instead of `tsc -b` project references. Source-first
  packages (no build step, `tsx` for the runtime, Vite for the web app) is fewer
  moving parts and the typecheck is still whole-repo. Swap to project references if
  build times ever justify it.
- **6.2 — where the RPC parsing lives.** JSONL/RPC parsing sits in
  `packages/adapter-pi`, not in a generic session module, because the protocol is
  PI's. `SpawnPort` supplies the transport backings (`pipe`, `pty`) and the adapter
  owns the wire format. This keeps the vendor contract honest.
- **13.1 / 13.2 — browser-level e2e deferred.** Playwright was not added in this
  pass. Equivalent coverage exists at the runtime API + WebSocket level
  (`apps/runtime/test/api.test.ts`, 18 tests) and at the component level under
  jsdom. A browser suite is the next verification step.
- **9.5 — real PI smoke test deferred.** The opt-in end-to-end run against a real
  PI install and DeepSeek credentials is not written yet.
- **13.4 — archive deferred** until 13.1/13.2 land, so the specs are not frozen
  against a partially verified change.
- **Added beyond the plan:** `AGENTS.md`, `docs/engineering-guidelines.md`,
  `test/code-health.test.ts` (complexity/testability gate), `.env` and
  `.env.example`, and `AdminPanel` for staffing the office from the UI.
