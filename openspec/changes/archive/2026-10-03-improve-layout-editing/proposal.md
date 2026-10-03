# Proposal

## Why

The editable floor plan works, but the gestures are indirect: you must select an item
before Remove or Rotate become available, you cannot see where a catalogue item will
land until after you click, and a right-click does nothing. Rotating a pending item
before placing it is impossible.

This change makes editing direct: the item you are about to place is previewed on the
floor and can be oriented first, and a placed item can be removed with a right-click.

## What Changes

- **Placement preview**: while a catalogue kind is selected, a translucent preview of
  that item follows the pointer on the floor, showing the exact position and orientation
  it will be placed with. The preview is also exposed as an accessible readout so the
  office is not the only way to see it.
- **Rotate before placing**: Rotate acts on the pending item when a kind is selected, so
  it can be placed at 0°, 90°, 180°, or 270°. Rotate still cycles a selected placed item
  through the same four orientations.
- **Right-click to remove**: in edit mode, right-clicking a placed item removes it and
  suppresses the browser context menu, without needing to select it first.
- The Remove/Rotate controls stay enabled whenever they have a target (a selected item,
  or a pending kind for Rotate).

## Capabilities

### Modified Capabilities

- `office-2d-ui`: the "Editable floor plan" requirement gains a placement preview, a
  pending-item rotation, and right-click removal. The catalogue, persistence, import and
  export are unchanged.

## Assumptions

- The preview is a non-persisted render of the pending item; it never enters the layout
  document, storage, or an exported file.
- Removing an item takes effect immediately and is still undoable in the only way the
  layout supports: reset to the default.
- Right-click is a mouse/trackpad gesture; the existing focusable Remove button remains
  the keyboard path.

## Impact

- **`apps/web` only.** The layout reducer gains a rotation on add; the scene gains a
  preview render and a right-click handler. No contract, core, runtime, adapter, or new
  dependency change.
