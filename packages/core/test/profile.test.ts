import { describe, expect, it } from 'vitest';
import {
  AGENT_PROFILE_MAX_DESCRIPTION,
  AGENT_PROFILE_MAX_INSTRUCTIONS,
} from '@ai-office/contracts';
import {
  EMPTY_AGENT_PROFILE,
  OfficeFailure,
  assertValidAgentProfile,
  emptyAgentProfile,
  formatAgentProfile,
  parseAgentProfile,
} from '@ai-office/core';

const FULL = `## Description

Tech lead for the payments squad.

## Instructions

You are the tech lead. You own the build.
Raise blockers to the orchestrator.
`;

describe('parseAgentProfile', () => {
  it('reads both sections from a full document', () => {
    expect(parseAgentProfile(FULL)).toEqual({
      description: 'Tech lead for the payments squad.',
      instructions: 'You are the tech lead. You own the build.\nRaise blockers to the orchestrator.',
    });
  });

  it('treats a missing section as empty', () => {
    expect(parseAgentProfile('## Description\n\nJust a description.\n')).toEqual({
      description: 'Just a description.',
      instructions: '',
    });
    expect(parseAgentProfile('## Instructions\n\nJust instructions.\n')).toEqual({
      description: '',
      instructions: 'Just instructions.',
    });
  });

  it('treats a document with no sections as empty', () => {
    expect(parseAgentProfile('')).toEqual(EMPTY_AGENT_PROFILE);
    expect(parseAgentProfile('# Title\n\nsome prose with no recognised headings\n')).toEqual(
      EMPTY_AGENT_PROFILE,
    );
  });

  it('treats empty sections as empty strings', () => {
    expect(parseAgentProfile('## Description\n\n## Instructions\n\n')).toEqual(EMPTY_AGENT_PROFILE);
  });

  it('ignores unknown content outside the two sections', () => {
    const parsed = parseAgentProfile(
      'preamble\n## Description\n\nkeep me\n## Notes\n\ndrop me\n## Instructions\n\nkeep this too\n',
    );
    expect(parsed).toEqual({ description: 'keep me', instructions: 'keep this too' });
  });
});

describe('formatAgentProfile', () => {
  it('is canonical and byte-stable across a round trip', () => {
    const parsed = parseAgentProfile(FULL);
    const once = formatAgentProfile(parsed);
    const twice = formatAgentProfile(parseAgentProfile(once));
    expect(twice).toBe(once);
    expect(parseAgentProfile(once)).toEqual(parsed);
  });

  it('formats an empty profile without losing either section', () => {
    const text = formatAgentProfile(emptyAgentProfile());
    expect(parseAgentProfile(text)).toEqual(EMPTY_AGENT_PROFILE);
    expect(text).toContain('## Description');
    expect(text).toContain('## Instructions');
  });
});

describe('assertValidAgentProfile', () => {
  it('accepts values at the limits', () => {
    expect(() =>
      assertValidAgentProfile({
        description: 'd'.repeat(AGENT_PROFILE_MAX_DESCRIPTION),
        instructions: 'i'.repeat(AGENT_PROFILE_MAX_INSTRUCTIONS),
      }),
    ).not.toThrow();
  });

  it('rejects an over-long field with a field-naming error', () => {
    try {
      assertValidAgentProfile({
        description: 'd'.repeat(AGENT_PROFILE_MAX_DESCRIPTION + 1),
        instructions: '',
      });
      throw new Error('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(OfficeFailure);
      const fields = (error as OfficeFailure).details?.fields as { path: string }[];
      expect(fields.some((field) => field.path === 'description')).toBe(true);
    }
  });
});
