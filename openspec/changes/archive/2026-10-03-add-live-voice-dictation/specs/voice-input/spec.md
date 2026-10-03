# Spec Delta

## ADDED Requirements

### Requirement: Live streaming transcription

The system SHALL provide a streaming speech capability that emits recognized text
while the user is still speaking, so dictation can be shown in a field without waiting
for recording to stop. It SHALL report whether it is available, and where a streaming
engine is unavailable the record-then-transcribe engine SHALL be used instead. The
streaming engine MAY be the browser's own speech service rather than an on-device
model.

#### Scenario: Text before stopping

- **WHEN** the user is dictating and has not stopped
- **THEN** partial transcripts are delivered so the text can be shown as they speak

#### Scenario: Finalized text

- **WHEN** a chunk of speech is finalized
- **THEN** the full transcript so far is delivered as a final result

#### Scenario: Streaming engine unavailable

- **WHEN** the browser has no streaming speech engine
- **THEN** the capability reports unavailable and the record-then-transcribe engine is
  used instead
