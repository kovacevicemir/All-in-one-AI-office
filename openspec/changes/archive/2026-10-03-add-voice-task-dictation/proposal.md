# Proposal

## Why

Voice prompting currently exists only beside a **live, running** agent's prompt box.
The most common thing an operator does is *compose work* — write the task instruction
they want an agent to run — and typing that is exactly as slow as typing a prompt.
Dictation should be available wherever text is entered, not gated behind a live run.

## What Changes

- Add the microphone to the **Queue a task** form so the task instruction can be
  dictated, transcribed on-device, cleaned, reviewed, and then filled into the field.
- Reuse the exact same flow as the prompt box: record → cleaned transcript in an
  editable confirmation modal → send/confirm by voice or by hand, with Cancel always
  available.
- Make the microphone its own reusable control so both the prompt box and the task
  form share one implementation. The confirmation step commits text to whatever field
  opened it — it does not imply "send to an agent".

## Capabilities

### Modified Capabilities

- `voice-input`: the confirmation step commits the field text to the control that
  opened it, which may be a live prompt **or** a form field.
- `office-2d-ui`: the Queue a task form gains a microphone control that dictates into
  the instruction field.

No changes to `core`, `contracts`, adapters, or `apps/runtime`: transcription stays a
client concern and still never touches the runtime or the network.

## Impact

- `apps/web` only. No new dependency; the existing engine and cleanup are reused.
- No credentials, no server, no new data off-device.
