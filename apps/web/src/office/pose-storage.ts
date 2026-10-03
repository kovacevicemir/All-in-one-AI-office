import { isAgentPose, type PoseMap } from './placement.js';

export interface PoseStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const POSE_STORAGE_KEY = 'ai-office.poses.v1';

/**
 * Parses a stored pose map defensively: anything that is not a finite pose is
 * ignored, and malformed JSON reads as "no stored poses". A corrupt value must
 * never stop the office from rendering.
 */
export function parsePoses(raw: string | null): PoseMap {
  if (raw === null) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return {};
    const poses: PoseMap = {};
    for (const [agentId, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (isAgentPose(value)) poses[agentId] = value;
    }
    return poses;
  } catch {
    return {};
  }
}

export function loadPoses(storage: PoseStorage, key = POSE_STORAGE_KEY): PoseMap {
  try {
    return parsePoses(storage.getItem(key));
  } catch {
    return {};
  }
}

/** Persistence is best effort: a full or blocked store must not break a drag. */
export function savePoses(storage: PoseStorage, poses: PoseMap, key = POSE_STORAGE_KEY): void {
  try {
    storage.setItem(key, JSON.stringify(poses));
  } catch {
    return;
  }
}
