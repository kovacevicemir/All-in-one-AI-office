# Proposal

## Why

Agents already act on each other's work — one delegates a task to another, and a
dependent task receives another agent's results — but nothing in the office says so.
The transcript reads as a single agent talking to itself, and the 3D scene shows two
bots with no indication that work is flowing between them. When something goes wrong,
there is no way to see who asked whom for what.

This change makes inter-agent communication visible: a dashed line with an envelope at
its midpoint appears wherever communication is happening, and hovering (or focusing)
it shows a plain-language summary of who is requesting what.

## What Changes

- Introduce a normalized, vendor-neutral **communication event**: who sent it, who
  received it, what kind it is (request, hand-off, response, info), a one-line summary,
  the related task, and a lifecycle status.
- **Derive events from interactions the office already has**: agent delegation (a task
  created by one agent for another) and dependency hand-off (one agent's results
  delivered to another agent's dependent task). No new agent-to-agent transport is
  introduced in this change.
- **Render a marker** wherever a communication appears: in the 3D office as a dashed
  link between the two bots with an envelope at its midpoint, and inline in the
  transcript as a dashed separator with an envelope at the point the communication is
  recorded.
- **Hover or focus a marker** to see a summary popover: direction (`A → B`), the ask
  or delivery in one line, the related task, status, and time. The popover is
  keyboard-reachable, not hover-only.
- Expose communication events in the API snapshot and realtime stream, and list them
  in the inspector so the accessible view carries the same information as the scene.

## Capabilities

### New Capabilities

- `inter-agent-communication`: the communication event model, the derivation rules
  from delegation and dependency hand-off, the summary text, and lifecycle/retention.

### Modified Capabilities

- `office-3d-ui`: the 3D dashed connector with an envelope and hover/focus summary, the
  inline transcript marker, and the inspector communication list.
- `office-runtime-api`: communication events in the snapshot and realtime stream, and a
  read endpoint.

No changes to `core` behavior beyond deriving events, and no changes to
`harness-adapters` or `agent-terminals`: the office observes communication; it does
not ask the harness to speak to another harness.

## Assumptions

- "Agent talks to another agent" is expressed through the interactions that exist
  today: task delegation carrying an agent origin, and dependency result delivery. An
  explicit request/response protocol between agents is noted as a future extension
  point, not built here.
- Events are office-level and timestamped; they are not the harness's own output. The
  inline transcript marker is therefore anchored to the session stream at the point the
  office records the communication.

## Impact

- **New local data:** communication events are retained with the office state (bounded,
  like task results). They reference agents and tasks, not terminal contents.
- **No new dependency:** the dashed line and envelope are procedural geometry; the
  summary popover is DOM.
- **No prompt or token cost:** nothing is injected into a run.
- **Architecture:** events are vendor-neutral data in `contracts`; derivation lives in
  `core`; rendering stays in `apps/web`. No dependency edge changes.

Explicitly out of scope: a real agent-to-agent messaging protocol, message content
beyond the task reference and summary, threads or conversations, and delivery
guarantees between agents.
