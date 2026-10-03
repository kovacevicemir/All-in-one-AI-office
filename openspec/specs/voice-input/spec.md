# voice-input Specification

## Purpose
Adds on-device speech-to-text for prompting: a small engine port, a browser Whisper
implementation, a pure disfluency-cleanup step, and recognition of a spoken
confirmation word. Audio is processed locally and never uploaded.

## Requirements

### Requirement: Local speech-to-text engine

The system SHALL provide speech-to-text behind a small port with one browser
implementation that runs an on-device Whisper model. The engine SHALL initialize
lazily on first use, SHALL cache its model so later use works offline, and SHALL
report whether it is available. Recorded audio SHALL be processed locally and SHALL
NOT be uploaded, persisted, or sent to any network service.

#### Scenario: Transcribe a recording

- **WHEN** a recording is handed to the engine
- **THEN** it returns the recognized transcript text

#### Scenario: Audio stays on device

- **WHEN** a recording is transcribed
- **THEN** no network request carries the audio, and the audio is discarded after
  transcription

#### Scenario: Lazy load and cache

- **WHEN** the office has loaded but the microphone has never been used
- **THEN** no speech model is downloaded; the model is fetched on first use and
  reused afterwards without re-downloading

#### Scenario: Engine unavailable

- **WHEN** the browser cannot run the engine or the model fails to load
- **THEN** the engine reports unavailable with a distinguishable reason and text
  prompting continues to work

### Requirement: Disfluency cleanup

After recognition, the transcript SHALL be cleaned before it is shown or sent.
Cleanup SHALL remove filler and hesitation tokens when they stand alone as words,
collapse the whitespace and stray punctuation left behind, and leave the remaining
wording and order unchanged. Matching SHALL be word-bounded so real words are never
damaged. The filler list SHALL be configurable.

#### Scenario: Fillers removed

- **WHEN** a transcript contains hesitation tokens such as "mhh", "hmmm", "aa", "um",
  or "uh"
- **THEN** those tokens are removed from the cleaned transcript

#### Scenario: Real words are preserved

- **WHEN** a transcript contains a word that merely contains a filler substring, such
  as "umbrella" or "aardvark"
- **THEN** the word is left intact

#### Scenario: Tidy result

- **WHEN** removing fillers leaves repeated spaces or orphaned punctuation
- **THEN** the cleaned transcript has single spaces, is trimmed, and reads as a
  sentence

#### Scenario: Configurable fillers

- **WHEN** a user adds a term to the filler list
- **THEN** that term is removed as a filler in subsequent transcriptions

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
