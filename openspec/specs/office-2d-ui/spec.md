# office-2d-ui Specification


## Purpose

Turns the office into a place you can read at a glance: a flat floor seen in a fixed
isometric "Diablo-style" 2.5D view, where every agent has an `x`/`y` position and a 360°
facing direction, can be moved by dragging, shows what it is doing, and where
communication between agents is drawn between them.

## Requirements

### Requirement: Isometric office view

The UI SHALL present the office in a fixed isometric 2.5D view of a flat floor: parallel
floor lines SHALL stay parallel (orthographic projection), the camera SHALL look at the
room from a fixed isometric diagonal, and free rotation SHALL NOT be possible. Panning
and zooming SHALL be available, and the camera SHALL remain above the floor.

#### Scenario: Readable isometric floor

- **WHEN** the office renders
- **THEN** the floor is drawn as an isometric grid with the room's walls behind it and no
  perspective convergence

#### Scenario: Camera cannot rotate under the floor

- **WHEN** the user pans or zooms the office
- **THEN** the view direction stays the fixed isometric diagonal and the camera never
  passes below the floor

#### Scenario: The floor is a stable map

- **WHEN** agents move around the floor
- **THEN** their screen position changes consistently with their `x`/`y` position, so the
  same coordinates always map to the same place on the floor

### Requirement: Office scene

The UI SHALL render one bot per agent on the office floor and a visual grouping of agents
by department. The scene SHALL be usable at a small default viewport size and SHALL remain
responsive while realtime events arrive.

#### Scenario: One bot per agent

- **WHEN** the UI receives a snapshot containing N agents
- **THEN** the scene shows N bots, each associated with exactly one agent

#### Scenario: Bots are labelled with name and live state

- **WHEN** the scene renders a bot
- **THEN** the bot shows its agent's name together with its current state, so the office
  can be read without opening the inspector

#### Scenario: Department grouping is visible

- **WHEN** agents belong to departments
- **THEN** the scene visually distinguishes those groups without requiring the user to
  open an inspector

#### Scenario: Scene renders without WebGL

- **WHEN** the environment cannot provide a 3D context
- **THEN** the UI reports that the office view is unavailable and still presents the
  accessible list view

### Requirement: Agent placement and movement

Every agent SHALL have a position on the office floor expressed as `x` and `y`
coordinates and a facing direction in the full `0–360°` range. The user SHALL be able to
move an agent by dragging it, in any direction, and the agent SHALL turn to face the
direction it is being moved. Positions SHALL be clamped to the room and SHALL be retained
when the user switches between the office and the list and when the page is reloaded.
Moving one agent SHALL NOT move any other agent.

#### Scenario: Drag moves an agent

- **WHEN** the user drags a bot on the floor
- **THEN** that agent's `x`/`y` position follows the pointer and no other agent moves

#### Scenario: Facing follows the movement direction

- **WHEN** an agent is dragged in any direction
- **THEN** it turns to face that direction, including diagonals and the reverse of its
  previous heading

#### Scenario: Movement is clamped to the room

- **WHEN** an agent is dragged towards or past the edge of the floor
- **THEN** its position is clamped so the bot stays inside the room

#### Scenario: Position is retained

- **WHEN** the user moves an agent and then switches to the list view and back, or reloads
  the page
- **THEN** the agent is still at its moved position

#### Scenario: New and removed agents are handled

- **WHEN** a new agent appears or an existing agent is removed
- **THEN** the new agent receives a default floor position and any stored position for the
  removed agent is discarded, without disturbing the other agents

### Requirement: Replaceable bot model

Bot appearance SHALL be resolved from an avatar manifest that maps a semantic bot identity
to model and animation assets and declares named animation clips including at least idle,
working, and blocked, and optionally complaining and stressed for context pressure.
Replacing or adding a bot model SHALL require only manifest and asset changes, with no
application code change. The office SHALL reuse an existing model rather than authoring a
new one when no manifest entry is provided.

#### Scenario: Swapping a bot model

- **WHEN** the manifest points a bot identity at a different model asset and the app is
  reloaded
- **THEN** the new model is displayed with no source change

#### Scenario: Missing or incomplete assets degrade gracefully

- **WHEN** a manifest entry references a missing model or omits a required animation clip
- **THEN** the UI substitutes a built-in placeholder bot and keeps functioning instead of
  failing to render the scene

#### Scenario: Default bot needs no external assets

- **WHEN** no avatar manifest entry is provided at all
- **THEN** the office still renders a usable built-in bot for every agent

### Requirement: State-driven bot visuals

A bot's appearance SHALL reflect its agent's runtime state. Every runtime state SHALL map
to a defined visual treatment, and the mapping SHALL be data-driven so it can be changed
without touching scene logic. A working agent SHALL be visibly busy and a finished agent
SHALL be visibly done.

#### Scenario: Working agent looks busy

- **WHEN** an agent's runtime state becomes a running state
- **THEN** its bot plays the working treatment, including a visible in-progress indicator,
  in its current floor position

#### Scenario: Done agent looks finished

