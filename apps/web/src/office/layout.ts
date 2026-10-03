import type { AgentView, Department } from '@ai-office/contracts';

export interface PlacedAgent {
  agent: AgentView;
  position: [number, number, number];
}

export interface Zone {
  key: string;
  departmentId: string | undefined;
  name: string;
  x: number;
}

export const ZONE_WIDTH = 6;
export const PER_ROW = 3;

/**
 * Pure placement: one zone per department, one position per agent. Kept free of
 * Three.js so it can be tested without WebGL.
 */
export function layoutAgents(
  agents: AgentView[],
  departments: Department[],
): { placed: PlacedAgent[]; zones: Zone[] } {
  const known = new Set(departments.map((department) => department.id));
  const buckets = new Map<string, AgentView[]>();
  const keys: string[] = [];

  for (const department of departments) {
    keys.push(department.id);
    buckets.set(department.id, []);
  }

  for (const agent of agents) {
    const key =
      agent.departmentId !== undefined && known.has(agent.departmentId)
        ? agent.departmentId
        : '__unassigned__';
    if (!buckets.has(key)) {
      buckets.set(key, []);
      keys.push(key);
    }
    buckets.get(key)?.push(agent);
  }

  const zones: Zone[] = [];
  const placed: PlacedAgent[] = [];

  keys.forEach((key) => {
    const group = buckets.get(key) ?? [];
    if (group.length === 0) return;
    const x = zones.length * ZONE_WIDTH;
    const department = departments.find((candidate) => candidate.id === key);
    zones.push({ key, departmentId: department?.id, name: department?.name ?? 'Unassigned', x });
    group.forEach((agent, index) => {
      const column = index % PER_ROW;
      const row = Math.floor(index / PER_ROW);
      placed.push({ agent, position: [x + (column - 1) * 1.7, 0, row * 1.9 - 1.6] });
    });
  });

  return { placed, zones };
}
