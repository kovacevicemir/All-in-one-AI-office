import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONFIRM_PHRASES,
  DEFAULT_FILLER_WORDS,
  cleanTranscript,
  isConfirmation,
} from '../src/voice/clean.js';

describe('cleanTranscript', () => {
  it('removes each default filler word from the middle of a sentence', () => {
    for (const filler of DEFAULT_FILLER_WORDS) {
      const cleaned = cleanTranscript(`please ${filler} continue`);
      expect(cleaned, `filler "${filler}"`).toBe('Please continue.');
    }
  });

  it('removes repeated and elongated fillers', () => {
    expect(cleanTranscript('um um um hello')).toBe('Hello.');
    expect(cleanTranscript('ummmm hello hmmmm there')).toBe('Hello there.');
    expect(cleanTranscript('aa aa hmm')).toBe('');
  });

  it('leaves real words that merely contain a filler intact', () => {
    expect(cleanTranscript('the umbrella and the aardvark')).toBe(
      'The umbrella and the aardvark.',
    );
  });

  it('tidies spacing and orphaned punctuation and reads as a sentence', () => {
    expect(cleanTranscript('  hello   , um , world  ')).toBe('Hello, world.');
    expect(cleanTranscript('um hello there um')).toBe('Hello there.');
  });

  it('returns an empty string when every word was a filler', () => {
    expect(cleanTranscript('uh um er')).toBe('');
  });

  it('removes a custom filler when one is configured', () => {
    expect(cleanTranscript('please like continue', { fillers: ['like'] })).toBe(
      'Please continue.',
    );
    expect(cleanTranscript('please like continue')).toBe('Please like continue.');
  });
});

describe('isConfirmation', () => {
  it('matches the command exactly', () => {
    expect(isConfirmation('confirm')).toBe(true);
  });

  it('matches when the command leads the utterance as its own clause', () => {
    expect(isConfirmation('Confirm.')).toBe(true);
    expect(isConfirmation('confirm!')).toBe(true);
    expect(isConfirmation('Confirm, please.')).toBe(true);
  });

  it('does not match a sentence that merely contains the word', () => {
    expect(isConfirmation('please confirm the build')).toBe(false);
    expect(isConfirmation('confirm that the build passes')).toBe(false);
    expect(isConfirmation('can you confirm it')).toBe(false);
  });

  it('does not match an empty transcript', () => {
    expect(isConfirmation('')).toBe(false);
    expect(isConfirmation('   ')).toBe(false);
  });

  it('honors a configured command word', () => {
    expect(isConfirmation('Ship it!', ['ship it'])).toBe(true);
    expect(isConfirmation('ship it now', ['ship it'])).toBe(false);
    expect(isConfirmation('confirm', ['ship it'])).toBe(false);
    expect(DEFAULT_CONFIRM_PHRASES).toEqual(['confirm']);
  });
});
