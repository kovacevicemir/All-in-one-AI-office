# Design

## Context

See `proposal.md` for motivation. This replaces the `office-3d-ui` capability established
by `add-ai-office-mvp` and extended by `add-inter-agent-communication` and
`add-office-environment-and-agent-profiles`. The constraints are unchanged:

1. **No vendor terms in core, contracts, or web.** Position and movement are neutral
   geometry; no harness or model vendor appears outside its adapter.
2. **Everything important is testable without a browser, network, clock, or
   credentials.** Placement, bounds, facing, and persistence are pure functions; the
   scene is a thin shell over them.
3. **The scene is never the only verification surface.** The accessible list carries the
   same identity, state, and waiting information, and it is how CI checks the UI.
4. **Reuse before adding.** The bot and furniture models are kept; only the camera and
   the coordinate system change.

## Goals / Non-Goals

**Goals:**

- A fixed isometric 2.5D view that reads like a top-down office map ("Diablo view").
- Agents with `x`/`y` coordinates and a `0–360°` facing angle, movable by dragging in any
  direction.
- A visible working / done / blocked / error treatment and context-pressure mood.
- Inter-agent communication drawn on the floor and inline in the transcript.
- Keep the diff small and inside the existing complexity budgets; add no dependency.

**Non-Goals:**

- Free camera rotation, a first-person mode, or a 3D perspective.
- Collision with furniture, pathfinding, or walk-to-desk animation.
- Server-persisted positions, or positions shared across browsers.
- Any new model or texture asset.

## Decisions

### D1. Isometric orthographic camera, not a perspective orbit

The scene uses an **orthographic** camera placed on a fixed isometric diagonal, looking
at the room centre, with rotation disabled and only pan and zoom available
(`MapControls`). Orthographic projection keeps parallel lines parallel, which is exactly
what makes a 2.5D map readable and gives the "Diablo" feel.

*Alternatives considered:* keep the perspective camera and clamp it (rejected: still
converges, still lets agents at different heights overlap unpredictably); render the
isometric view in SVG/CSS and drop three.js (rejected: the working models are already
three.js components and the request was to reuse them rather than recreate them).

### D2. The floor is the `x`/`y` plane; facing is a heading in that plane

An agent's pose is `{ x, y, facing }`. `x` maps to three's `x` and `y` maps to three's
`z` (the renderer owns the axis mapping). `facing` is a heading in radians; the existing
procedural bot faces `+Z`, so a bot group rotated by `facing` turns its face and eyes to
that heading. The heading is updated from the movement vector while dragging, which is
what makes "all directions, 360°" observable.

*Alternatives considered:* compass degrees (rejected as more conversion for no gain);
sprite swapping for eight directions (rejected as recreation and customization of the
models).

### D3. Placement is pure; the scene is a shell

- `office/placement.ts` owns `AgentPose`, the room bounds, `defaultPoses` (derived from
  the existing `layoutAgents`), `reconcilePoses`, `clampPose`, `facingFromDelta`, and
  `movePose`. All are pure and unit-tested.
- `office/pose-storage.ts` reads and writes a `PoseMap` through a minimal
  `{ getItem, setItem }` storage interface, so it is tested with an in-memory fake and
  never touches a real `localStorage` in tests.
- `OfficeScene.tsx` only projects poses into three.js and forwards pointer drags to
  `movePose`. It is covered by the browser suite, not by jsdom.

*Alternatives considered:* an imperative drag handler with ad-hoc maths in the scene
(rejected: untestable and easy to get wrong); storing poses in the runtime contract
(rejected: position is not shared behaviour and would widen the API for every client).

### D4. Reuse the existing models; change only camera and coordinates

`Bot.tsx` and `furniture.tsx` stay. `Bot` gains two inputs: the `facing` heading (applied
as a group rotation) and optional drag callbacks; the hitbox for selection is reused for
the drag. The optional avatar manifest is unchanged, so an operator can still point an
agent at a ready-made glTF. No new models are authored.

*Alternatives considered:* a fresh 2D sprite set (rejected: recreation); a new asset
pack (rejected: new dependency and network/offline concerns).

### D5. State indication is data-driven, same as before

The existing `visuals.ts` mapping (`state → mood`, `context pressure → mood`) is kept
verbatim. The bot shows a floor ring in the mood colour that pulses while a run is in
progress, plus the existing label with name, department, state, and activity. This keeps
"working", "done", "blocked", and "errored" distinguishable without new data.

### D6. Communication links are already planar; keep them

`communication-links.ts` already computes offsets in the `x`/`z` plane, so it is reused
unchanged: a dashed link between the two poses with an envelope at the mid-point, hover
and focus summary from the shared `describeCommunication`, and the same marker inline in
the transcript. Several communications between the same pair stay individually
selectable via the existing perpendicular offset.

### Seams that keep this testable

| Behaviour | Seam | Test double |
| --- | --- | --- |
| Default placement | pure `defaultPoses` over `layoutAgents` | none needed |
| Reconciliation with agent changes | pure `reconcilePoses` | none needed |
| Move and 360° facing | pure `movePose` / `facingFromDelta` | none needed |
| Bounds | pure `clampPose` | none needed |
| Retention across reloads | `pose-storage` with a `{ getItem, setItem }` port | in-memory storage fake |
| Working / done treatment | pure `visualForAgent` | none needed |
| Furniture layout | pure `planOffice` (kept) | none needed |
| Scene behaviour | browser end-to-end suite | fake harness |

### Architecture invariants

No dependency edge changes. `apps/web` still imports `contracts` and nothing else
internal. No vendor name enters `core`, `contracts`, or `web`. Room bounds, poses, and
facing live only in `apps/web`; `core` and the runtime contract are untouched.

## Risks / Trade-offs

- **Positions diverge between browsers.** They are local to each browser. Acceptable for
  a single-user local-first tool; noted as out of scope.
- **Dragging a bot can fight the pan gesture.** Mitigation: a drag starts only on a bot's
  hitbox; the floor and background belong to pan/zoom.
- **Agents can be moved anywhere in the room, including through furniture.** Accepted for
  the MVP: no collision, only a room-bound clamp.
- **Reusing three.js means WebGL is still required for the scene.** The accessible list
  remains the fallback when WebGL is unavailable, as before.

## Migration Plan

- The `office-3d-ui` main spec is deleted; `office-2d-ui` is created from this change's
  delta. The active `add-voice-prompt-input` change is re-pointed at `office-2d-ui`.
- On first load, agents with no stored pose get the deterministic default from
  `defaultPoses`; stale stored poses for removed agents are dropped.
- No API, contract, or runtime change, so clients and adapters are unaffected.

## Open Questions

- Should an operator be able to edit an agent's raw `x`/`y` as numbers, in addition to
  dragging? Deferred; dragging satisfies the requirement and the pure helpers make a
  numeric editor cheap to add later.
- Should positions optionally live in the runtime so they follow an agent across
  browsers? Deferred (out of scope).
