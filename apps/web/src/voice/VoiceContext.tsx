import { createContext, useContext, type ReactNode } from 'react';
import { createUnavailableVoice, type VoiceController } from './port.js';

const VoiceContext = createContext<VoiceController | null>(null);

/** The value every prompt UI falls back to when voice is not provided. */
const FALLBACK_VOICE = createUnavailableVoice('unsupported');

export interface VoiceProviderProps {
  value: VoiceController;
  children: ReactNode;
}

/** Provides the active speech engine and recorder to the prompt UI. */
export function VoiceProvider({ value, children }: VoiceProviderProps) {
  return <VoiceContext.Provider value={value}>{children}</VoiceContext.Provider>;
}

/** The injected voice controller, or a disabled one when none is provided. */
export function useVoice(): VoiceController {
  return useContext(VoiceContext) ?? FALLBACK_VOICE;
}
