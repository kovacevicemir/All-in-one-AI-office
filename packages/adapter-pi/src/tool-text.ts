/**
 * Terminal rendering helpers for PI tool calls. Kept out of the adapter proper so
 * both stay small: these are pure string functions, testable without a process.
 */

const TOOL_TEXT_LIMIT = 4_000;

/** Keeps a tool payload readable in the terminal without drowning the buffer. */
export function clampToolText(text: string): string {
  if (text.length <= TOOL_TEXT_LIMIT) return text.endsWith('\n') ? text : `${text}\n`;
  const dropped = text.length - TOOL_TEXT_LIMIT;
  return `${text.slice(0, TOOL_TEXT_LIMIT)}\n… [${dropped} more characters truncated]\n`;
}

export function stringOrEmpty(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** Renders PI's `edit` tool payload as a readable before/after block. */
export function formatEdits(edits: unknown): string {
  if (!Array.isArray(edits)) return '';
  return edits
    .map((entry) => {
      const record = (entry ?? {}) as { oldText?: unknown; newText?: unknown };
      return `- ${stringOrEmpty(record.oldText)}\n+ ${stringOrEmpty(record.newText)}`;
    })
    .join('\n');
}

/** Flattens a PI tool result into plain text, ignoring non-text blocks. */
export function collectToolResult(result: unknown): string {
  if (typeof result === 'string') return result;
  if (typeof result !== 'object' || result === null) return '';
  const content = (result as { content?: unknown }).content;
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((block) => {
      if (typeof block !== 'object' || block === null) return '';
      const record = block as { type?: string; text?: string };
      return typeof record.text === 'string' ? record.text : '';
    })
    .join('');
}
