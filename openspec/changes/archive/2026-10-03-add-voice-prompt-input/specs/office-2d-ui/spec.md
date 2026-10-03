# Spec Delta

## Purpose

Adds a microphone to the prompt input that turns speech into a reviewable draft in a
small confirmation modal, sends it on a spoken "confirm" or a manual send, and
degrades to text when voice is unavailable.

## ADDED Requirements

### Requirement: Voice prompt confirmation

The prompt input SHALL offer a microphone control that records speech and, when
recording ends, SHALL open a small confirmation modal containing the cleaned
transcript in an editable field. Nothing SHALL be sent to the agent until the user
confirms — by saying the confirmation command or by pressing Send — and the modal
SHALL always provide a Cancel action. Cancelling SHALL discard the draft and return to
the prompt input. Speech SHALL never be submitted automatically without this
confirmation step.

#### Scenario: Recording opens the confirmation modal

- **WHEN** the user records speech and recording stops
- **THEN** a modal opens showing the cleaned transcript in an editable field

#### Scenario: Confirm by voice sends the prompt

- **WHEN** the modal is open and the user says "confirm"
- **THEN** the prompt is sent to the selected agent and the modal closes

#### Scenario: Edit then send

- **WHEN** the user edits the field and presses Send
- **THEN** the edited text is sent to the selected agent and the modal closes

#### Scenario: Cancel discards the draft

- **WHEN** the user cancels the modal
- **THEN** nothing is sent and the draft is discarded

#### Scenario: Editing stops the confirmation listener

- **WHEN** the user starts editing the field
- **THEN** voice confirmation stops listening so keystrokes are not transcribed, and
  the user can re-arm listening explicitly

#### Scenario: Voice unavailable

- **WHEN** the browser lacks microphone support, permission is denied, the model fails
  to load, or there is no live session to prompt
- **THEN** the microphone control is disabled with an explanation and text prompting
  still works

### Requirement: Recording state is visible

While recording, the control SHALL show a clear recording state, and the user SHALL be
able to stop recording. A transcription in progress SHALL be shown as such rather than
appearing to hang.

#### Scenario: Stop recording

- **WHEN** the user stops recording
- **THEN** recording ends and transcription begins, shown as an in-progress state

#### Scenario: Transcription failure

- **WHEN** transcription fails
- **THEN** the failure is surfaced, no modal with fabricated text is shown, and the
  prompt input remains usable
