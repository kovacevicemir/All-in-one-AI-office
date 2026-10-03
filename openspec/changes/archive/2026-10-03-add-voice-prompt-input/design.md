# Design

## Context

See `proposal.md` for motivation. The load-bearing constraints:

1. **Local-first.** Audio must not leave the machine and no credential may be
   introduced. This rules out cloud speech services for the default path.
2. **Testable without a browser, network, or credentials.** The engine cannot run in
   CI, so the transcription port is injected and faked; the disfluency cleanup is a
   pure function and carries the tests that matter.
3. **No vendor leak into core/contracts/runtime.** Speech is entirely a web concern,
   so it lives in `apps/web` and changes no shared package.
4. **Don't add a dependency for what the platform provides — unless the platform's
   option is wrong.** The platform Web Speech API exists, but it is cloud-backed and
   non-portable, so it is rejected below rather than used.

## Goals / Non-Goals

**Goals:**

- Fast, hands-free prompting that produces clean prompts with no filler words.
- Confirmation before send, by voice (`confirm`) or by hand, so speech never sends
  accidentally.
- Fully local transcription with no credentials and no audio upload.
- A seam that lets every acceptance criterion except raw model accuracy be verified
  headlessly with a fake engine.
- Small surface: one new web dependency, one new capability.

**Non-Goals:**

- Other languages, diarization, or streaming partial transcripts.
- Wake word, continuous listening, or voice control of anything but the prompt.
- Bundling model weights in the repo.

## Decisions

### D1. Engine: Whisper via Transformers.js, running in the browser

Whisper is the most popular free, open speech-to-text model, and Transformers.js is
the standard way to run it locally in the browser (WASM, WebGPU when available). It
needs no account, key, or server, which matches local-first.

*Alternatives considered:*

- **Web Speech API** (`SpeechRecognition`): the platform provides it, so it needs no
  dependency — but it is cloud-backed (audio is sent to the browser vendor), it is
  inconsistent across browsers, and it gives no control over disfluency removal. It is
  rejected as the default, and may be revisited only as an explicit opt-out mode.
- **Vosk (vosk-browser):** fully offline and lighter, but lower accuracy and a smaller
  ecosystem than Whisper.
- **Cloud providers (Deepgram, AssemblyAI, OpenAI audio):** rejected — paid, require
  credentials, and send audio off-device.

*Trade-off:* Whisper models are tens to a couple hundred MB and must download once.
This is accepted; the model is cached and lazy-loaded on first microphone use.

### D2. Run the model in a Web Worker, lazily, and cache it

- Transcription runs off the main thread so recording and the UI stay responsive.
- The engine initializes on first microphone use, not at app load.
- WebGPU is used when present, with a WASM fallback.
- Model bytes are cached in browser storage; after the first use, transcription works
  offline.
- Recorded audio is held in memory for the duration of a transcription and is never
  written to disk or sent anywhere.

### D3. Disfluency cleanup is a pure, conservative function

`cleanTranscript(text, options)` in `apps/web/src/voice/clean.ts`:

- Removes filler/hesitation tokens only when they appear as standalone words, matched
  case-insensitively and tolerant of elongation and repeats: `um`, `uh`, `erm`, `er`,
  `hmm`, `hmmm`, `mhm`, `mm`, `mhh`, `ah`, `äh`, `ähm`, `aa`, and similar.
- Collapses repeated whitespace and stray punctuation left by removal, trims, and
  ensures a sentence starts capitalized and ends with terminal punctuation.
- Never deletes a token that is part of a real word (`um` in "umbrella", `aa` in
  "aardvark") because matching is word-bounded.
- The filler list is configurable, so a user can add terms; the default list ships in
  code and is unit-tested.

*Alternatives considered:* doing cleanup inside the model prompt (rejected: not
deterministic and not testable); aggressive regex deletion (rejected: risks corrupting
real words and meaning).

### D4. Port, fake, and the tests that carry the change

`SpeechToText` is a small interface in `apps/web/src/voice/`:

```ts
interface SpeechToText {
  readonly available: boolean;
  transcribe(audio: Blob): Promise<string>;
}
```

- A React context provides the active engine and recording control to the prompt UI.
- **Tests inject a fake** engine returning a fixed transcript, so the UI, the cleanup,
  and the confirmation-modal flow are verified headlessly.
- The real Whisper adapter is exercised by an **opt-in smoke test** (a real recording
  fixture through the engine), skipped by default like the existing real-PI smoke
  test. Raw accuracy is not asserted in CI.

### D5. A confirmation modal gates every send

Speech never goes straight to an agent. When recording ends, the cleaned transcript
opens in a small modal so a mis-transcription can never become a mis-send:

- The modal shows the cleaned transcript in an **editable text field**.
- **Voice confirm:** while the modal is open it listens for a short confirmation
  command, defaulting to `confirm` (configurable: `send`, `yes`, …). Saying it sends
  the text **currently in the field**, so manual edits are respected.
- **Manual:** the user edits the text and presses **Send**.
- **Cancel:** a Cancel button (and an optional spoken `cancel`) discards the draft; it
  always has a button, never voice-only.

To keep the microphone from transcribing keyboard noise, the listener arms on open,
stops as soon as the user starts editing or clicks into the field, and can be re-armed
with a "listen again" control. The mode is a small, testable state machine
(`idle → listening → transcribing → confirming → sending | editing | cancelled`).

*Alternatives considered:* insert straight into the prompt field with no modal
(rejected: the user asked for a confirm step, and it risks sending noise); auto-send on
end-of-speech (rejected for the same reason); a voice-only confirm with no button
(rejected: audio can fail, so the send path must always have a pointer fallback).

### D6. Degradation is explicit

Voice is disabled with a reason when: the browser has no microphone support, the user
denies microphone permission, the model cannot load, or there is no live session to
prompt. In every case text prompting continues to work.

### Architecture invariants

The change adds a dependency only to `apps/web` and touches no dependency edge. The
speech port is a web-local interface, not a shared package, so `contracts`, `core`,
adapters, and `apps/runtime` are unchanged and stay vendor-neutral. `apps/web` still
reaches the runtime only through the existing client.

## Risks / Trade-offs

- **First-run download size and latency.** Mitigation: lazy load, cache, show a
  "preparing voice…" state, and keep a smaller model as the default with a larger one
  opt-in.
- **Browser support.** WebGPU is not universal; the WASM fallback covers the rest, and
  unsupported browsers degrade to text.
- **Cleanup false positives/negatives.** Mitigation: word-bounded matching,
  conservative defaults, a configurable list, and unit tests over tricky cases
  (`umbrella`, `aardvark`, repeated fillers, fillers mid-sentence).
- **Privacy perception.** Mitigation: the UI states that transcription is on-device
  and nothing is uploaded, and the implementation never opens a network request for
  audio.

## Migration Plan

- Purely additive: a new capability and one new web dependency.
- No runtime, contract, or data changes; existing installs behave identically until the
  microphone is used.

## Open Questions

- Which Whisper size is the default (accuracy vs download) — decided in the model task
  with a documented measurement.
- Whether the "send" mode should be a per-agent setting or a global preference —
  deferred; first cut keeps it a session-level toggle.
