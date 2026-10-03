# Design

## Context

Extends the `office-2d-ui` capability landed by `add-office-layout-editor`. The
constraints are unchanged: the layout is pure data, the scene is a thin shell, and the
behaviour is verifiable without a real browser through pure functions and component
tests.

## Goals / Non-Goals

**Goals**

- Show the pending item on the floor, at its position and orientation, before placing.
- Rotate a pending item through 0/90/180/270 before placing.
- Remove a placed item with a right-click, without selecting it first.
- Keep every action reachable with keyboard and pointer alike.

**Non-Goals**

- Free rotation, scaling, snapping to a grid, or collisions.
- Undo/redo (reset to default is still the escape hatch).
- A runtime or persisted representation of the preview.

## Decisions

### D1. The preview is scene state, never layout state

The preview is `{ kind, x, y, rotation }` held in React state in `OfficeView`. It is
rendered as a translucent copy of the existing `Furniture` model and is never added to
the `LayoutDocument`, storage, or an export. Placing runs the existing `addItem` with the
pending rotation.

The preview's material is made translucent imperatively from a ref (traverse meshes,
set `transparent`/`opacity`/`depthWrite`). This reuses the procedural models exactly and
keeps the change out of the model kit.

### D2. A pure rotation on add, not a second action

`addItem` already places at a clamped point; it gains an optional rotation, and the
reducer's `add` action carries it. `normalizeRotation` already folds any value into
`0..3`, so "all four directions" needs no new geometry (`rotation * 90°` at render).

*Alternative considered:* an `add` followed by a `rotate` dispatch — rejected because it
would persist twice and momentarily write the wrong rotation.

### D3. Right-click is a removal gesture, not a selection

In edit mode an item's `onContextMenu` removes it and calls `preventDefault`, so no
browser menu appears. A left `pointerdown` starts selection and drag; a non-left button
is ignored by the drag path so a right-click never also moves the item. The focusable
Remove button stays for keyboard users.

## Seams that keep this testable

| Behaviour | Seam | Test |
| --- | --- | --- |
| Rotate a new item | pure `addItem(..., rotation)` | unit |
| Pending rotation + readout | `LayoutEditor` props | component |
| Preview readout, place at 90° | DOM `data-testid="layout-preview"` + stored layout | browser |
| Right-click remove | item handler + stored layout | browser |

## Architecture invariants

No dependency edge changes. Everything stays in `apps/web`, still importing only
`contracts` internally. No vendor name or shared-layer change.
