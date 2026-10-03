import { useEffect, useRef } from 'react';
import type { Agent, AgentCommunication, Task } from '@ai-office/contracts';
import { interleaveTranscript, type TranscriptTextChunk } from '../runtime/transcript.js';
import { CommunicationMarker } from './CommunicationMarker.js';

export interface TerminalViewProps {
  title: string;
  text: string;
  /** Retained output with sequence boundaries; enables inline markers. */
  chunks?: TranscriptTextChunk[];
  /** Communications anchored to this session, interleaved by sequence. */
  communications?: AgentCommunication[];
  agents?: Agent[];
  tasks?: Task[];
  onClose(): void;
}

/**
 * Full retained scrollback for one session, as monospace text. Structured
 * harness sessions carry no ANSI escapes, so no terminal emulator is needed.
 * When chunk boundaries are available, communication markers are interleaved at
 * their session sequence; otherwise the plain-text path is unchanged.
 */
export function TerminalView({
  title,
  text,
  chunks,
  communications,
  agents = [],
  tasks = [],
  onClose,
}: TerminalViewProps) {
  const ref = useRef<HTMLPreElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (node !== null) node.scrollTop = node.scrollHeight;
  }, [text, communications]);

  const interleaved =
    chunks !== undefined && chunks.length > 0
      ? interleaveTranscript(chunks, communications ?? [])
      : null;

  return (
    <section className="terminal" aria-label={`Terminal for ${title}`}>
      <header>
        <h2>{title} · terminal</h2>
        <button type="button" onClick={onClose}>
          Back to office
        </button>
      </header>
      <pre ref={ref} data-testid="terminal-scrollback">
        {text.length === 0 ? (
          'No output yet.\n'
        ) : interleaved === null ? (
          text
        ) : (
          interleaved.map((segment, index) =>
            segment.kind === 'text' ? (
              <span key={`text-${index}`} className="transcript-text">
                {segment.text}
              </span>
            ) : (
              <CommunicationMarker
                key={`marker-${segment.communication.id}`}
                communication={segment.communication}
                agents={agents}
                tasks={tasks}
              />
            ),
          )
        )}
      </pre>
    </section>
  );
}
