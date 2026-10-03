# Design

## Context

The voice flow already exists as `useVoicePrompt` plus `VoicePromptModal`: it records,
transcribes, cleans, opens a review modal, and calls an `onSubmit(text)` when the user
confirms. It was only wired into `PromptInput`, and `PromptInput` is only rendered for a
running agent, which is why voice looked live-session-only.

## Goals / Non-Goals

**Goals**

- Dictate a task instruction in the Queue a task form.
- One implementation of the microphone + confirm modal, used everywhere text is entered.

**Non-Goals**

- Changing the engine, cleanup, or confirmation matching.
- Dictating into arbitrary fields beyond the prompt box and the task instruction.

## Decisions

### D1. Extract a `VoiceDictation` control

Move the microphone button, the unavailable/error messages, and the modal out of
`PromptInput` into one `VoiceDictation` component that takes a `label` and an
`onText(text)` callback. It wraps the existing `useVoicePrompt` hook, whose `onSubmit`
is the callback. Records and cleanup are unchanged.

- The prompt box passes `label="voice prompt"` and `onText={onSubmit}` (send to agent).
- The task form passes `label="task instruction"` and `onText={setInstruction}` (fill
  the field). No agent, no live session required.

### D2. The confirmation commits to the field, it does not send

The hook already calls `onSubmit` with the confirmed text; only the caller decides what
that means. So dictating a task never talks to the runtime, and dictating a prompt does.
The modal wording is parameterized (`Confirm task instruction` vs `Confirm voice
prompt`) so the review step says what it will do.

## Risks / Trade-offs

- **Two microphones on screen** (task form + prompt box). Acceptable: they are in
  different sections and only one is used at a time; the shared control keeps behaviour
  identical.
