import type { AgentView, Department } from '@ai-office/contracts';
import { planOffice } from './floorplan.js';
import {
  LAYOUT_VERSION,
  normalizeRotation,
  type LayoutDocument,
  type LayoutItem,
} from './layout-document.js';

/**
 * Converts the procedural furnished plan into the editable layout document, so
 * a fresh office and the "reset to default" action come from the same pure plan
 * and cannot drift. Ids are assigned per kind and are deterministic.
 */
export function defaultLayout(agents: AgentView[], departments: Department[]): LayoutDocument {
  const counts = new Map<string, number>();
  const items: LayoutItem[] = planOffice(agents, departments).furniture.map((placement) => {
    const sequence = (counts.get(placement.kind) ?? 0) + 1;
    counts.set(placement.kind, sequence);
    return {
      id: `${placement.kind}_${sequence}`,
      kind: placement.kind,
      x: placement.position[0],
      y: placement.position[2],
      rotation: normalizeRotation(placement.rotationY / (Math.PI / 2)),
    };
  });
  return { version: LAYOUT_VERSION, items };
}
