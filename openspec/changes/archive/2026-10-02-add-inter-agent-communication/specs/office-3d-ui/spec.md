# Spec Delta

## Purpose

Shows inter-agent communication in the office: a dashed line with an envelope between
the two agents in 3D, an inline dashed marker in the transcript, and a hover/focus
summary of who is requesting what — with the same information available to the
accessible list.

## ADDED Requirements

### Requirement: Communication marker

Wherever communication between two agents is happening or has recently happened, the
office SHALL draw a marker: a dashed line between the two agents with an envelope at
its midpoint. In the 3D office the line connects the two bots; in a transcript the
marker appears inline at the point the communication is recorded. The marker's
appearance SHALL reflect the communication's lifecycle, and distinct simultaneous
communications SHALL remain individually distinguishable.

#### Scenario: 3D link between two bots

- **WHEN** a communication is active between two agents shown in the 3D office
- **THEN** a dashed line with an envelope at its midpoint is drawn between their bots

#### Scenario: Inline transcript marker

- **WHEN** a communication is recorded in a session's stream
- **THEN** the transcript shows a dashed separator with an envelope at that point,
  between the surrounding output

#### Scenario: Lifecycle is visible

- **WHEN** a communication becomes answered, failed, or cancelled
- **THEN** its marker changes appearance to reflect the new status

#### Scenario: Several at once remain distinguishable

- **WHEN** two or more communications involve the same agents at the same time
- **THEN** each remains separately selectable and its own summary can be shown

### Requirement: Communication summary on hover or focus

Hovering or keyboard-focusing a communication marker SHALL show a summary popover
naming who is requesting what: the direction (`sender → recipient`), the related task
or result, the status, and the time. The summary SHALL come from the communication
event and SHALL NOT be fabricated. The same summary SHALL be reachable without a
pointer, and the accessible list SHALL expose every communication.

#### Scenario: Hover shows the summary

- **WHEN** the user hovers a 3D marker or an inline transcript marker
- **THEN** a popover shows the direction, the ask or delivery, the related task, the
  status, and the time

#### Scenario: Keyboard reaches the summary

- **WHEN** the user focuses a marker with the keyboard
- **THEN** the same summary is shown, not only on hover

#### Scenario: Accessible list mirrors the scene

- **WHEN** communications exist
- **THEN** the inspector lists them with the same summary information, independent of
  the 3D view

#### Scenario: Missing reference is disclosed

- **WHEN** a communication references an agent or task that is no longer present
- **THEN** the summary states that the reference is missing instead of showing a blank
  or invented name
