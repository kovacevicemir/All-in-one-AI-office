import { describe, expect, it } from 'vitest';
import { isDraftOpen, transition, type VoiceEvent, type VoicePhase } from '../src/voice/machine.js';

describe('voice prompt machine', () => {
  it('walks the happy path from idle to sending', () => {
    let phase: VoicePhase = 'idle';
    phase = transition(phase, 'start');
    expect(phase).toBe('listening');
    phase = transition(phase, 'stop');
    expect(phase).toBe('transcribing');
    phase = transition(phase, 'transcript-ready');
    expect(phase).toBe('confirming');
    phase = transition(phase, 'confirm');
    expect(phase).toBe('sending');
    phase = transition(phase, 'reset');
    expect(phase).toBe('idle');
  });

  it('stops listening and becomes editable on edit-start', () => {
    expect(transition('confirming', 'edit-start')).toBe('editing');
    expect(transition('editing', 'send')).toBe('sending');
  });

  it('re-arms the confirmation listener from editing and from confirming', () => {
    expect(transition('editing', 're-arm')).toBe('confirming');
    expect(transition('confirming', 're-arm')).toBe('confirming');
  });

  it('cancels from every open phase and can start again', () => {
    for (const phase of ['listening', 'transcribing', 'confirming', 'editing'] satisfies VoicePhase[]) {
      expect(transition(phase, 'cancel')).toBe('cancelled');
    }
    expect(transition('cancelled', 'start')).toBe('listening');
    expect(transition('cancelled', 'reset')).toBe('idle');
  });

  it('treats an event that does not apply as a no-op', () => {
    const events: VoiceEvent[] = ['stop', 'transcript-ready', 'confirm', 'send', 'edit-start'];
    for (const event of events) {
      expect(transition('idle', event)).toBe('idle');
    }
  });

  it('reaches sending only through a confirming state', () => {
    const phases: VoicePhase[] = ['idle', 'listening', 'transcribing', 'confirming', 'editing', 'sending', 'cancelled'];
    for (const phase of phases) {
      for (const event of ['confirm', 'send'] satisfies VoiceEvent[]) {
        const next = transition(phase, event);
        if (next === 'sending' && phase !== 'sending') {
          expect(['confirming', 'editing']).toContain(phase);
        }
      }
    }
    // `sending` cannot be re-entered once it has started.
    expect(transition('sending', 'confirm')).toBe('sending');
    expect(transition('sending', 'send')).toBe('sending');
    // `editing` itself is only reachable from `confirming`.
    expect(transition('idle', 'edit-start')).toBe('idle');
    expect(transition('listening', 'edit-start')).toBe('listening');
    expect(transition('transcribing', 'edit-start')).toBe('transcribing');
  });

  it('reports whether the confirmation draft is open', () => {
    expect(isDraftOpen('confirming')).toBe(true);
    expect(isDraftOpen('editing')).toBe(true);
    expect(isDraftOpen('idle')).toBe(false);
    expect(isDraftOpen('cancelled')).toBe(false);
  });
});
