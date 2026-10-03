import type { AgentCommunication } from '@ai-office/contracts';

/** One retained output chunk, addressed by its session sequence number. */
export interface TranscriptTextChunk {
  seq: number;
  text: string;
}

export type TranscriptSegment =
  | { kind: 'text'; text: string }
  | { kind: 'marker'; communication: AgentCommunication; seq: number };

/**
 * Interleaves communication markers into retained terminal output by session
 * sequence. A marker is placed before the first text chunk whose sequence is at
 * or after the marker's, so markers before, between, and after chunks all land
 * in order. Markers with no session anchor are excluded: there is no point in
 * the stream to put them at.
 */
export function interleaveTranscript(
  textChunks: TranscriptTextChunk[],
  communications: AgentCommunication[],
): TranscriptSegment[] {
  const anchored = communications
    .filter(
      (event): event is AgentCommunication & { seq: number } =>
        typeof event.seq === 'number' && event.sessionId !== undefined,
    )
    .sort(
      (a, b) =>
        a.seq - b.seq || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
    );

  const chunks = [...textChunks].sort((a, b) => a.seq - b.seq);
  const segments: TranscriptSegment[] = [];
  let cursor = 0;

  const flushUpTo = (seq: number): void => {
    while (cursor < anchored.length && (anchored[cursor] as AgentCommunication & { seq: number }).seq <= seq) {
      const event = anchored[cursor] as AgentCommunication & { seq: number };
      segments.push({ kind: 'marker', communication: event, seq: event.seq });
      cursor += 1;
    }
  };

  for (const chunk of chunks) {
    flushUpTo(chunk.seq);
    segments.push({ kind: 'text', text: chunk.text });
  }
  flushUpTo(Number.POSITIVE_INFINITY);

  return segments;
}

/** Flattens segments back to plain text, used for the tail-only view. */
export function segmentsToText(segments: TranscriptSegment[]): string {
  return segments
    .filter((segment): segment is Extract<TranscriptSegment, { kind: 'text' }> => segment.kind === 'text')
    .map((segment) => segment.text)
    .join('');
}
