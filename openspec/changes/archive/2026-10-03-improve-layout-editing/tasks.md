# Tasks

## 1. Placing with a preview and a rotation

- [x] 1.1 Extend the pure `addItem` and the layout reducer's `add` action to carry a rotation (default 0), reusing `normalizeRotation` for 0/90/180/270 — verify: a unit test adds at each of the four rotations and the item keeps the normalised index
- [x] 1.2 Track the pending rotation and the pointer's floor position in `OfficeView`, and render a translucent preview of the pending item on the floor — verify: the browser suite shows the preview readout while a kind is selected and rotates the pending item before placing
- [x] 1.3 Expose the pending item and its orientation as an accessible readout (kind, degrees, floor position) — verify: a component test asserts the readout text, and the browser suite places at 90° and reads the rotation back
- [x] 1.4 Let Rotate act on the pending item when a kind is selected, and keep acting on a selected placed item otherwise — verify: a component test enables Rotate with only a pending kind and rotates the preview

## 2. Direct edit gestures

- [x] 2.1 In edit mode, right-click a placed item to remove it and suppress the browser context menu, without selecting it first — verify: the browser suite right-clicks an item and its stored layout loses that item while no other item or agent moves
- [x] 2.2 Ignore non-left buttons in the furniture drag path so a right-click never moves the item — verify: the same browser test asserts the removed item's neighbours are unchanged

## 3. Documentation, validation, and archive

- [x] 3.1 Document the new gestures in the README: the placement preview, rotating before placing, and right-click removal — verify: a reviewer can follow the README to place a rotated item and remove one
- [x] 3.2 Run the unit, architecture, code-health, and browser suites — verify: `npm test` and `npm run e2e` pass with no budget regressions
- [x] 3.3 Run `openspec validate improve-layout-editing --strict` (or the manual check where the CLI is unavailable), merge the delta into `openspec/specs/office-2d-ui/spec.md`, and archive the change — verify: the modified requirement is in the baseline and the change moves under `openspec/changes/archive/`
