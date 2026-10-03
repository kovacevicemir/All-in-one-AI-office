# Design

## Context

See `proposal.md` for motivation. The constraints that shape this change:

1. **No vendor terms in core/contracts/web.** A communication event is plain data:
   two agent ids, a kind, a task reference, and a status. Nothing about PI or a model.
2. **Observe, don't invent transport.** The office already knows when an agent hands
   work to another (the task's `origin`) and when results are delivered (dependency
   hand-off). This change draws that; it does not add a chat protocol.
3. **Testable without WebGL.** The derivation, the summary text, and the transcript
   interleaving are pure functions. The 3D hover is the only part that needs a
   browser, and it is a thin adapter over a pure model.
4. **The accessible view carries everything.** Whatever the 3D marker communicates,
   the inspector list and the transcript marker communicate too.

## Goals / Non-Goals

**Goals:**

- Make it obvious, at a glance, that two agents are exchanging work.
- A hover/focus summary that answers "who is asking whom for what" in one line.
- Derive everything from existing state; add no new dependency and no prompt cost.

**Non-Goals:**

- Agent-to-agent chat, message bodies, threads, or read receipts.
- Delivery guarantees or retries between agents.
- Showing communication in the 3D scene for completed history older than the retention
  window.

## Decisions

### D1. Communication events are derived, not transmitted

The office derives an event from interactions it already performs:

| Interaction | Event kind | Direction |
| --- | --- | --- |
| Task created with `origin.kind === 'agent'` | `request` | origin agent → assignee |
| Dependency results delivered to a dependent task | `handoff` | dependency's agent → dependent's agent |
| (extension point) an explicit agent request | `request` / `response` | sender → recipient |

Derivation is a **pure function** (`deriveCommunications`) over the previous and next
task/run sets, so it is unit-testable and replayable.

*Alternatives considered:* a real messaging protocol between harnesses (rejected:
large, and the harnesses do not share a channel); inferring from transcript text
(rejected: fragile and vendor-specific).

### D2. Event shape and lifecycle

```
AgentCommunication {
  id, fromAgentId, toAgentId,
  kind: 'request' | 'handoff' | 'response' | 'info',
  status: 'open' | 'answered' | 'failed' | 'cancelled',
  summary: string,            // one line, who → whom and what
  taskId?, relatedTaskId?,    // the ask and/or the delivered result
  createdAt, updatedAt,
  sessionId?, seq?            // anchor for the inline transcript marker, when known
}
```

- A `request` event is `open` while its task is queued or running, `answered` when the
  task is `done`, `failed` when it failed, and `cancelled` when it was cancelled.
- A `handoff` event is `answered` on delivery (the delivery is the event).
- Events are never deleted by lifecycle transitions; they are retained.

### D3. The 3D marker: dashed link, envelope, DOM popover

- A dashed line runs between the two bots' positions with the envelope at the midpoint,
  drawn with a dashed line material. The envelope is a small procedural marker (a
  canvas-textured plane, like the bot label) so no asset is added.
- The line's style reflects lifecycle: `open` animates subtly, `answered` is solid/
  calm, `failed`/`cancelled` use the error/muted tint.
- Hover enters and leave exit a hovered-event state via React Three Fiber pointer
  events on a generous invisible hitbox at the envelope.
- The **summary popover is DOM outside the canvas**, positioned from the marker's
  projected screen point. This deliberately avoids in-canvas `Html` (which has a
  React-19 unmount problem and renders inconsistently) and keeps the popover content
  testable in jsdom.
- Multiple concurrent communications each get their own link; overlapping lines are
  offset so they stay individually hoverable.

### D4. The inline transcript marker interleaves by sequence

The office records a communication event with the `sessionId` and sequence at the point
it occurs when a session exists. The terminal view calls a pure
`interleaveTranscript(textChunks, communications)` to produce alternating text and
marker segments, rendering a marker as a dashed line with an envelope at its sequence
position.

*Alternatives considered:* writing a sentinel line into the session text (rejected:
pollutes the retained transcript and couples the marker to text parsing); a separate
communications-only panel (rejected: loses the "in the middle of the flow" placement
the request asked for). The inspector still lists communications for the accessible
view.

### D5. Summary text is a pure function

`describeCommunication(event, agents, tasks)` returns `{ title, detail }`:

- title: `"Tech Lead → Tester: test xox.html"` (request) or
  `"Build → Tester: results of 'Package' delivered"` (handoff).
- detail: status, related task title, and a relative time.

The function never invents content: if an agent or task is unknown it says so rather
than fabricating a name.

### D6. Retention is bounded

Communications are retained in a bounded ring (the same order of magnitude as task
results). The snapshot carries the most recent N and marks the oldest retained id; the
realtime stream emits `communication.updated` for changes. Older events fall out of the
UI but not out of the underlying tasks, which retain their own history.

### Seams

| Behavior | Seam | Test double |
| --- | --- | --- |
| Derivation | pure `deriveCommunications(prev, next)` | none needed |
| Summary | pure `describeCommunication(...)` | none needed |
| Transcript interleave | pure `interleaveTranscript(...)` | none needed |
| 3D marker geometry/hitbox | pure `communicationSegments(events, positions)` | none needed |
| API + stream | runtime with injected store | `adapter-fake` |
| UI | events injected as props/state | fixtures |

### Architecture invariants

Events are neutral data in `contracts`; derivation and retention live in `core`;
rendering lives in `apps/web`. `core` stays pure (no I/O); the runtime emits events
through the existing sink. No dependency edge changes and no vendor term is introduced.

## Risks / Trade-offs

- **Visual clutter** with many communications. Mitigation: only active or recent
  events draw a link, overlapping lines are offset, and completed events fade.
- **Hover-only discovery.** Mitigation: markers are keyboard-focusable and the same
  summary is in the inspector list.
- **Anchoring an inline marker to a session.** When no session exists yet, the event
  still appears in the 3D and the inspector, and gains its inline anchor once the
  related session exists.
- **Sequence drift** if a communication is recorded between output chunks.
  Mitigation: record the current last sequence; the interleave function orders markers
  before the next text chunk at the same sequence.

## Migration Plan

- Additive: a new event type in the snapshot and stream, a new optional field set on
  state. Existing clients ignore unknown event types by contract, so no breaking
  change.
- No data migration: communications are derived from tasks/runs already persisted;
  existing history yields no events until interactions occur.

## Open Questions

- Should `handoff` direction be shown as `dependency agent → dependent agent`, or as
  the dependent "pulling" from the dependency? First cut shows the provider → consumer.
- Should completed communications remain in the 3D for a short grace period? Proposed:
  yes, fade after a short timeout; exact duration chosen in implementation.
