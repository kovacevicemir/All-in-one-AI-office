# Proposal

## Why

Dictation was record-then-transcribe: it only produced text **after** the user stopped
recording, and it required a large on-device model download that also failed on the
English-only checkpoint. Operators expect the words to appear in the field **while they
speak**, and the browser already ships a streaming speech engine that needs no model,
no download, and no key.

## What Changes

- Add a **streaming** speech port (`LiveTranscriber`) with a browser implementation on
  the platform Web Speech API. It emits the growing transcript as the user talks.
- The microphone now **writes into the field live** and never sends anything itself:
  the field's own **Send** / **Add to queue** button is the commit. This applies to the
  agent prompt box and the Queue a task instruction alike.
- Keep the record-then-review flow as a fallback for browsers without a streaming
  engine, so voice still works there.
- Fix the on-device Whisper adapter, which threw because it passed `language`/`task` to
  an English-only checkpoint.

## Capabilities

### Modified Capabilities

- `voice-input`: adds live streaming transcription; the existing on-device engine
  remains as the fallback.
- `office-2d-ui`: the microphone dictates into the field as the user speaks and no
  longer gates text behind a confirmation modal; the field's own button commits.

## Assumptions

- Chromium's Web Speech engine may send audio to the browser vendor's service. That is
  a deliberate trade for instant, model-free dictation; the on-device path stays as the
  fallback where the streaming engine is missing.
- Speech is English for the first cut, matching the previous assumption.

## Impact

- `apps/web` only; no new dependency. No runtime, contract, or core changes.
