import {
  AGENT_PROFILE_MAX_DESCRIPTION,
  AGENT_PROFILE_MAX_INSTRUCTIONS,
  ERROR_CODES,
  type AgentProfile,
} from '@ai-office/contracts';
import { OfficeFailure } from './ports.js';

/** Two `##` sections make up a profile; anything else is ignored. */
const DESCRIPTION = 'Description';
const INSTRUCTIONS = 'Instructions';
type Section = typeof DESCRIPTION | typeof INSTRUCTIONS;

export const EMPTY_AGENT_PROFILE: AgentProfile = { description: '', instructions: '' };

/** A fresh empty profile, so callers never share a mutable literal. */
export function emptyAgentProfile(): AgentProfile {
  return { description: '', instructions: '' };
}

/**
 * Parses the profile markdown. Pure and total: a missing section, an empty
 * document, or prose with no recognised headings all read as empty strings
 * rather than throwing. Unknown content is ignored.
 */
export function parseAgentProfile(markdown: string): AgentProfile {
  const sections: Record<Section, string[]> = { [DESCRIPTION]: [], [INSTRUCTIONS]: [] };
  let current: Section | null = null;

  for (const line of markdown.split(/\r?\n/)) {
    const heading = headingOf(line);
    if (heading !== null) {
      current = heading;
      continue;
    }
    // Any other `##` heading ends the current section: unknown content is ignored
    // rather than folded into the section above it.
    if (/^\s*##\s+/.test(line)) {
      current = null;
      continue;
    }
    if (current !== null) sections[current].push(line);
  }

  return {
    description: sections[DESCRIPTION].join('\n').trim(),
    instructions: sections[INSTRUCTIONS].join('\n').trim(),
  };
}

function headingOf(line: string): Section | null {
  const match = /^\s*##\s+(description|instructions)\s*$/i.exec(line);
  if (match === null) return null;
  return (match[1] as string).toLowerCase() === 'description' ? DESCRIPTION : INSTRUCTIONS;
}

/**
 * Canonical serialization. `parseAgentProfile(formatAgentProfile(p))` equals `p`
 * and formatting the same profile twice is byte-identical, so a hand edit and a
 * UI save converge on one representation.
 */
export function formatAgentProfile(profile: AgentProfile): string {
  return `## ${DESCRIPTION}\n\n${profile.description}\n\n## ${INSTRUCTIONS}\n\n${profile.instructions}\n`;
}

/**
 * Domain-side guard, independent of the API schema. Rejects an over-long field
 * with the uniform error shape before anything is written.
 */
export function assertValidAgentProfile(profile: AgentProfile): void {
  const fields: { path: string; message: string }[] = [];
  if (profile.description.length > AGENT_PROFILE_MAX_DESCRIPTION) {
    fields.push({
      path: 'description',
      message: `Must be at most ${AGENT_PROFILE_MAX_DESCRIPTION} characters`,
    });
  }
  if (profile.instructions.length > AGENT_PROFILE_MAX_INSTRUCTIONS) {
    fields.push({
      path: 'instructions',
      message: `Must be at most ${AGENT_PROFILE_MAX_INSTRUCTIONS} characters`,
    });
  }
  if (fields.length > 0) {
    throw new OfficeFailure(ERROR_CODES.validation, 'Agent profile is invalid', { fields });
  }
}
