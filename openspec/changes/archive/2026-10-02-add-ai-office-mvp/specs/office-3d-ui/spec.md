# Spec Delta

## Purpose

Turns the runtime into a place you can look at: a small 3D office where each agent is
a clickable bot whose pose says what it is doing, and where clicking a bot shows its
current activity, its next task, and its live prompt and terminal.

## ADDED Requirements

### Requirement: Office scene

The UI SHALL render a 3D office containing one bot per agent and a visual grouping of
agents by department. The scene SHALL be usable at a small default viewport size and
SHALL remain responsive while realtime events arrive.

#### Scenario: One bot per agent

- **WHEN** the UI receives a snapshot containing N agents
- **THEN** the scene shows N bots, each associated with exactly one agent

#### Scenario: Bots are labelled with name and live state

- **WHEN** the scene renders a bot
- **THEN** the bot shows its agent's name together with its current state, so the
  office can be read without opening the inspector

#### Scenario: Department grouping is visible

- **WHEN** agents belong to departments
- **THEN** the scene visually distinguishes those groups without requiring the user to
  open an inspector

#### Scenario: Scene renders without WebGL

- **WHEN** the environment cannot provide a 3D context
- **THEN** the UI reports that the 3D view is unavailable and still presents the
  accessible list view

### Requirement: Replaceable bot model

Bot appearance SHALL be resolved from an avatar manifest that maps a semantic bot
identity to model and animation assets and declares named animation clips including at
least idle, working, and blocked, and optionally complaining and stressed for context
pressure. Replacing or adding a bot model SHALL require only manifest and asset
changes, with no application code change.

#### Scenario: Swapping a bot model

- **WHEN** the manifest points a bot identity at a different model asset and the app
  is reloaded
- **THEN** the new model is displayed with no source change

#### Scenario: Missing or incomplete assets degrade gracefully

- **WHEN** a manifest entry references a missing model or omits a required animation
  clip
- **THEN** the UI substitutes a built-in placeholder bot and keeps functioning
  instead of failing to render the scene

#### Scenario: Default avatar needs no external assets

- **WHEN** no avatar manifest entry is provided at all
- **THEN** the office still renders a usable built-in bot for every agent

### Requirement: State-driven bot visuals

A bot's appearance and animation SHALL reflect its agent's runtime state. Every
runtime state SHALL map to a defined visual treatment, and the mapping SHALL be
data-driven so it can be changed without touching scene logic.

#### Scenario: Working agent looks busy

- **WHEN** an agent's runtime state becomes a running state
- **THEN** its bot plays the working animation in the location that represents its
  department

#### Scenario: Distinct non-running states

- **WHEN** an agent becomes idle, blocked, or errored
- **THEN** its bot presents a visually distinguishable treatment for each of those
  states

#### Scenario: Unknown state is safe

- **WHEN** an agent reports a runtime state the UI does not recognize
- **THEN** the bot falls back to the idle treatment and the UI does not break

### Requirement: Bot selection and inspector

The UI SHALL let a user select a bot by pointer and by keyboard navigation, and
SHALL open an inspector for the selected agent. The inspector SHALL show the agent's
current activity, its next task, and a live tail of its current session's
prompt and terminal output, and SHALL offer a way to open the full terminal view.

#### Scenario: Clicking a bot opens details

- **WHEN** the user selects a bot
- **THEN** the inspector opens showing that agent's current activity, next task, and
  current terminal output tail

#### Scenario: Current terminal output is live

- **WHEN** the selected agent's session produces new output while the inspector is
  open
- **THEN** the tail updates without the user re-selecting the agent

#### Scenario: Full terminal view

- **WHEN** the user opens the full terminal view for the selected agent
- **THEN** the retained scrollback is shown and new output streams in, and the user
  can return to the office

#### Scenario: Context usage is shown

- **WHEN** the selected agent's session reports context usage
- **THEN** the inspector shows the percent of context used and its pressure level,
  and updates them without re-selecting the agent

#### Scenario: No session yet

- **WHEN** the selected agent has no live session
- **THEN** the inspector states that no terminal is active and still shows the
  agent's current activity and next task

