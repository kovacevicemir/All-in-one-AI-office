import type { ContextPressureLevel, PressureThresholds } from '@ai-office/contracts';

/** Ordering used to decide whether a change is an escalation or an easing. */
const RANK: Record<ContextPressureLevel, number> = {
  unknown: -1,
  nominal: 0,
  warning: 1,
  critical: 2,
};

export interface PressureInput {
  percent: number | null;
  previous: ContextPressureLevel;
  thresholds: PressureThresholds;
}

function rawLevel(percent: number, thresholds: PressureThresholds): ContextPressureLevel {
  if (percent >= thresholds.critical) return 'critical';
  if (percent >= thresholds.warning) return 'warning';
  return 'nominal';
}

/**
 * Pure, advisory context-pressure derivation.
 *
 * - `null` percent (no telemetry, or no fresh usage after compaction) is `unknown`.
 * - Escalation is immediate: crossing a threshold raises the level at once.
 * - Easing requires dropping a hysteresis margin below the previous level's
 *   threshold, so a percent hovering on a boundary does not flap the UI.
 * - Pressure never influences task outcomes; it is display-and-warn only.
 */
export function computePressure({
  percent,
  previous,
  thresholds,
}: PressureInput): ContextPressureLevel {
  if (percent === null || Number.isNaN(percent)) return 'unknown';

  const raw = rawLevel(percent, thresholds);
  if (previous === 'unknown' || RANK[raw] >= RANK[previous]) return raw;

  const margin = thresholds.hysteresis;
  if (previous === 'critical') {
    return percent <= thresholds.critical - margin ? raw : 'critical';
  }
  if (previous === 'warning') {
    return percent <= thresholds.warning - margin ? raw : 'warning';
  }
  return raw;
}
