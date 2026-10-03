# Proposal

## Why

The office ships with one fixed, procedurally generated floor plan. Operators cannot
put a desk where they want it, add a second monitor, or remove a plant that is in the
way. The office is theirs, but the layout is ours.

This change makes the floor plan **editable and portable**: the user adds furniture from
a catalogue, moves what is already there, and can save the whole arrangement to a file
and load it back later (or on another machine). The built-in plan becomes the *default*
layout, so nothing is lost and "reset" is always one action away.

## What Changes

- The office gains an **edit mode**: a furniture catalogue to add items, drag-to-move on
  the floor, rotate, and remove. Editing reuses the existing three.js models — no new
  model is authored.
- The floor plan becomes **data**: a list of placed items (`kind`, `x`, `y`, rotation)
  that the scene renders. The current `planOffice` output becomes the **default layout**
  and a reset restores it.
- The layout is **persisted** in the browser so it survives a reload, and can be
  **exported and imported as a JSON file**. Import validates the document and never
  destroys the current layout on a bad file.
- Furniture editing and agent moving stay independent: dragging a bot never moves a
  desk, and editing the floor never moves an agent.
- **No new dependency and no new asset.** The catalogue is exactly the procedural kit
  that already exists (desk, chair, monitor/PC, table, stool, plant, rug, bookshelf,
  cabinet, cooler, printer, calendar, whiteboard, poster).

## Capabilities

### Modified Capabilities

- `office-2d-ui`: adds the editable floor plan (catalogue, placement, remove), the
  default layout, and layout persistence plus JSON import/export. The existing
  isometric view, agent placement/movement, state visuals, and communication markers
  are unchanged.

## Assumptions

- The layout file is furniture only. Agent positions keep their own storage; folding
  them into the same file is a deliberate non-goal for this change.
- A layout document is versioned so a future format change can be detected rather than
  silently misread.
- One operator, one browser: concurrent editing and server-side layout storage are out
  of scope.

## Impact

- **New pure modules** in `apps/web/src/office/`: a layout document type and
  validate/serialize/parse helpers, a catalogue of the existing furniture kinds, and a
  storage/file port for persistence and import/export.
- **Scene changes**: render furniture from the layout document and add pointer editing
  for furniture, alongside the existing agent drag.
- **No contract, core, runtime, or adapter change.** The layout is a client concern.
- **Tests**: pure layout/parse round-trip tests, and browser coverage for adding,
  moving, and exporting/importing a layout.

Explicitly out of scope: custom model upload, free-form rotate/scaling beyond a
step rotation, collision, multi-floor offices, undo/redo, and sharing layouts through
the runtime.
