# Proposal

## Why

Prompting an agent means typing, and typing a good instruction is slow. Speaking it is
faster, but raw speech is full of disfluencies — "mhh", "hmmm", "aa", "um" — that
pollute a prompt and waste tokens. Operators also want to prompt hands-free while
watching the office.

This change adds a microphone to the prompt input: speech is transcribed **on the
user's machine**, disfluencies are removed, and the cleaned text is either inserted
into the prompt for review or sent to the selected agent directly.

## What Changes

- Introduce a **local speech-to-text capability**: a small port with one browser
  implementation backed by Whisper running via Transformers.js in a Web Worker. Audio
  never leaves the machine and no API key is required.
- Add a **disfluency cleanup** step after transcription: hesitation and filler tokens
  are removed, spacing and punctuation are tidied, and the result is a clean prompt.
  The token list is configurable and the whole step is a pure function.
- Add a **microphone affordance** to the prompt input that turns speech into a small
  **confirmation modal**: the cleaned transcript is shown in an editable field, and
  nothing reaches the agent until the user either says **"confirm"** or edits the
  text and sends it by hand.
- **Degrade gracefully**: no microphone permission, an unsupported browser, or a model
  that fails to load disables voice with an explanation, and text prompting keeps
  working.

## Capabilities

### New Capabilities

- `voice-input`: local speech-to-text behind a port, the browser Whisper adapter,
  model caching and lazy loading, and the pure disfluency-cleanup step.

### Modified Capabilities

- `office-2d-ui`: the prompt input gains a microphone control, the review/send modes,
  and the unavailable/degraded states.

No changes to `core`, `contracts`, `agent-orchestration`, `agent-terminals`,
`harness-adapters`, or `office-runtime-api`: transcription is a client concern and
does not touch the runtime.

## Assumptions

- Target browsers are desktop Chromium-based (Chrome/Edge) and Firefox/Safari with
  WASM; WebGPU is used when available and WASM otherwise.
- Speech is primarily English; the filler list ships with English disfluencies plus
  the tokens named in the request ("mhh", "hmmm", "aa") and is user-extendable. Other
  languages are not a goal for the first cut.
- The first use downloads a Whisper model (tens to a couple hundred MB depending on
  the size chosen) and caches it locally; later uses work offline.

## Impact

- **New web dependency:** Transformers.js (`@huggingface/transformers`) in
  `apps/web` only. No runtime, core, or contracts dependency, and no vendor name
  leaks into those packages. The exact model checkpoint is chosen in the model task.
- **New browser APIs used:** microphone capture and a Web Worker; model bytes are
  cached in browser storage.
- **No credentials, no server, no new data sent off-device.** Audio is processed in
  the browser and is not persisted.
- **Prompt cost:** unchanged except that a disfluency-free prompt is usually shorter
  than the raw transcript.

Explicitly out of scope: wake-word/"always listening", voice for anything other than
the prompt box (no voice control of runs), speaker diarization, real-time streaming
transcription during speech, and any cloud speech service.
