# Tasks

## 1. The layout document and its pure operations

- [x] 1.1 Add `apps/web/src/office/layout-document.ts` defining `LayoutItem { id, kind, x, y, rotation }` and `LayoutDocument { version, items }`, with the current `FurnitureKind` as the only allowed kinds — verify: `LayoutItem`/`LayoutDocument` typecheck and no new kind is introduced
- [x] 1.2 Add pure `addItem`, `moveItem`, `rotateItem`, and `removeItem` helpers with stable ids and room clamping — verify: unit tests cover add, move, rotate by a step, remove, clamping at each edge, and that ids stay unique
- [x] 1.3 Add pure `serializeLayout` / `parseLayout` with version checking, dropping unknown kinds and non-finite coordinates, and reporting skipped counts and a reason — verify: unit tests round-trip a document, reject a non-document, report an unsupported version, skip an unknown kind, and clamp out-of-room coordinates
- [x] 1.4 Add `apps/web/src/office/furniture-catalogue.ts` grouping the existing kinds for the palette (seating, desks, tech, decor, plants, shared) — verify: a unit test asserts every `FurnitureKind` appears exactly once and no kind outside the model set is listed

## 2. Default layout and persistence

- [x] 2.1 Add `defaultLayout(agents, departments)` that converts the existing pure `planOffice(...)` output into a `LayoutDocument` with stable ids — verify: unit tests assert the default has the same item counts as `planOffice`, is deterministic, and changes when departments change
- [x] 2.2 Add `apps/web/src/office/layout-storage.ts` reading and writing the document through the existing `{ getItem, setItem }` port, falling back to the default on missing or malformed data — verify: unit tests cover a round trip, missing data, malformed JSON, and an unavailable store
- [x] 2.3 Add `apps/web/src/office/use-office-layout.ts` owning the working layout (default when unset), persisting every change, and exposing reset-to-default — verify: unit tests of the pure reducer cover load, edit, and reset; a component/e2e test shows edits surviving a reload and a view switch

## 3. Import and export

- [x] 3.1 Add `apps/web/src/office/layout-file.ts` with a `LayoutFilePort` (`exportFile(name, text)`, `importFile(): Promise<string | null>`) and a browser implementation using a download blob and a file input, plus an in-memory fake for tests — verify: unit tests with the fake cover export then import round-trip and a cancelled import
- [x] 3.2 Wire import through `parseLayout` so an invalid, unreadable, or unsupported-version file reports a specific reason and leaves the current layout untouched — verify: unit tests cover each rejection and assert the current layout is unchanged; a valid file with unknown kinds imports the rest and reports the skipped count

## 4. Render the office from the layout

- [x] 4.1 Change the scene to render furniture from the working `LayoutDocument` instead of calling `planOffice` inline, keeping the existing `Furniture` dispatcher and models — verify: the browser suite shows the default layout on first load and shows an imported layout after import
- [x] 4.2 Keep the default layout equal to the plan a fresh office currently shows, so no visual change appears until the user edits — verify: a browser screenshot check (or an item-count assertion) matches the pre-change default

## 5. Edit interactions and palette UI

- [x] 5.1 Add an edit-mode toggle and a catalogue panel; selecting a kind then clicking the floor places an item — verify: a browser test enters edit mode, places a chair, and asserts the item count grows by one
- [x] 5.2 Reuse the floor raycast so a furniture drag starts only in edit mode; agent drags keep working in both modes — verify: browser tests drag a desk in edit mode and confirm an agent moved by a separate drag never moves the desk, and vice versa
- [x] 5.3 Add rotate and remove actions for a selected item and a reset-to-default action, with the current selection shown — verify: a browser test rotates and removes an item and resets the layout, asserting the default returns
- [x] 5.4 Keep the edit UI keyboard-reachable and make sure it does not require a pointer to add, remove, or reset — verify: a component test drives add/remove/reset through focusable controls

## 6. Documentation and end-to-end coverage

- [x] 6.1 Document the editor in the README: edit mode, the catalogue, moving and rotating, and the layout file format with an example — verify: a reviewer can add furniture, export the layout, and import it back from the README alone
- [x] 6.2 Extend the browser suite to cover add, move, reset, export, and a rejected import — verify: `npm run e2e` passes with no real file dialog and no network
- [x] 6.3 Run the unit, architecture, and code-health suites — verify: `npm test` passes with no budget regressions

## 7. Spec validation and archive

- [x] 7.1 Run `openspec validate add-office-layout-editor --strict`, merge the delta into `openspec/specs/office-2d-ui/spec.md`, and archive the change — verify: validation is clean (or, where the CLI is unavailable, a manual check that every delta requirement is in the baseline and no delta headers leak) and the change moves under `openspec/changes/archive/`
