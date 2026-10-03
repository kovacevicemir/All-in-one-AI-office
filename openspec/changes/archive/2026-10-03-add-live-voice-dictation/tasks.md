# Tasks

## 1. Streaming speech port

- [x] 1.1 Add `LiveTranscriber` (`start(callbacks)` / `stop()`, `onPartial`/`onFinal` with the full transcript so far) and `VoiceController.live` — verify: typecheck passes and the fake drives the live path in tests
- [x] 1.2 Implement the browser adapter on the platform Web Speech API and fix the English-only Whisper call — verify: typecheck passes; the unit tests cover partial and final emission through the fake

## 2. Live dictation in the UI

- [x] 2.1 Write dictated text into the target field as it is recognized, cleaned of fillers, appending to existing text — verify: component tests assert the prompt and instruction fields update on partial and final results
- [x] 2.2 Make the field's own Send/Add button the only commit; the microphone never sends — verify: component tests assert nothing is submitted until Send, and a dictated prompt sends the cleaned text
- [x] 2.3 Fall back to the record-and-review flow where the streaming engine is missing — verify: the existing buffered tests still pass unchanged

## 3. Verification and archive

- [x] 3.1 Extend the browser suite to dictate live into the prompt and the task form — verify: `npm run e2e` passes with no microphone, model, or network
- [x] 3.2 Run `openspec validate add-live-voice-dictation --strict` and archive the change — verify: validation passes and `openspec list --specs` shows `voice-input`
