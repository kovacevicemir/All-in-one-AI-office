# Design

## Context

`VoiceDictation` offered record → transcribe → confirm-modal. The transcription step
was the on-device Whisper model, which only returns text once recording stops, and it
threw for the English-only checkpoint because it was called with `language`/`task`.

## Decisions

### D1. A streaming port, not a bigger model

Add `LiveTranscriber` with `start(callbacks)` / `stop()`, where callbacks receive the
full transcript so far (`onPartial` while it is still refining, `onFinal` when a chunk
settles). The browser adapter wraps the platform `SpeechRecognition` /
`webkitSpeechRecognition`, which is streaming and needs no model. This is the only way
to show text while the user is still speaking.

### D2. The microphone dictates; the field's button commits

The mic writes the composed transcript (`existing field text + transcript`, cleaned of
fillers) straight into the field on every callback. It no longer sends anything. The
prompt box's **Send** and the task form's **Add to queue** are the commit, which is both
simpler and matches the existing buttons. `VoiceDictation` picks the live engine when
available and falls back to `BufferedDictation` (record → review modal) otherwise.

### D3. Fix the Whisper fallback

Call the ASR pipeline without `language`/`task`, which English-only checkpoints reject.

## Risks / Trade-offs

- **Privacy**: the browser engine may use the vendor's cloud service. Documented in the
  README; the on-device engine remains the fallback, so a fully-local path still exists.
- **Two code paths**: live and buffered. The buffered path is unchanged and still tested,
  and the live path is preferred, so the fallback only matters where the API is missing.
