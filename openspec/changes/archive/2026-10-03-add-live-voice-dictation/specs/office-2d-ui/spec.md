# Spec Delta

## MODIFIED Requirements

### Requirement: Voice prompt confirmation

The prompt input SHALL offer a microphone control that writes recognized speech into
the prompt field as the user speaks, cleaned of filler words, appending to any text
already there, so the prompt takes shape while they talk. The microphone SHALL NOT send
anything to the agent; the prompt is sent only when the user presses Send. Where no
streaming engine is available, recording SHALL open a confirmation modal containing the
cleaned transcript in an editable field, and confirming SHALL fill the field rather than
send. The modal SHALL always provide a Cancel action. The control SHALL show a clear
recording state and a way to stop it.

#### Scenario: Recording opens the confirmation modal

- **WHEN** the browser has no streaming engine and the user records and stops
- **THEN** a modal opens showing the cleaned transcript in an editable field

#### Scenario: Confirm by voice sends the prompt

- **WHEN** the confirmation is committed by voice or by Send
- **THEN** the current field text is written into the prompt field, and it is sent to the
  selected agent only when the user presses Send

#### Scenario: Edit then send

- **WHEN** the user edits the prompt field and presses Send
- **THEN** the edited text is sent to the selected agent

#### Scenario: Cancel discards the draft

- **WHEN** the user cancels the confirmation modal
- **THEN** nothing is sent and the prompt field is left unchanged

#### Scenario: Editing stops the confirmation listener

- **WHEN** the user starts editing the field
- **THEN** voice confirmation stops listening so keystrokes are not transcribed, and
  the user can re-arm listening explicitly

#### Scenario: Voice unavailable

- **WHEN** the browser lacks microphone support or permission is denied
- **THEN** the microphone control is disabled with an explanation and text prompting
  still works

### Requirement: Task voice dictation

The Queue a task form SHALL offer a microphone control on the instruction field that
writes recognized speech into the field as the user speaks, cleaned of filler words,
appending to any text already there. It SHALL NOT create or submit the task on its own,
and SHALL NOT require a live agent session. Where no streaming engine is available,
recording SHALL open a confirmation modal containing the cleaned transcript in an
editable field, confirming SHALL fill the instruction field, and Cancel SHALL leave the
field unchanged.

#### Scenario: Dictate an instruction without a run

- **WHEN** the user dictates into the Queue a task form while no agent run is live
- **THEN** the cleaned transcript appears in the instruction field while they speak

#### Scenario: Confirm fills the field, does not queue

- **WHEN** the user confirms a dictated instruction
- **THEN** the field is filled and nothing is added to the queue until the user presses
  Add to queue

#### Scenario: Edit then send fills the edited text

- **WHEN** the user edits the instruction field and presses Add to queue
- **THEN** the edited text is queued to the agent

#### Scenario: Cancel leaves the field unchanged

- **WHEN** the user cancels the dictation modal
- **THEN** the instruction field keeps whatever it held before recording

#### Scenario: Voice unavailable

- **WHEN** the browser lacks microphone support or permission is denied
- **THEN** the microphone control is disabled with an explanation and the task form can
  still be filled and submitted by typing
