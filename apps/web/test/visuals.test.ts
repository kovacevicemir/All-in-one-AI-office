import { describe, expect, it } from 'vitest';
import type { AgentRuntimeState, ContextPressureLevel } from '@ai-office/contracts';
import {
  DEFAULT_VISUAL_MAPPING,
  MOOD_VISUAL,
  PRESSURE_MOOD,
  STATE_MOOD,
  visualFor,
  visualForAgent,
} from '../src/office/visuals.js';

const STATES: AgentRuntimeState[] = [
  'idle',
  'thinking',
  'working',
  'blocked',
  'waiting',
  'error',
  'done',
];

const PRESSURES: ContextPressureLevel[] = ['nominal', 'warning', 'critical', 'unknown'];

describe('state-driven visuals', () => {
  it('maps every runtime state to a defined mood', () => {
    for (const state of STATES) {
      expect(STATE_MOOD[state], `missing mood for ${state}`).toBeDefined();
    }
  });

  it('gives every mood a distinct-ish visual', () => {
    for (const [mood, visual] of Object.entries(MOOD_VISUAL)) {
      expect(visual.tint, `${mood} has no tint`).toMatch(/^#[0-9a-f]{6}$/i);
      expect(visual.label.length).toBeGreaterThan(0);
    }
  });

  it('uses the runtime state when pressure says nothing', () => {
    expect(visualFor('working', 'nominal').mood).toBe('working');
    expect(visualFor('blocked', 'unknown').mood).toBe('blocked');
  });

  it('falls back to idle for a state it does not recognise', () => {
    const visual = visualFor('teleporting' as AgentRuntimeState, 'nominal');
    expect(visual.mood).toBe('idle');
    expect(visual.tint).toBe(MOOD_VISUAL.idle.tint);
  });
});

describe('context pressure mood', () => {
  it('complains at warning and stresses at critical', () => {
    expect(visualFor('working', 'warning').mood).toBe('complaining');
    expect(visualFor('working', 'critical').mood).toBe('stressed');
  });

  it('keeps the runtime state for nominal and unknown pressure', () => {
    for (const pressure of ['nominal', 'unknown'] as ContextPressureLevel[]) {
      expect(PRESSURE_MOOD[pressure]).toBeNull();
      expect(visualFor('thinking', pressure).mood).toBe('thinking');
    }
  });

  it('shows a built-in indicator for pressure moods even without clips', () => {
    expect(visualFor('working', 'warning').indicator).not.toBeNull();
    expect(visualFor('working', 'critical').indicator).not.toBeNull();
  });

  it('pressure overrides the state so running out of context is visible', () => {
    const busy = visualFor('working', 'critical');
    expect(busy.mood).toBe('stressed');
    expect(busy.posture).toBe('alert');
  });
});

describe('mapping is data-driven', () => {
  it('honours an overridden mapping without touching the defaults', () => {
    const custom = {
      ...DEFAULT_VISUAL_MAPPING,
      pressureMood: { nominal: null, warning: 'blocked', critical: 'stressed', unknown: null } as const,
    };
    expect(visualFor('working', 'warning', custom).mood).toBe('blocked');
    expect(visualFor('working', 'warning').mood).toBe('complaining');
    expect(PRESSURE_MOOD.warning).toBe('complaining');
  });

  it('exposes a convenience wrapper for agent views', () => {
    const visual = visualForAgent({ state: 'done', pressure: 'nominal' });
    expect(visual.mood).toBe('done');
  });
});
