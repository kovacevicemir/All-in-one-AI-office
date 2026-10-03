import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { AgentProfile } from '@ai-office/contracts';
import {
  emptyAgentProfile,
  emptyOfficeState,
  formatAgentProfile,
  parseAgentProfile,
  type OfficeState,
  type StorePort,
} from '@ai-office/core';

export const DATA_VERSION = 1;

export interface FileStoreOptions {
  /** Directory that holds the snapshots. Created on demand. */
  dir: string;
  /** Coalescing window for write-behind persistence. */
  debounceMs?: number;
  fileName?: string;
}

interface Persisted {
  version: number;
  savedAt: string;
  state: OfficeState;
}

/**
 * In-memory-first store with asynchronous write-behind snapshots.
 *
 * Reads never touch disk, mutations are visible immediately, and disk writes are
 * debounced and atomic (temp file + rename) so a crash can never leave a partial
 * snapshot. The previous snapshot is kept as `.bak` for one-step recovery.
 */
export class FileStore implements StorePort {
  private readonly dir: string;
  private readonly file: string;
  private readonly backup: string;
  private readonly temp: string;
  private readonly debounceMs: number;
  private pending: Persisted | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private writeChain: Promise<void> = Promise.resolve();

  constructor(options: FileStoreOptions) {
    this.dir = options.dir;
    this.file = join(options.dir, options.fileName ?? 'office.json');
    this.backup = `${this.file}.bak`;
    this.temp = `${this.file}.tmp`;
    this.debounceMs = options.debounceMs ?? 50;
  }

  async load(): Promise<OfficeState | null> {
    const primary = await readPersisted(this.file);
    if (primary !== null) return primary;
    const backup = await readPersisted(this.backup);
    return backup;
  }

  save(state: OfficeState): void {
    this.pending = { version: DATA_VERSION, savedAt: new Date().toISOString(), state: structuredClone(state) };
    if (this.timer === null) {
      this.timer = setTimeout(() => {
        void this.flush();
      }, this.debounceMs);
      (this.timer as { unref?: () => void }).unref?.();
    }
  }

  async flush(): Promise<void> {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const payload = this.pending;
    if (payload === null) {
      await this.writeChain;
      return;
    }
    this.pending = null;
    this.writeChain = this.writeChain.then(() => this.write(payload));
    await this.writeChain;
  }

  private async write(payload: Persisted): Promise<void> {
    await mkdir(dirname(this.file), { recursive: true });
    await writeFile(this.temp, JSON.stringify(payload, null, 2), 'utf8');
    try {
      await rename(this.file, this.backup);
    } catch {
      /* first write: nothing to back up */
    }
    await rename(this.temp, this.file);
  }

  /* ------------------------------------------------------------ profiles */

  private profilePath(agentId: string): string {
    // Never let an id escape the agents directory via a path separator.
    const safeId = agentId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return join(this.dir, 'agents', `${safeId}.md`);
  }

  async readAgentProfile(agentId: string): Promise<AgentProfile> {
    try {
      return parseAgentProfile(await readFile(this.profilePath(agentId), 'utf8'));
    } catch {
      // Absent, unreadable, or malformed: an empty profile, never a throw.
      return emptyAgentProfile();
    }
  }

  async writeAgentProfile(agentId: string, profile: AgentProfile): Promise<void> {
    const file = this.profilePath(agentId);
    const temp = `${file}.tmp`;
    await mkdir(dirname(file), { recursive: true });
    await writeFile(temp, formatAgentProfile(profile), 'utf8');
    // Atomic replace: a reader either sees the old file or the new one.
    await rename(temp, file);
  }
}

async function readPersisted(path: string): Promise<OfficeState | null> {
  try {
    const text = await readFile(path, 'utf8');
    const parsed = JSON.parse(text) as Partial<Persisted>;
    if (parsed.version !== DATA_VERSION) return null;
    if (parsed.state === undefined || parsed.state === null) return null;
    return { ...emptyOfficeState(), ...parsed.state };
  } catch {
    return null;
  }
}
