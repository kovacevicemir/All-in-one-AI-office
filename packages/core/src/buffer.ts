export interface OutputChunk {
  seq: number;
  data: string;
}

export interface OutputBufferOptions {
  maxLines: number;
  maxBytes: number;
}

export const DEFAULT_OUTPUT_BUFFER: OutputBufferOptions = {
  maxLines: 5_000,
  maxBytes: 512 * 1024,
};

/**
 * Bounded, sequence-addressed scrollback. Late subscribers backfill with
 * `since(fromSeq)`; `oldestSeq()` tells them what is still retained.
 */
export class OutputBuffer {
  private chunks: OutputChunk[] = [];
  private nextSeq = 1;
  private lineCount = 0;
  private byteCount = 0;

  constructor(private readonly options: OutputBufferOptions = DEFAULT_OUTPUT_BUFFER) {}

  get lastSeq(): number {
    return this.nextSeq - 1;
  }

  oldestSeq(): number {
    return this.chunks[0]?.seq ?? this.nextSeq;
  }

  append(data: string): OutputChunk {
    const chunk: OutputChunk = { seq: this.nextSeq, data };
    this.nextSeq += 1;
    this.chunks.push(chunk);
    this.lineCount += countLines(data);
    this.byteCount += data.length;
    this.trim();
    return chunk;
  }

  since(fromSeq: number): OutputChunk[] {
    return this.chunks.filter((chunk) => chunk.seq > fromSeq);
  }

  tailLines(lines: number): string {
    if (lines <= 0) return '';
    const all = this.chunks.map((chunk) => chunk.data).join('');
    const parts = all.split('\n');
    const trailingNewline = parts.length > 1 && parts[parts.length - 1] === '';
    if (trailingNewline) parts.pop();
    const tail = parts.slice(Math.max(0, parts.length - lines)).join('\n');
    return trailingNewline ? `${tail}\n` : tail;
  }

  toJSON(): OutputChunk[] {
    return [...this.chunks];
  }

  private trim(): void {
    while (
      this.chunks.length > 1 &&
      (this.lineCount > this.options.maxLines || this.byteCount > this.options.maxBytes)
    ) {
      const dropped = this.chunks.shift();
      if (dropped === undefined) break;
      this.lineCount -= countLines(dropped.data);
      this.byteCount -= dropped.data.length;
    }
  }
}

function countLines(data: string): number {
  let count = 0;
  for (let i = 0; i < data.length; i += 1) {
    if (data.charCodeAt(i) === 10) count += 1;
  }
  return count;
}
