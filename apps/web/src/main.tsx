import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { RuntimeProvider } from './runtime/RuntimeProvider.js';
import { RuntimeClient } from './runtime/client.js';
import { VoiceProvider } from './voice/VoiceContext.js';
import { createBrowserVoice } from './voice/browser-engine.js';
import { createFakeVoice } from './voice/fakes.js';
import './styles.css';

const runtimeUrl =
  (import.meta.env?.VITE_RUNTIME_URL as string | undefined) ?? 'http://127.0.0.1:4317';

// The browser suite runs headless with no microphone or model, so it swaps in a
// deterministic fake through this flag. Production always uses the real engine.
const voice =
  (import.meta.env?.VITE_VOICE_FAKE as string | undefined) === '1'
    ? createFakeVoice()
    : createBrowserVoice();

const container = document.getElementById('root');
if (container === null) throw new Error('#root is missing from index.html');

createRoot(container).render(
  <StrictMode>
    <VoiceProvider value={voice}>
      <RuntimeProvider client={new RuntimeClient({ baseUrl: runtimeUrl })}>
        <App />
      </RuntimeProvider>
    </VoiceProvider>
  </StrictMode>,
);
