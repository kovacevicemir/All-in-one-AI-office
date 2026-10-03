# Spec Delta

## ADDED Requirements

### Requirement: Task voice dictation

The Queue a task form SHALL offer a microphone control on the instruction field that
records speech and, when recording ends, SHALL open a confirmation modal containing the
cleaned transcript in an editable field. Confirming — by voice or by pressing Send —
SHALL fill the instruction field with the cleaned text; it SHALL NOT create or submit
the task on its own, and SHALL NOT require a live agent session. The modal SHALL always
provide a Cancel action, and cancelling SHALL discard the draft and leave the field
unchanged.

#### Scenario: Dictate an instruction without a run

- **WHEN** the user records speech from the Queue a task form while no agent run is live
- **THEN** the confirmation modal opens with the cleaned transcript and, once confirmed,
  the instruction field holds that text

#### Scenario: Confirm fills the field, does not queue

- **WHEN** the user confirms a dictated instruction
- **THEN** the field is filled and nothing is added to the queue until the user presses
  Add to queue

#### Scenario: Edit then send fills the edited text

- **WHEN** the user edits the field in the modal and presses Send
- **THEN** the instruction field holds the edited text

#### Scenario: Cancel leaves the field unchanged

- **WHEN** the user cancels the dictation modal
- **THEN** the instruction field keeps whatever it held before recording

#### Scenario: Voice unavailable

- **WHEN** the browser lacks microphone support, permission is denied, or the model
  fails to load
- **THEN** the microphone control is disabled with an explanation and the task form can
  still be filled and submitted by typing
