import type { AgentRuntimeState, ContextPressureLevel } from '@ai-office/contracts';

export type BotMood =
  | 'idle'
  | 'working'
  | 'thinking'
  | 'blocked'
  | 'waiting'
  | 'error'
  | 'done'
  | 'complaining'
  | 'stressed';

export interface BotVisual {
  mood: BotMood;
  /** Animation clip to look up in the avatar manifest. */
  clip: string;
  tint: string;
  /** Built-in indicator used when the manifest has no clip for this mood. */
  indicator: string | null;
  posture: 'neutral' | 'busy' | 'stuck' | 'alert' | 'done';
  /** Short label shown next to the bot and in the rail. */
  label: string;
}

/** Data-driven map: runtime state -> base mood. */
export const STATE_MOOD: Record<AgentRuntimeState, BotMood> = {
  idle: 'idle',
  working: 'working',
  thinking: 'thinking',
  blocked: 'blocked',
  waiting: 'waiting',
  error: 'error',
  done: 'done',
};

/**
 * Data-driven map: context pressure -> overriding mood. `null` means "leave the
 * runtime state alone", so nominal and unknown pressure never invent a mood.
 */
export const PRESSURE_MOOD: Record<ContextPressureLevel, BotMood | null> = {
  nominal: null,
  warning: 'complaining',
  critical: 'stressed',
  unknown: null,
};

export const MOOD_VISUAL: Record<BotMood, Omit<BotVisual, 'mood' | 'clip'>> = {
  idle: { tint: '#7dd3fc', indicator: null, posture: 'neutral', label: 'Idle' },
  working: { tint: '#4ade80', indicator: null, posture: 'busy', label: 'Working' },
  thinking: { tint: '#a78bfa', indicator: null, posture: 'busy', label: 'Thinking' },
  blocked: { tint: '#f87171', indicator: '⛔', posture: 'stuck', label: 'Blocked' },
  waiting: { tint: '#fbbf24', indicator: '⏳', posture: 'stuck', label: 'Waiting' },
  error: { tint: '#ef4444', indicator: '✖', posture: 'alert', label: 'Error' },
  done: { tint: '#34d399', indicator: '✔', posture: 'done', label: 'Done' },
  complaining: { tint: '#fb923c', indicator: '😣', posture: 'alert', label: 'Complaining' },
  stressed: { tint: '#dc2626', indicator: '😰', posture: 'alert', label: 'Stressed' },
};

export interface VisualMapping {
  stateMood: Record<AgentRuntimeState, BotMood>;
  pressureMood: Record<ContextPressureLevel, BotMood | null>;
  moodVisual: Record<BotMood, Omit<BotVisual, 'mood' | 'clip'>>;
}

export const DEFAULT_VISUAL_MAPPING: VisualMapping = {
  stateMood: STATE_MOOD,
  pressureMood: PRESSURE_MOOD,
  moodVisual: MOOD_VISUAL,
};

/**
 * Resolves what a bot should look like. Context pressure takes precedence over
 * the runtime state, because "this agent is running out of context" is the more
 * urgent thing to see. Pressure is advisory: it changes appearance only.
 */
export function visualFor(
  state: AgentRuntimeState,
  pressure: ContextPressureLevel,
  mapping: VisualMapping = DEFAULT_VISUAL_MAPPING,
): BotVisual {
  const mood = mapping.pressureMood[pressure] ?? mapping.stateMood[state] ?? 'idle';
  const visual = mapping.moodVisual[mood];
  return { mood, clip: mood, ...visual };
}

export function visualForAgent(
  agent: { state: AgentRuntimeState; pressure: ContextPressureLevel },
  mapping?: VisualMapping,
): BotVisual {
  return visualFor(agent.state, agent.pressure, mapping);
}
