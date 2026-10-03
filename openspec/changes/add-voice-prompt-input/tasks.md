# Tasks

## 1. Voice port and pure helpers

- [ ] 1.1 Define the `SpeechToText` port (`available`, `transcribe(audio): Promise<string>`) and a React context that provides the active engine and recording control to the prompt UI; add a fake engine for tests — verify: a component test injects the fake and receives its fixed transcript
- [ ] 1.2 Implement `cleanTranscript(text, options)` as a pure function with a configurable filler list (defaults include `um`, `uh`, `er`, `erm`, `hmm`, `hmmm`, `mhm`, `mm`, `mhh`, `ah`, `äh`, `ähm`, `aa`); word-bounded matching, whitespace and stray-punctuation tidy, capitalization and terminal punctuation — verify: unit tests cover each default filler, repeated/elongated fillers, `umbrella`/`aardvark` safety, mid-sentence fillers, and a custom filler
- [ ] 1.3 Implement `isConfirmation(text, phrases)` as a pure function that matches only when the cleaned utterance is the command or begins with it, defaulting to `confirm` — verify: unit tests cover exact match, leading match, a sentence that merely contains the word, an empty transcript, and a configured command word

## 2. Voice-prompt state machine

- [ ] 2.1 Implement the pure `idle → listening → transcribing → confirming → editing → sending | cancelled` state machine with transitions for stop, transcript-ready, edit-start (which stops the confirmation listener), re-arm, confirm, send, and cancel — verify: unit tests cover every transition, that editing stops listening, and that no path reaches `sending` without a prior `confirming` state
- [ ] 2.2 Implement the runtime binding of the state machine to the engine and the prompt action behind a small hook — verify: a test drives record → transcribe → confirm through the fake engine and asserts exactly one prompt is sent with the cleaned text

## 3. Browser Whisper engine

- [ ] 3.1 Add Transformers.js (`@huggingface/transformers`) to `apps/web` only and implement the on-device Whisper engine in a Web Worker: lazy initialization on first use, WebGPU with WASM fallback, and model caching so later use is offline — verify: `npm run typecheck` passes; loading the app performs no speech-model download; a second transcription does not re-download the model
- [ ] 3.2 Implement microphone capture with `MediaRecorder` producing an in-memory `Blob` handed to the engine, with clean start/stop and permission handling — verify: unit tests with a fake recorder cover start/stop and the permission-denied outcome; no code path writes audio to storage or a network request
- [ ] 3.3 Add an opt-in real-transcription smoke test using a checked-in short audio fixture, skipped unless an env flag is set — verify: skipped by default; passes locally with the flag, asserting the cleaned transcript is non-empty

## 4. Prompt UI: microphone and confirmation modal

- [ ] 4.1 Add the microphone control to the prompt input with recording and transcribing states and a stop action — verify: component tests using the fake engine assert the control enters recording, then transcribing, then opens the modal
- [ ] 4.2 Implement the confirmation modal: cleaned transcript in an editable field, Send and Cancel buttons, and a spoken-confirm listener that stops when editing begins and can be re-armed — verify: component tests assert a spoken `confirm` sends the field text, edit-then-confirm sends the edited text, editing stops the listener, Cancel sends nothing, and the modal always offers a pointer Cancel
- [ ] 4.3 Disable voice with a specific reason and keep text prompting working when the browser lacks support, permission is denied, the model fails to load, or there is no live session — verify: component tests cover each reason and assert the text prompt still submits
- [ ] 4.4 Surface transcription failure without opening a modal of fabricated text — verify: a component test with a failing fake engine asserts an error is shown, no modal opens, and the prompt input still works

## 5. Documentation, integration, and archive

- [ ] 5.1 Document voice prompting in the README: on-device privacy, the first-run model download and caching, the confirmation flow, and how to change the filler list and confirm word — verify: a reviewer can follow the README to use voice prompting, and the docs state that audio never leaves the device
- [ ] 5.2 Extend the browser end-to-end suite (with the fake engine) to cover record → modal → confirm → prompt sent, and edit → send — verify: `npm run e2e` passes with no microphone, model, or network
- [ ] 5.3 Run `openspec validate add-voice-prompt-input --strict` and archive the change so `voice-input` becomes a baseline capability — verify: validation passes with no warnings and `openspec list --specs` shows `voice-input`
