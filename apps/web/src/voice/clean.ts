/**
 * Pure text helpers behind voice prompting: disfluency cleanup and spoken
 * confirmation. Kept free of I/O so the behaviour that matters is unit-testable
 * without a microphone or a model.
 */

/** Default hesitation tokens removed from a transcript. */
export const DEFAULT_FILLER_WORDS: readonly string[] = [
  'um',
  'uh',
  'er',
  'erm',
  'hmm',
  'hmmm',
  'mhm',
  'mm',
  'mhh',
  'ah',
  'äh',
  'ähm',
  'aa',
];

/** Default words that send a confirmation draft. */
export const DEFAULT_CONFIRM_PHRASES: readonly string[] = ['confirm'];

export interface CleanTranscriptOptions {
  /** Replaces the default filler list when provided. */
  readonly fillers?: readonly string[];
}

/**
 * Removes standalone filler/hesitation tokens, tidies the leftover spacing and
 * punctuation, and returns a single capitalized sentence. Real words that merely
 * contain a filler (`umbrella`, `aardvark`) are left untouched because matching
 * is word-bounded.
 */
export function cleanTranscript(text: string, options: CleanTranscriptOptions = {}): string {
  const pattern = fillerPattern(options.fillers ?? DEFAULT_FILLER_WORDS);
  const withoutFillers = pattern === null ? text : text.replace(pattern, ' ');
  return tidySentence(withoutFillers);
}

/**
 * True when a (cleaned) utterance is the confirmation command itself, or begins
 * with it followed by a pause — `confirm`, `Confirm!`, `confirm, please`. A
 * sentence that continues past the command (`confirm that the build passes`) is
 * not a match, so dictating a prompt that happens to start with the word is never
 * treated as a send.
 */
export function isConfirmation(
  text: string,
  phrases: readonly string[] = DEFAULT_CONFIRM_PHRASES,
): boolean {
  const utterance = text.trim().toLowerCase();
  if (utterance.length === 0) return false;
  return phrases.some((phrase) => matchesCommand(utterance, phrase.trim().toLowerCase()));
}

function matchesCommand(utterance: string, command: string): boolean {
  if (command.length === 0) return false;
  if (utterance === command) return true;
  if (!utterance.startsWith(command)) return false;
  const remainder = utterance.slice(command.length);
  // The command must be its own clause: followed by punctuation, not a word.
  return remainder.trim() === '' || /^\s*[,.;:!?]/.test(remainder);
}

/**
 * A word-bounded, case-insensitive pattern for the fillers, tolerating an
 * elongated final letter (`um+`, `hmmm+`) so `ummm` and `hmmmm` are caught too.
 * Lookarounds keep Unicode letters/digits from being treated as boundaries, so
 * `äh` matches as a word while `umbrella` does not.
 */
function fillerPattern(fillers: readonly string[]): RegExp | null {
  const alternatives = [
    ...new Set(fillers.map(elongatedFiller).filter((pattern) => pattern.length > 0)),
  ];
  if (alternatives.length === 0) return null;
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${alternatives.join('|')})(?![\\p{L}\\p{N}])`, 'giu');
}

function elongatedFiller(filler: string): string {
  const trimmed = filler.trim();
  if (trimmed.length === 0) return '';
  return `${trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}+`;
}

/** Collapses spacing and orphaned punctuation, then reads as one sentence. */
function tidySentence(text: string): string {
  const collapsed = text
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/([,;:])(?:\s*[,;:])+/g, '$1')
    .replace(/^[\s,;:.!?-]+/, '')
    .replace(/[\s,;:-]+$/, '')
    .trim();
  if (collapsed.length === 0) return '';
  const capitalized = collapsed.charAt(0).toUpperCase() + collapsed.slice(1);
  return /[.!?]$/.test(capitalized) ? capitalized : `${capitalized}.`;
}