- **WHEN** an agent's run completes successfully
- **THEN** its bot presents a distinct finished treatment

#### Scenario: Distinct non-running states

- **WHEN** an agent becomes idle, blocked, or errored
- **THEN** its bot presents a visually distinguishable treatment for each of those states

#### Scenario: Unknown state is safe

- **WHEN** an agent reports a runtime state the UI does not recognize
- **THEN** the bot falls back to the idle treatment and the UI does not break

### Requirement: Bot selection and inspector

The UI SHALL let a user select a bot by pointer and by keyboard navigation, and SHALL open
an inspector for the selected agent. The inspector SHALL show the agent's current
activity, its next task, and a live tail of its current session's prompt and terminal
output, and SHALL offer a way to open the full terminal view.

#### Scenario: Clicking a bot opens details

- **WHEN** the user selects a bot
- **THEN** the inspector opens showing that agent's current activity, next task, and
  current terminal output tail

#### Scenario: Current terminal output is live

- **WHEN** the selected agent's session produces new output while the inspector is open
- **THEN** the tail updates without the user re-selecting the agent

#### Scenario: Full terminal view

- **WHEN** the user opens the full terminal view for the selected agent
- **THEN** the retained scrollback is shown and new output streams in, and the user can
  return to the office

#### Scenario: Context usage is shown

- **WHEN** the selected agent's session reports context usage
- **THEN** the inspector shows the percent of context used and its pressure level, and
  updates them without re-selecting the agent

#### Scenario: No session yet

- **WHEN** the selected agent has no live session
- **THEN** the inspector states that no terminal is active and still shows the agent's
  current activity and next task

#### Scenario: Finished session transcript is retained

- **WHEN** an agent's run ends and no new run has started
- **THEN** the inspector still shows that session's retained terminal output rather than
  an empty terminal

#### Scenario: Task history with transcript and re-run

- **WHEN** the inspector shows an agent's task history
- **THEN** every task the agent has queued or run is listed, each with its status, a way
  to open that task's retained transcript, and a way to run it again

### Requirement: Context pressure mood

A bot's mood SHALL reflect its agent's context-pressure level: nominal under the warning
threshold, a visibly complaining mood at warning, and a visibly stressed mood at
critical. The level-to-mood mapping SHALL be data-driven and SHALL fall back safely when
pressure is unknown.

#### Scenario: Bot complains at the warning threshold

- **WHEN** an agent's context pressure becomes warning
- **THEN** its bot visibly complains and the change appears without a page reload

#### Scenario: Bot stresses at the critical threshold

- **WHEN** an agent's context pressure becomes critical
- **THEN** its bot visibly stresses, distinctly from the complaining mood

#### Scenario: Pressure eases

- **WHEN** an agent's context pressure returns to nominal, for example after its task ends
- **THEN** its bot returns to the mood for its runtime state

#### Scenario: Unknown pressure is neutral

- **WHEN** an agent's pressure is unknown because telemetry is unavailable
- **THEN** its bot shows no pressure mood and does not appear to be complaining or stressed

### Requirement: Dependency and report visibility

The inspector SHALL show whether the selected agent is waiting on other work, which tasks
it is waiting on, and the result or report of its most recent completed task. The
accessible list view SHALL expose the same waiting information.

#### Scenario: Waiting is visible

- **WHEN** the selected agent is blocked by unfinished dependencies
- **THEN** the inspector states what it is waiting on and lists the blocking tasks

#### Scenario: Last report is readable

- **WHEN** the selected agent has a completed task with a recorded result
- **THEN** the inspector shows that task's result without requiring the session to still
  be open

#### Scenario: Parallel work is distinguishable

- **WHEN** several agents are working at the same time
- **THEN** each working agent's bot is visibly in a working state simultaneously

### Requirement: Live office updates

The UI SHALL update bots, positions, groupings, and the inspector from the realtime stream
with no page reload, and SHALL indicate when the connection to the runtime is lost and
recover automatically when it returns.

#### Scenario: Structural change appears live

- **WHEN** an agent or department is created, renamed, or removed while the UI is open
- **THEN** the scene reflects the change without a reload, giving a new agent a default
  floor position and leaving the moved positions of the others intact

#### Scenario: Connection lost

- **WHEN** the realtime connection drops
- **THEN** the UI shows a disconnected indicator, keeps the last known state and floor
  positions visible, and reconnects without duplicating bots or losing the current
  selection

### Requirement: Accessible list fallback

The UI SHALL provide a non-scene list view of all agents that shows, for each agent, its
department, runtime state, current activity, and next task, and that supports the same
selection and inspector behavior as the scene.

#### Scenario: Same information without the scene

- **WHEN** the user switches to the list view
- **THEN** every agent is listed with its state, current activity, next task, context
  pressure, and what it is waiting on, and selecting a row opens the same inspector

#### Scenario: Reachable by keyboard

- **WHEN** a user navigates using only the keyboard
- **THEN** agents can be selected and the inspector opened and closed without a pointer

### Requirement: Minimal and composable UI boundary

