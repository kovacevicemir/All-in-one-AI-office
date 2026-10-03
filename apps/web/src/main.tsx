import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { RuntimeProvider } from './runtime/RuntimeProvider.js';
import { RuntimeClient } from './runtime/client.js';
import './styles.css';

const runtimeUrl =
  (import.meta.env?.VITE_RUNTIME_URL as string | undefined) ?? 'http://127.0.0.1:4317';

const container = document.getElementById('root');
if (container === null) throw new Error('#root is missing from index.html');

createRoot(container).render(
  <StrictMode>
    <RuntimeProvider client={new RuntimeClient({ baseUrl: runtimeUrl })}>
      <App />
    </RuntimeProvider>
  </StrictMode>,
);
