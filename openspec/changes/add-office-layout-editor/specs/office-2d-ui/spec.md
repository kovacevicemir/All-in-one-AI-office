# Spec Delta

## Purpose

Makes the office the user's own: furniture can be added, moved, rotated, and removed
using the existing procedural models; the built-in furnished plan is the default and can
be restored; and the whole arrangement can be saved and loaded as a JSON file.

## ADDED Requirements

### Requirement: Editable floor plan

The office SHALL let the user add furniture from a catalogue of the existing items, move
a placed item by dragging it on the floor, rotate it, and remove it. Every catalogue item
SHALL reuse an existing procedural model; the change SHALL NOT introduce a new model or
asset. Furniture editing SHALL NOT move agents, and moving an agent SHALL NOT move
furniture. Editing SHALL be available only while the office is shown.

#### Scenario: Add furniture

- **WHEN** the user picks an item from the catalogue and places it on the floor
- **THEN** that item appears at the chosen position and is immediately draggable

#### Scenario: Move furniture

- **WHEN** the user drags a placed item on the floor
- **THEN** that item's position follows the pointer and no agent and no other item moves

#### Scenario: Rotate and remove

- **WHEN** the user rotates or removes a placed item
- **THEN** the item's rotation changes or the item disappears, and the rest of the layout
  is unchanged

#### Scenario: Reused models only

- **WHEN** the catalogue is shown
- **THEN** every entry is one of the existing furniture kinds, with no new model, texture,
  or external asset

#### Scenario: Furniture and agents stay independent

- **WHEN** the user drags an agent, or drags a piece of furniture
- **THEN** the other kind of object is unaffected

### Requirement: Default office layout

The office SHALL ship a default layout derived by a pure function from the existing
furnished plan, used whenever no layout has been saved. The user SHALL be able to reset
the office to that default in one action.

#### Scenario: First run shows the default

- **WHEN** the office is opened with no saved layout
- **THEN** the default furnished plan is shown and becomes the starting layout

#### Scenario: Reset restores the default

- **WHEN** the user resets the layout after editing
- **THEN** the default furnished plan is restored and the edits are discarded

#### Scenario: Default is not duplicated by hand

- **WHEN** the default layout is produced
- **THEN** it comes from the same pure plan that furnishes a fresh office, so the two
  cannot drift

### Requirement: Layout persistence

The working layout SHALL be retained when the user switches between the office and the
list view and when the page is reloaded. A missing or unreadable saved layout SHALL fall
back to the default instead of failing to render.

#### Scenario: Edits survive a reload

- **WHEN** the user edits the layout and reloads the page
- **THEN** the edited layout is shown again

#### Scenario: Edits survive a view switch

- **WHEN** the user edits the layout, switches to the list view, and returns
- **THEN** the edited layout is still shown

#### Scenario: Damaged stored data degrades

- **WHEN** the stored layout is missing or cannot be parsed
- **THEN** the office shows the default layout and keeps working

### Requirement: Layout import and export

The user SHALL be able to export the current layout to a JSON file and import a layout
from a JSON file. The document SHALL be versioned, and an exported layout SHALL
round-trip through import to the same arrangement. Import SHALL validate the document
before applying it: an invalid, unreadable, or unsupported-version file SHALL be reported
with a specific reason and SHALL leave the current layout untouched.

#### Scenario: Export then import round-trips

- **WHEN** the user exports the layout and imports that file into an empty office
- **THEN** the office shows the same items in the same positions and rotations

#### Scenario: Invalid file is rejected safely

- **WHEN** the user imports a file that is not a valid layout document
- **THEN** an error explaining why is shown and the current layout is unchanged

#### Scenario: Unsupported version is reported

- **WHEN** the imported document declares a version this build does not support
- **THEN** the import is refused with that reason rather than guessed at

#### Scenario: Unknown items are disclosed

- **WHEN** a valid document contains an item kind this build does not know
- **THEN** the unknown items are skipped, the rest are imported, and the user is told how
  many were skipped
