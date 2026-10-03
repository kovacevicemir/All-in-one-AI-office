/** Messages exchanged with the Whisper worker; audio stays on the device. */

export interface WhisperRequest {
  readonly id: number;
  /** Mono PCM at 16 kHz, transferred to the worker. */
  readonly audio: Float32Array;
}

export type WhisperResponse =
  | { readonly id: number; readonly ok: true; readonly text: string }
  | { readonly id: number; readonly ok: false; readonly message: string };