#### Scenario: Finished session transcript is retained

- **WHEN** an agent's run ends and no new run has started
- **THEN** the inspector still shows that session's retained terminal output rather
  than an empty terminal

#### Scenario: Task history with transcript and re-run

- **WHEN** the inspector shows an agent's task history
- **THEN** every task the agent has queued or run is listed, each with its status, a
  way to open that task's retained transcript, and a way to run it again

### Requirement: Context pressure mood

A bot's mood SHALL reflect its agent's context-pressure level: nominal under the
warning threshold, a visibly complaining mood at warning, and a visibly stressed mood
at critical. The level-to-mood mapping SHALL be data-driven, SHALL use the manifest's
mood clips when present, and SHALL fall back safely when a clip is missing or
pressure is unknown.

#### Scenario: Bot complains at the warning threshold

- **WHEN** an agent's context pressure becomes warning
- **THEN** its bot visibly complains and the change appears without a page reload

#### Scenario: Bot stresses at the critical threshold

- **WHEN** an agent's context pressure becomes critical
- **THEN** its bot visibly stresses, distinctly from the complaining mood

#### Scenario: Pressure eases

- **WHEN** an agent's context pressure returns to nominal, for example after its task
  ends
- **THEN** its bot returns to the mood for its runtime state

#### Scenario: Unknown pressure is neutral

- **WHEN** an agent's pressure is unknown because telemetry is unavailable
- **THEN** its bot shows no pressure mood and does not appear to be complaining or
  stressed

#### Scenario: Missing mood clip degrades

- **WHEN** the avatar manifest lacks a complaining or stressed clip
- **THEN** the bot uses a distinguishable built-in indicator instead and the scene
  keeps working

### Requirement: Dependency and report visibility

The inspector SHALL show whether the selected agent is waiting on other work, which
tasks it is waiting on, and the result or report of its most recent completed task.
The accessible list view SHALL expose the same waiting information.

#### Scenario: Waiting is visible

- **WHEN** the selected agent is blocked by unfinished dependencies
- **THEN** the inspector states what it is waiting on and lists the blocking tasks

#### Scenario: Last report is readable

- **WHEN** the selected agent has a completed task with a recorded result
- **THEN** the inspector shows that task's result without requiring the session to
  still be open

#### Scenario: Parallel work is distinguishable

- **WHEN** several agents are working at the same time
- **THEN** each working agent's bot is visibly in a working state simultaneously

### Requirement: Live office updates

The UI SHALL update bots, groupings, and the inspector from the realtime stream with
no page reload, and SHALL indicate when the connection to the runtime is lost and
recover automatically when it returns.

#### Scenario: Structural change appears live

- **WHEN** an agent or department is created, renamed, or removed while the UI is open
- **THEN** the scene reflects the change without a reload

#### Scenario: Connection lost

- **WHEN** the realtime connection drops
- **THEN** the UI shows a disconnected indicator, keeps the last known state visible,
  and reconnects without duplicating bots or losing the current selection

### Requirement: Accessible list fallback

The UI SHALL provide a non-3D list view of all agents that shows, for each agent, its
department, runtime state, current activity, and next task, and that supports the same
selection and inspector behavior as the scene.

#### Scenario: Same information without 3D

- **WHEN** the user switches to the list view
- **THEN** every agent is listed with its state, current activity, next task, context
  pressure, and what it is waiting on, and selecting a row opens the same inspector

#### Scenario: Reachable by keyboard

- **WHEN** a user navigates using only the keyboard
- **THEN** agents can be selected and the inspector opened and closed without a
  pointer

### Requirement: Minimal and composable UI boundary

The UI SHALL consume the runtime exclusively through the documented runtime contract
and SHALL NOT embed harness- or model-vendor specifics. Presentational components
SHALL depend on runtime data and commands passed to them rather than on a global
transport.

#### Scenario: No vendor leakage in the UI

- **WHEN** a new harness adapter or model provider is added to the runtime
- **THEN** no UI source file requires modification

#### Scenario: Transport is replaceable

- **WHEN** the runtime transport implementation changes but the contract does not
- **THEN** presentational components remain unchanged
