# Tasks

## 1. Retire the 3D capability and land the 2D specification

- [x] 1.1 Delete the `office-3d-ui` baseline spec and create the `office-2d-ui` baseline spec from this change's delta, so `openspec/specs/office-2d-ui/spec.md` is the source of truth — verify: no file remains under `openspec/specs/office-3d-ui/` and every requirement in the delta appears in the baseline
- [x] 1.2 Re-point the active `add-voice-prompt-input` delta from `office-3d-ui` to `office-2d-ui` and update its proposal's modified-capability name — verify: `grep -r office-3d openspec/changes/add-voice-prompt-input` returns nothing
- [x] 1.3 Update the one stale "3D UI" mention in `openspec/specs/office-runtime-api/spec.md` to the 2D office — verify: `grep -rn "3D UI" openspec/specs` returns nothing

## 2. Pure placement and movement

- [x] 2.1 Add `apps/web/src/office/placement.ts` with `AgentPose { x, y, facing }`, room bounds, `defaultPoses(agents, departments)`, `reconcilePoses(existing, defaults)`, `clampPose(pose, bounds)`, `facingFromDelta(dx, dy, previous)`, and `movePose(pose, dx, dy, bounds)` — verify: unit tests assert deterministic defaults, added/removed agents, clamping at every edge, and that facing follows each of up/down/left/right/diagonal/reverse moves
- [x] 2.2 Add `apps/web/src/office/pose-storage.ts` that loads and saves a `PoseMap` through a minimal `{ getItem, setItem }` port, tolerating absent or malformed data — verify: unit tests with an in-memory storage fake cover a round trip, missing data, and malformed JSON

## 3. Isometric scene and reuse of the existing models

- [x] 3.1 Replace `apps/web/src/office/Scene.tsx` with `OfficeScene.tsx` using an orthographic camera on a fixed isometric diagonal, rotation disabled, pan and zoom enabled, and the existing floor/wall decor adapted to the flat room — verify: `npm run typecheck` passes and the browser suite asserts the floor renders with the office visible
- [x] 3.2 Reuse `Bot` and `Furniture` unchanged except for a `facing` rotation and a floor-position input; do not author new models — verify: a source check shows `furniture.tsx` unchanged in geometry and `Bot` only gains position/facing/drag props
- [x] 3.3 Position bots from the pose map (default from `defaultPoses`) and draw the department zones on the floor — verify: the browser suite shows one bot per agent at its stored coordinates

## 4. Working / done indication and drag-to-move

- [x] 4.1 Keep the data-driven `visualForAgent` mapping and add a floor status ring that pulses while an agent is working and shows a finished treatment when its run completes — verify: unit tests keep every state mapped, and the browser suite shows a working agent and a done agent with distinct treatments
- [x] 4.2 Wire drag on a bot's hitbox to `movePose`, updating the pose and facing live, and select on a drag that does not move — verify: the browser suite drags a bot and asserts its position and heading change and that a plain click still selects
- [x] 4.3 Clamp and persist: a moved pose is written through the storage port and reloading the page restores it — verify: the browser suite reloads and the bot is still at the moved position; a unit test covers malformed stored data

## 5. Communication visualisation

- [x] 5.1 Reuse `communication-links.ts` and `CommunicationLinks` with floor endpoints and keep the envelope marker, lifecycle colour, and per-pair offset — verify: existing unit tests pass for midpoints, per-pair offsets, and unplaced agents
- [x] 5.2 Keep the hover and focus summary popover and the inline transcript marker working against the floor marker — verify: the browser suite hovers a floor marker and asserts the summary text; the marker component tests still pass

## 6. UI wiring and graceful degradation

- [x] 6.1 Wire `App.tsx` to the pose hook and `OfficeScene`, rename the view control to "Office", and keep the list view as the fallback when WebGL is unavailable — verify: component tests still render the list and `npm run typecheck` passes
- [x] 6.2 Remove the now-unused `webgl.ts` probe only if the fallback no longer needs it; otherwise keep it — verify: no dead exports remain (checked by the code-health gate)

## 7. Documentation and end-to-end coverage

- [x] 7.1 Update the README to describe the isometric 2D office, dragging agents, 360° facing, and the reused models; remove the 3D-orbit and perspective claims — verify: `grep -in "3d office\|orbit\|maxPolarAngle" README.md` returns nothing describing the current product
- [x] 7.2 Replace `e2e/office-3d.spec.ts` with a `e2e/office-2d.spec.ts` that opens the office, asserts a bot, drags it, and hovers a communication link — verify: `npm run e2e` passes for the new file
- [x] 7.3 Run the full unit, architecture, and code-health suites — verify: `npm test` passes with no budget regressions

## 8. Spec validation and archive

- [x] 8.1 Apply this change's delta to the baseline specs, move the change to `openspec/changes/archive/2026-10-03-add-2d-office`, and confirm no `office-3d-ui` spec remains — verify: `openspec validate add-2d-office --strict` (or, where the CLI is unavailable, a manual check that every requirement in the delta is present in the baseline and no delta headers leak into baseline specs)
