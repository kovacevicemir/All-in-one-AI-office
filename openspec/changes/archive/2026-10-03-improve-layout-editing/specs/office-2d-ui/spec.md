# Spec Delta

## MODIFIED Requirements

### Requirement: Editable floor plan

The office SHALL let the user add furniture from a catalogue of the existing items, move
a placed item by dragging it on the floor, rotate it in 90° steps through all four
orientations (0°, 90°, 180° and 270°), and remove it. While a catalogue kind is selected,
the office SHALL show a translucent preview of that item following the pointer on the
floor, at the position and orientation it will be placed with, and SHALL expose the
pending item and its orientation outside the scene. In edit mode, a right-click on a
placed item SHALL remove it without a browser context menu. Every catalogue item SHALL
reuse an existing procedural model; the change SHALL NOT introduce a new model or asset.
Furniture editing SHALL NOT move agents, and moving an agent SHALL NOT move furniture.
Editing SHALL be available only while the office is shown.

#### Scenario: Add furniture with a preview

- **WHEN** the user picks a kind from the catalogue and moves the pointer over the floor
- **THEN** a translucent preview of that item follows the pointer at the position it
  would be placed, and clicking the floor places the item there

#### Scenario: Preview shows the placement orientation

- **WHEN** the user rotates the pending item before placing it
- **THEN** the preview shows that orientation and the placed item keeps it

#### Scenario: Move furniture

- **WHEN** the user drags a placed item on the floor
- **THEN** that item's position follows the pointer and no agent and no other item moves

#### Scenario: Rotate through four orientations

- **WHEN** the user rotates a placed item
- **THEN** its rotation advances by a quarter turn through 0°, 90°, 180° and 270°, and
  the rest of the layout is unchanged

#### Scenario: Remove with the Remove control

- **WHEN** the user selects a placed item and chooses Remove
- **THEN** the item disappears and the rest of the layout is unchanged

#### Scenario: Remove with a right-click

- **WHEN** the user right-clicks a placed item in edit mode
- **THEN** that item is removed, no browser context menu is shown, and no other item or
  agent moves

#### Scenario: Reused models only

- **WHEN** the catalogue is shown
- **THEN** every entry is one of the existing furniture kinds, with no new model,
  texture, or external asset

#### Scenario: Furniture and agents stay independent

- **WHEN** the user drags an agent, or drags a piece of furniture
- **THEN** the other kind of object is unaffected
