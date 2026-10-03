# Design

## Context

See `proposal.md` for motivation. This extends the `office-2d-ui` capability added by
`add-2d-office`. The constraints are unchanged:

1. **No vendor terms in core, contracts, or web.** Furniture and coordinates are neutral
   geometry.
2. **Everything important is testable without a browser, network, clock, or
   credentials.** The layout document, its validation, and its storage are pure functions
   plus one injected port; the scene remains a thin shell.
3. **Reuse before adding.** The furniture models already exist and are reused; the only
   new thing is data describing where they sit.
4. **The scene is never the only verification surface.** The accessible list and the
   pure helpers carry the behaviour a test needs.

## Goals / Non-Goals

**Goals:**

- Add, move, rotate, and remove furniture with the existing models.
- Make the current furnished plan the default layout, restorable in one action.
- Persist the working layout and move it between machines as a JSON file.
- Keep furniture editing and agent movement independent.

**Non-Goals:**

- New models, textures, or an asset pipeline.
- Collision, snapping to a grid beyond an optional placement step, or pathfinding.
- Custom shapes, scaling, multi-floor offices, undo/redo.
- Storing layouts on the runtime or sharing them between users.

## Decisions

### D1. The floor plan is a versioned layout document

```json
{
  "version": 1,
  "items": [
    { "id": "desk_1", "kind": "desk", "x": -2.4, "y": -1.2, "rotation": 0 },
    { "id": "plant_1", "kind": "plant", "x": 3.1, "y": 1.7, "rotation": 0 }
  ]
}
```

- `kind` is one of the existing `FurnitureKind` values; `x`/`y` are floor coordinates in
  the same space as agent poses; `rotation` is a quarter-turn index (`0..3`) or radians,
  decided in the task.
- Parsing and serialising are **pure functions** in `apps/web/src/office/`. Validation
  drops unknown kinds and non-finite coordinates rather than throwing, and reports a
  human-readable reason for a document that cannot be used at all.

*Alternatives considered:* store the whole scene graph (rejected: unreviewable and
fragile); one file per item (rejected: awkward to move between machines); reuse the
agent pose storage (rejected: different lifecycle — agents exist and vanish, furniture
is authored).

### D2. The default layout is derived, not hand-written

`planOffice(agents, departments)` already returns deterministic furniture placements. The
default layout is that plan converted to layout items (stable ids, coordinates, no
rotation). Agents and departments therefore still shape the *default*, while the user's
edits are the saved layout. "Reset to default" simply discards the saved layout.

*Alternatives considered:* a checked-in JSON default file (rejected: it would drift from
the pure plan and duplicate it); hard-coding items in JSX (rejected: not testable).

### D3. One persisted layout plus a file port

- `layout-storage.ts` reads and writes the layout through the same minimal
  `{ getItem, setItem }` port used for agent poses, so it is tested with an in-memory
  fake. A missing or malformed stored layout reads as "use the default".
- `layout-file.ts` defines a tiny `LayoutFilePort` (`exportFile`, `importFile`) with a
  browser implementation (download a `Blob`; read a `File`). Tests inject a fake, so no
  real download or file dialog is needed.

*Alternatives considered:* the File System Access API (rejected: not universally
available, and unnecessary for download/upload); a runtime endpoint (rejected: the
layout is a client concern and the runtime has no business storing it).

### D4. Editing reuses the drag machinery and adds a palette

- The isometric scene already raycasts the floor plane for agent drags. Furniture
  editing reuses the same raycast: in edit mode a pointer-down on a furniture item
  starts a furniture drag; in play mode it does nothing (agents stay draggable in both).
- A catalogue panel lists the kinds grouped (seating, desks, tech, decor, plants,
  shared). Selecting a kind then clicking the floor places an item; a placed item can be
  rotated and removed from the same panel or an item menu.
- A mode flag keeps the interactions from colliding: furniture drags only start in edit
  mode; agent drags always work.

*Alternatives considered:* a separate editor screen (rejected: the point is to arrange
the office you are looking at); drag-and-drop from the palette into the canvas
(rejected: more code for the same result as click-to-place).

### D5. Import validates before it replaces

Import parses and validates the incoming document first. Only a valid document replaces
the current layout; an invalid one surfaces a specific reason and leaves the office as
it was. An unsupported version is reported as such rather than coerced.

*Alternatives considered:* best-effort partial import that replaces the layout
(rejected: a bad file must not silently destroy work).

### Seams that keep this testable

| Behaviour | Seam | Test double |
| --- | --- | --- |
| Layout document shape | pure type/predicates | none needed |
| Serialise/parse/validate | pure functions | none needed |
| Default layout | pure `defaultLayout` over `planOffice` | none needed |
| Persistence | `layout-storage` with `{ getItem, setItem }` | in-memory storage fake |
| Import/export | `LayoutFilePort` | in-memory file fake |
| Add/move/rotate/remove | pure `addItem` / `moveItem` / `rotateItem` / `removeItem` | none needed |
| Scene editing | browser end-to-end suite | fake harness |

### Architecture invariants

No dependency edge changes. `apps/web` still imports `contracts` and nothing else
internal. The layout types and ports live only in `apps/web`; `core`, `contracts`, and
the runtime are untouched. No vendor name enters a shared layer.

## Risks / Trade-offs

- **An imported file can reference a kind this build does not have.** Validation drops
  unknown kinds and reports how many were skipped, rather than failing the whole file.
- **Coordinates from another office may sit outside the current room.** Items are
  clamped to the room bounds on import, and the reason is reported.
- **Saved layouts can become stale if the room's bounds change.** Bounds are derived from
  departments and change as the office grows; clamping on load keeps items on the floor.
- **Two storage keys (poses and layout) can drift.** They are independent on purpose;
  both key off stable ids and both fall back safely.

## Migration Plan

- On first load after this change, no stored layout exists, so the default layout is
  shown and persisted. Existing offices look exactly as they did.
- Agent poses are unaffected; the layout lives under its own storage key.
- No contract or runtime change.

## Open Questions

- Should the layout file optionally include agent positions? Deferred; the format has a
  `version` so an optional `agents` section can be added additively later.
- Should placement snap to a grid? Deferred; the pure functions make it a one-line
  change once a grid size is chosen.
- Should furniture support collision? Deferred (out of scope for this change).
