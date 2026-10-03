# Proposal

## Why

The office is currently a free-orbit 3D scene. Free rotation makes it hard to read at a
glance: you cannot tell where an agent "is" in a stable way, two agents at different
heights can overlap on screen, and there is no notion of an agent's position or
direction. Operators also asked for something simpler to build and easier to look at —
an office, not a 3D engine demo.

This change replaces the **3D office** with a **2D office**: agents live on a flat
floor with `x`/`y` coordinates and a 360° facing direction, presented in a fixed
isometric **2.5D "Diablo-style" view**. The camera no longer orbits; the floor is a
readable map. Users can drag agents around the floor, and each agent turns to face the
direction it is moving. Working state, completion, and inter-agent communication stay
visible.

The existing 3D model and furniture components are **reused as-is** (three.js plus the
in-repo procedural bot and props); this change does not build a new asset pipeline or
hand-model new objects.

## What Changes

- **Retire `office-3d-ui`.** Its free-orbit scene, `maxPolarAngle` floor clamp, and 3D
  perspective requirements no longer describe the product.
- **Add `office-2d-ui`.** A fixed isometric 2.5D view in which:
  - the office is a flat floor with walls, desks, chairs, monitors, and shared props;
  - every agent has an `x`/`y` position and a `0–360°` facing angle;
  - the user drags an agent to move it in any direction, and it faces the way it moves;
  - agent positions are retained across view switches and reloads;
  - working / done / blocked / errored state and context-pressure mood remain visible on
    the bot, as does the existing inspector;
  - communication between agents is drawn as a dashed link with an envelope marker, and
    the same marker appears inline in the transcript.
- **Reuse, do not recreate, the existing models.** `Bot` (procedural + optional glTF from
  the avatar manifest) and `Furniture` (procedural props) stay; only the camera, the
  layout coordinates, and the interaction model change. The optional avatar manifest
  still lets an operator swap in a ready-made model with no source change.
- **Movement is a pure function.** Default placement, bounds clamping, facing
  derivation, and persistence are pure helpers under `apps/web/src/office/`, so they are
  verified in unit tests without WebGL.

No changes to `core`, `contracts`, `agent-orchestration`, `agent-terminals`, or
`harness-adapters`. The runtime API is unchanged: position is a client-side concern.

## Capabilities

### New Capabilities

- `office-2d-ui`: the isometric 2.5D office, agent `x`/`y` placement and 360° facing,
  drag-to-move, working/done indication, communication visualisation, the furnished
  floor, the inspector, the accessible list fallback, and the agent profile editor.

### Modified Capabilities

- None. `office-3d-ui` is **retired** (its requirements are replaced, not amended), and
  the one-off "3D UI" mention in `office-runtime-api` is a wording fix, not a behaviour
  change.

## Assumptions

- A flat floor is enough for the MVP: no multi-storey office, no pathfinding, no
  collision with furniture beyond clamping to the room.
- Position is not part of the shared runtime contract. It is a presentation concern, so
  it is stored in the browser and keyed by agent id; a reload restores the last layout.
- "Existing models only" means the in-repo procedural bot and props plus the optional
  glTF referenced by the avatar manifest. No new asset pack is added.

## Impact

- **Removed:** `apps/web/src/office/Scene.tsx` (perspective/orbit scene),
  `apps/web/src/office/webgl.ts` (WebGL capability probe used only for the 3D fallback),
  and the `office-3d-ui` specification.
- **Added:** `apps/web/src/office/OfficeScene.tsx` (isometric scene) and the pure
  placement/persistence helpers.
- **Unchanged dependencies.** `three`, `@react-three/fiber`, and `@react-three/drei`
  stay; no new external dependency, secret, or network asset.
- **Tests:** the 3D-specific camera/WebGL end-to-end assertions are replaced by 2D
  placement, movement, and isometric-view assertions.

Explicitly out of scope: collision and pathfinding, walk animations between desks, a
persisted server-side floor plan, multi-user editing of positions, and any change to how
runs are orchestrated.
