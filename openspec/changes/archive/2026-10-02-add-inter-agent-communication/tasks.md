# Tasks

## 1. Shared contracts

- [x] 1.1 Define the `AgentCommunication` schema (id, from/to agent, kind, status, summary, task references, timestamps, optional session anchor) and add `communication.updated` to the closed realtime event set — verify: unit tests round-trip the schema, reject a malformed payload with a field-naming error, and assert the new event type parses through the envelope schema and remains ignored when unknown
- [x] 1.2 Extend the snapshot schema with a bounded communications list and a reported oldest retained id — verify: a schema test accepts a snapshot with and without communications and never coerces a missing list to a non-empty one

## 2. Core: derive, lifecycle, retention

- [x] 2.1 Implement `deriveCommunications(previous, next)` as a pure function producing a `request` event for an agent-origin task and a `handoff` event for a dependency delivery, with stable ids so re-derivation does not duplicate — verify: unit tests cover delegation, hand-off, unrelated agents, and idempotent re-derivation
- [x] 2.2 Implement lifecycle transitions from the underlying task: `open` while queued/running, then `answered`/`failed`/`cancelled` on the matching terminal status; `handoff` is `answered` at delivery — verify: unit tests cover each transition and assert the event is never deleted
- [x] 2.3 Implement `describeCommunication(event, agents, tasks)` returning a one-line title and a detail string that names both agents and the ask or delivery and discloses a missing reference — verify: unit tests cover a request, a hand-off, an unknown agent, and an unknown task
- [x] 2.4 Implement the bounded retention ring and include communications in the persisted state so they survive a restart — verify: unit tests overrun the ring and assert the oldest id advances while tasks remain, and a restart with retained tasks re-derives/loads the same events

## 3. Runtime: snapshot, stream, endpoint

- [x] 3.1 Emit `communication.updated` from the office sink on creation and lifecycle change, and include the bounded list in the snapshot — verify: an integration test connects, triggers a delegation, and asserts the snapshot precedes the delta and the event is not missed
- [x] 3.2 Add a read endpoint returning retained communications with an optional agent filter and the uniform error shape — verify: API tests assert the full list, the filtered list, and a not-found response for an unknown agent
- [x] 3.3 Expose communications in the client transport and the UI store, tolerating the unknown event type on older clients — verify: client and store tests assert snapshot ingestion, incremental updates, and that an unknown event type is ignored without error

## 4. Web: summary and transcript interleave

- [x] 4.1 Implement `interleaveTranscript(textChunks, communications)` as a pure function producing ordered text and marker segments anchored by session sequence — verify: unit tests cover a marker before, between, and after text chunks, multiple markers at one sequence, and a marker with no session anchor being excluded from the transcript
- [x] 4.2 Render the inline transcript marker as a dashed separator with an envelope using the interleaved segments, keeping the existing plain-text path when no communications apply — verify: component tests assert the marker renders between the right chunks and that a transcript with no communications is unchanged
- [x] 4.3 Implement the marker's summary popover (direction, ask/delivery, related task, status, time) driven by `describeCommunication`, shown on hover and on keyboard focus — verify: component tests assert the summary content, that focus shows it, and that a missing reference is disclosed

## 5. Web: 3D connector and accessible list

- [x] 5.1 Implement `communicationSegments(events, positions)` as a pure function returning each pair's midpoint and offset so overlapping links stay distinguishable — verify: unit tests assert the midpoint, the offset for two events between the same pair, and no segment for an event whose agents are not placed
- [x] 5.2 Draw the dashed link with an envelope at the midpoint in the 3D scene, with lifecycle styling and hover/focus pointer handling that drives a DOM popover positioned from the projected marker — verify: a browser smoke check shows the link and popover between two actively communicating bots and the camera still stays above the floor
- [x] 5.3 Add the inspector communications list using the same summary, so every communication is reachable without the 3D view — verify: a component test asserts the list renders each communication with its direction, ask/delivery, status, and time

## 6. Documentation, integration, and archive

- [x] 6.1 Document the communication marker and summary in the README (what triggers it, what the hover shows, that it is derived and not a chat protocol) — verify: a reviewer can read the docs and predict when a marker appears for a delegation and for a dependency hand-off
- [x] 6.2 Extend the end-to-end suite to cover a delegation and a dependency hand-off producing a marker, a hover summary, and an inspector entry — verify: `npm run e2e` passes with no WebGL and no PI/DeepSeek credentials
- [x] 6.3 Run `openspec validate add-inter-agent-communication --strict` and archive the change so `inter-agent-communication` becomes a baseline capability — verify: validation passes with no warnings and the archived specs contain the communication, marker, and exposure requirements
