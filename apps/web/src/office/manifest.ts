import type { BotMood } from './visuals.js';

export interface AvatarEntry {
  /** Model asset URL. Absent means "use the built-in procedural bot". */
  model?: string;
  /** mood -> animation clip name. */
  clips?: Record<string, string>;
  scale?: number;
}

export interface AvatarManifest {
  default?: AvatarEntry;
  bots: Record<string, AvatarEntry>;
}

export interface ResolvedAvatar {
  /** Undefined when the built-in procedural bot should be used. */
  model: string | undefined;
  clips: Record<string, string>;
  scale: number;
  /** True when the manifest did not supply a usable model asset. */
  usingFallbackModel: boolean;
  /** Required clips the manifest did not declare. */
  missingClips: string[];
}

export const REQUIRED_CLIPS = ['idle', 'working', 'blocked'] as const;

/**
 * Mood -> the clip to fall back to when the manifest lacks a direct entry. Keeps
 * a scene useful with a partial or minimal asset.
 */
export const FALLBACK_CLIP: Record<BotMood, BotMood> = {
  idle: 'idle',
  working: 'working',
  thinking: 'working',
  blocked: 'blocked',
  waiting: 'idle',
  done: 'idle',
  error: 'blocked',
  complaining: 'working',
  stressed: 'blocked',
};

export const EMPTY_MANIFEST: AvatarManifest = { bots: {} };

/**
 * Parses a manifest defensively: malformed data degrades to "use the built-in
 * bot" rather than throwing and blanking the scene.
 */
export function parseManifest(raw: unknown): AvatarManifest {
  if (typeof raw !== 'object' || raw === null) return EMPTY_MANIFEST;
  const record = raw as { default?: unknown; bots?: unknown };
  const bots: Record<string, AvatarEntry> = {};
  if (typeof record.bots === 'object' && record.bots !== null) {
    for (const [key, value] of Object.entries(record.bots as Record<string, unknown>)) {
      const entry = toEntry(value);
      if (entry !== null) bots[key] = entry;
    }
  }
  const fallback = toEntry(record.default);
  return { bots, ...(fallback !== null ? { default: fallback } : {}) };
}

function toEntry(value: unknown): AvatarEntry | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as { model?: unknown; clips?: unknown; scale?: unknown };
  const entry: AvatarEntry = {};
  if (typeof record.model === 'string' && record.model.trim().length > 0) entry.model = record.model;
  if (typeof record.scale === 'number' && Number.isFinite(record.scale) && record.scale > 0) {
    entry.scale = record.scale;
  }
  if (typeof record.clips === 'object' && record.clips !== null) {
    const clips: Record<string, string> = {};
    for (const [mood, clip] of Object.entries(record.clips as Record<string, unknown>)) {
      if (typeof clip === 'string' && clip.trim().length > 0) clips[mood] = clip;
    }
    if (Object.keys(clips).length > 0) entry.clips = clips;
  }
  return entry;
}

export function resolveAvatar(manifest: AvatarManifest, botId: string): ResolvedAvatar {
  const entry = manifest.bots[botId] ?? manifest.default ?? {};
  const clips = { ...(entry.clips ?? {}) };
  return {
    model: entry.model,
    clips,
    scale: entry.scale ?? 1,
    usingFallbackModel: entry.model === undefined,
    missingClips: REQUIRED_CLIPS.filter((clip) => clips[clip] === undefined),
  };
}

/**
 * The clip to play for a mood, falling back through `FALLBACK_CLIP` and finally
 * to `idle`. Returns null only when no clip at all is available.
 */
export function clipNameFor(avatar: ResolvedAvatar, mood: BotMood): string | null {
  const direct = avatar.clips[mood];
  if (direct !== undefined) return direct;
  const fallback = avatar.clips[FALLBACK_CLIP[mood]];
  if (fallback !== undefined) return fallback;
  return avatar.clips.idle ?? null;
}