The UI SHALL consume the runtime exclusively through the documented runtime contract and
SHALL NOT embed harness- or model-vendor specifics. Presentational components SHALL depend
on runtime data and commands passed to them rather than on a global transport.

#### Scenario: No vendor leakage in the UI

- **WHEN** a new harness adapter or model provider is added to the runtime
- **THEN** no UI source file requires modification

#### Scenario: Transport is replaceable

- **WHEN** the runtime transport implementation changes but the contract does not
- **THEN** presentational components remain unchanged

### Requirement: Communication marker

Wherever communication between two agents is happening or has recently happened, the
office SHALL draw a marker: a dashed line between the two agents on the floor with an
envelope at its midpoint. In a transcript the marker appears inline at the point the
communication is recorded. The marker's appearance SHALL reflect the communication's
lifecycle, and distinct simultaneous communications SHALL remain individually
distinguishable.

#### Scenario: Floor link between two agents

- **WHEN** a communication is active between two agents shown in the office
- **THEN** a dashed line with an envelope at its midpoint is drawn between their floor
  positions

#### Scenario: Inline transcript marker

- **WHEN** a communication is recorded in a session's stream
- **THEN** the transcript shows a dashed separator with an envelope at that point, between
  the surrounding output

#### Scenario: Lifecycle is visible

- **WHEN** a communication becomes answered, failed, or cancelled
- **THEN** its marker changes appearance to reflect the new status

#### Scenario: Several at once remain distinguishable

- **WHEN** two or more communications involve the same agents at the same time
- **THEN** each remains separately selectable and its own summary can be shown

### Requirement: Communication summary on hover or focus

Hovering or keyboard-focusing a communication marker SHALL show a summary popover naming
who is requesting what: the direction (`sender → recipient`), the related task or result,
the status, and the time. The summary SHALL come from the communication event and SHALL
NOT be fabricated. The same summary SHALL be reachable without a pointer, and the
accessible list SHALL expose every communication.

#### Scenario: Hover shows the summary

- **WHEN** the user hovers a floor marker or an inline transcript marker
- **THEN** a popover shows the direction, the ask or delivery, the related task, the
  status, and the time

#### Scenario: Keyboard reaches the summary

- **WHEN** the user focuses a marker with the keyboard
- **THEN** the same summary is shown, not only on hover

#### Scenario: Accessible list mirrors the scene

- **WHEN** communications exist
- **THEN** the inspector lists them with the same summary information, independent of the
  office view

#### Scenario: Missing reference is disclosed

- **WHEN** a communication references an agent or task that is no longer present
- **THEN** the summary states that the reference is missing instead of showing a blank or
  invented name

### Requirement: Furnished office environment

The office SHALL depict a furnished workspace built only from the existing procedural
models: a floor with a defined footprint, at least one desk with a chair and a monitor per
agent, shared furniture per department zone, at least two plants, a rug, and wall decor
including a calendar and a whiteboard. Furniture placement SHALL come from a pure layout
function so it can be verified without WebGL. The scene SHALL NOT fetch any asset beyond
the existing avatar manifest.

#### Scenario: Office is furnished by default

- **WHEN** the office renders with one or more agents
- **THEN** the floor includes a desk, chair, and monitor per agent plus shared props
  (plants, rug, calendar, whiteboard)

#### Scenario: Department zones are furnished

- **WHEN** agents belong to a department
- **THEN** that zone contains a desk per agent in the department and at least one shared
  prop

#### Scenario: Furniture layout is testable without WebGL

- **WHEN** the layout function is given a set of agents and departments
- **THEN** it returns deterministic positions for desks, chairs, and props that unit tests
  can assert without a rendering context

#### Scenario: No external assets

- **WHEN** the furnished scene renders
- **THEN** no network request is made for furniture models or textures

### Requirement: Agent identity in both views

Every agent SHALL present its name together with its department when it belongs to one, in
the bot label and in the accessible list. An agent with no department SHALL present its
name without a department rather than a misleading placeholder.

#### Scenario: Department under the name on the floor

- **WHEN** a bot belongs to a department
- **THEN** the bot label shows the department directly under the agent's name

#### Scenario: Department under the name in the list

- **WHEN** the accessible list renders an agent that belongs to a department
- **THEN** the department is shown with the agent's name

#### Scenario: Unassigned agent

- **WHEN** an agent belongs to no department
- **THEN** its name is shown with no department

### Requirement: Agent profile editor

The UI SHALL let a user view and edit the selected agent's description and instructions
and save them. Saving SHALL report success and persist the values; a rejected save SHALL
surface the error and keep the editor's content so no work is lost. The editor SHALL show
the agent's saved values when the agent is selected.

#### Scenario: Edit and save

- **WHEN** the user edits the description and instructions and saves
- **THEN** a success confirmation is shown and reopening the agent shows the saved values

#### Scenario: Save fails

- **WHEN** a save is rejected by the runtime
- **THEN** the error is shown and the edited text remains in the editor

#### Scenario: Switching agents loads their profile

- **WHEN** the user selects a different agent
- **THEN** the editor shows that agent's saved description and instructions

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
