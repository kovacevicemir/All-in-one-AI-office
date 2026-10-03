import type { AgentView, Department } from '@ai-office/contracts';
import type { BotVisual } from './visuals.js';

/** Resolves a department name from the list the UI already holds. */
export function departmentNameFor(
  departmentId: string | undefined,
  departments: Department[],
): string | undefined {
  if (departmentId === undefined) return undefined;
  return departments.find((department) => department.id === departmentId)?.name;
}

export interface BotLabelData {
  name: string;
  /** Absent when the agent is unassigned, so the label shows the name alone. */
  department: string | undefined;
  state: string;
  activity: string;
}

/**
 * Pure composition of everything the 3D label shows. Kept out of the WebGL
 * component so identity can be verified without a rendering context.
 */
export function botLabelData(
  agent: AgentView,
  visual: BotVisual,
  departments: Department[],
): BotLabelData {
  return {
    name: agent.name,
    department: departmentNameFor(agent.departmentId, departments),
    state: visual.indicator ?? visual.label,
    activity: agent.activity,
  };
}
