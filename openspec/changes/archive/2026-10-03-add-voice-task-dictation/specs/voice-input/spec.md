# Spec Delta

## MODIFIED Requirements

### Requirement: Spoken confirmation

The system SHALL recognize a short spoken confirmation command so the user can commit a
dictated field by voice. The command SHALL default to "confirm" and SHALL be
configurable. A confirmation SHALL match only when the cleaned utterance is the command
itself or begins with it, so ordinary sentences containing the word are not treated as
confirmation. Confirmation SHALL commit the text currently shown in the confirmation
field to the control that opened it, so manual edits are honored and a task instruction
is filled exactly like an agent prompt.

#### Scenario: Confirm by voice

- **WHEN** the confirmation prompt is open and the user says "confirm"
- **THEN** the current field text is committed to the control that opened it — sent to
  the agent for a live prompt, or written into the form field for dictation

#### Scenario: Confirm sends the edited text

- **WHEN** the user has edited the field and then says "confirm"
- **THEN** the edited text is what is committed

#### Scenario: Ordinary speech is not a confirmation

- **WHEN** the user says a sentence that merely contains the word, such as "confirm
  that the build passes"
- **THEN** it is not treated as the confirmation command

#### Scenario: Configurable command word

- **WHEN** the confirmation command is configured to another word
- **THEN** that word, and not the default, triggers the commit
