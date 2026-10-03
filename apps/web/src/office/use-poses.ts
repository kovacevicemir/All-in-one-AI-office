import { useEffect, useMemo, useState } from 'react';
import type { AgentView, Department } from '@ai-office/contracts';
import {
  defaultPoses,
  movePoseTo,
  reconcilePoses,
  roomBounds,
  type PoseMap,
  type RoomBounds,
} from './placement.js';
import { loadPoses, savePoses, type PoseStorage } from './pose-storage.js';

export interface AgentPoses {
  poses: PoseMap;
  bounds: RoomBounds;
  /** Moves one agent to an absolute floor point, clamped and facing the move. */
  moveTo(agentId: string, x: number, y: number): void;
}

function browserStorage(): PoseStorage | null {
  if (typeof window === 'undefined' || window.localStorage === undefined) return null;
  return window.localStorage;
}

/**
 * Owns floor positions for the office view. Defaults come from the pure layout,
 * a stored position wins over a default, and every change is written back through
 * the storage port so a reload restores the office.
 */
export function useAgentPoses(
  agents: AgentView[],
  departments: Department[],
  storage: PoseStorage | null = browserStorage(),
): AgentPoses {
  const defaults = useMemo(() => defaultPoses(agents, departments), [agents, departments]);
  const bounds = useMemo(() => roomBounds(agents, departments), [agents, departments]);
  const [poses, setPoses] = useState<PoseMap>(() =>
    reconcilePoses(storage === null ? {} : loadPoses(storage), defaults),
  );

  // New agents get a default position; removed agents drop their stored one.
  useEffect(() => {
    setPoses((current) => reconcilePoses(current, defaults));
  }, [defaults]);

  useEffect(() => {
    if (storage === null) return;
    savePoses(storage, poses);
  }, [poses, storage]);

  return {
    poses,
    bounds,
    moveTo(agentId, x, y) {
      setPoses((current) => {
        const pose = current[agentId];
        if (pose === undefined) return current;
        return { ...current, [agentId]: movePoseTo(pose, x, y, bounds) };
      });
    },
  };
}
