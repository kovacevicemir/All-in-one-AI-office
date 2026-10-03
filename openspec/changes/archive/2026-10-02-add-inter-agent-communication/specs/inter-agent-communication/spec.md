# Spec Delta

## Purpose

Makes inter-agent work visible as a first-class, vendor-neutral event: who asked whom
for what, derived from the delegation and dependency interactions the office already
performs, with a lifecycle and a one-line summary.

## ADDED Requirements

### Requirement: Communication event derivation

The system SHALL derive a normalized communication event whenever one agent directs
work or information at another through an interaction the office performs. It SHALL
derive a `request` event when a task is created for one agent with another agent as its
origin, and a `handoff` event when one agent's task results are delivered to another
agent's dependent task. Each event SHALL carry a stable id, the sending and receiving
agent ids, a kind, a lifecycle status, a one-line summary, the related task and/or
result task, and creation and update timestamps. Derivation SHALL be a pure function of
task, run, and agent state, so the same inputs always yield the same events.

#### Scenario: Delegation is a request

- **WHEN** an agent creates a task assigned to another agent with the creating agent as
  its origin
- **THEN** a `request` communication from the creator to the assignee is recorded,
  referencing that task

#### Scenario: Dependency results are a hand-off

- **WHEN** a dependent task starts and receives another agent's task results
- **THEN** a `handoff` communication from the producing agent to the receiving agent is
  recorded, referencing both tasks

#### Scenario: Same inputs, same events

- **WHEN** the derivation runs twice over the same state
- **THEN** it produces the same events, with no duplicates

#### Scenario: No interaction, no event

- **WHEN** two agents run unrelated tasks with no delegation or dependency between them
- **THEN** no communication event is recorded

### Requirement: Communication lifecycle

A communication event SHALL have a lifecycle status of `open`, `answered`, `failed`, or
`cancelled`. A `request` SHALL be `open` while its task is queued or running and SHALL
become `answered` when the task is done, `failed` when the task fails, and `cancelled`
when the task is cancelled. A `handoff` SHALL be `answered` at delivery. Lifecycle
changes SHALL be observable and SHALL NOT delete the event.

#### Scenario: Request answered

- **WHEN** the delegated task completes successfully
- **THEN** its communication becomes `answered`

#### Scenario: Request failed

- **WHEN** the delegated task fails or is cancelled
- **THEN** its communication becomes `failed` or `cancelled` respectively

#### Scenario: Hand-off is answered on delivery

- **WHEN** dependency results are delivered to a dependent task
- **THEN** the hand-off communication is `answered` immediately

### Requirement: Communication summary

Every communication event SHALL have a one-line summary that names both agents and
states what is being requested or delivered, suitable for a hover/focus tooltip. The
summary SHALL be produced by a pure function and SHALL NOT fabricate an agent or task
name: unknown references SHALL be reported explicitly.

#### Scenario: Request summary names both agents and the ask

- **WHEN** a request event is summarized
- **THEN** the summary reads as `sender → recipient` followed by the referenced task
  title

#### Scenario: Hand-off summary names both agents and the result

- **WHEN** a hand-off event is summarized
- **THEN** the summary reads as `producer → consumer` followed by the delivered task

#### Scenario: Unknown reference is explicit

- **WHEN** a referenced agent or task is no longer available
- **THEN** the summary identifies the missing reference rather than inventing a name

### Requirement: Communication retention

Communication events SHALL be retained with the office state in a bounded history and
SHALL be available in the read model and the realtime stream. The most recent events
SHALL be available after a restart where the underlying tasks and runs are retained.

#### Scenario: Events survive restart

- **WHEN** the office restarts with retained tasks and runs
- **THEN** their communication events are available again

#### Scenario: Bounded history

- **WHEN** more communications occur than the retention limit
- **THEN** the oldest are dropped from the read model and the reported oldest retained
  event advances, while the underlying tasks remain
