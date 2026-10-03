# Tasks

## 1. Reusable dictation control

- [x] 1.1 Extract `VoiceDictation` (microphone button, unavailable/error messages, confirm modal) from `PromptInput`, wrapping `useVoicePrompt` and taking a `label` and `onText(text)` — verify: existing prompt tests still pass, and the modal heading/field label reflect the given label
- [x] 1.2 Parameterize the modal heading and field label and keep the current wording as the default — verify: the existing modal tests keep passing unchanged

## 2. Voice in the task form

- [x] 2.1 Add `VoiceDictation` to the instruction field of the Queue a task form — verify: a component test records → confirms through the fake engine and asserts the instruction field holds the cleaned text, and that nothing is sent to the runtime
- [x] 2.2 Confirm that dictation works with no live session and that the task form still submits by typing — verify: component tests cover the pre-run form and a typed submit

## 3. Verification and archive

- [x] 3.1 Extend the browser suite (fake engine) to dictate a task instruction and confirm it fills the field — verify: `npm run e2e` passes with no microphone, model, or network
- [x] 3.2 Run `openspec validate add-voice-task-dictation --strict` and archive the change — verify: validation passes and `openspec list --specs` still shows `voice-input` and `office-2d-ui`
