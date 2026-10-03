import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { emptyOfficeState, type OfficeState } from '@ai-office/core';
import { DATA_VERSION, FileStore } from '@ai-office/adapter-store-file';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'ai-office-store-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function stateWithAgent(): OfficeState {
  const state = emptyOfficeState();
  state.agents.push({
    id: 'agent_1',
    name: 'Ada',
    workingDir: '/tmp/work',
    harnessId: 'pi',
    model: { providerId: 'deepseek', modelId: 'deepseek-flash' },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  });
  return state;
}

describe('FileStore', () => {
  it('returns null when nothing has been persisted yet', async () => {
    const store = new FileStore({ dir });
    await expect(store.load()).resolves.toBeNull();
  });

  it('does not write synchronously on save, then writes after the debounce', async () => {
    const store = new FileStore({ dir, debounceMs: 5 });
    store.save(stateWithAgent());
    // Nothing on disk yet: save is write-behind.
    await expect(readFile(join(dir, 'office.json'), 'utf8')).rejects.toThrow();

    await store.flush();
    const persisted = JSON.parse(await readFile(join(dir, 'office.json'), 'utf8')) as {
      version: number;
    };
    expect(persisted.version).toBe(DATA_VERSION);
  });

  it('round-trips state across instances', async () => {
    const first = new FileStore({ dir, debounceMs: 0 });
    first.save(stateWithAgent());
    await first.flush();

    const second = new FileStore({ dir });
    const loaded = await second.load();
    expect(loaded?.agents).toHaveLength(1);
    expect(loaded?.agents[0]?.name).toBe('Ada');
  });

  it('snapshots at save time so later mutations do not leak into the snapshot', async () => {
    const store = new FileStore({ dir, debounceMs: 0 });
    const state = stateWithAgent();
    store.save(state);
    state.agents[0]!.name = 'Mutated later';
    await store.flush();

    const loaded = await new FileStore({ dir }).load();
    expect(loaded?.agents[0]?.name).toBe('Ada');
  });

  it('keeps the previous snapshot as .bak and recovers from it', async () => {
    const store = new FileStore({ dir, debounceMs: 0 });
    store.save(stateWithAgent());
    await store.flush();

    const second = stateWithAgent();
    second.agents[0]!.name = 'Grace';
    store.save(second);
    await store.flush();

    const backup = JSON.parse(await readFile(join(dir, 'office.json.bak'), 'utf8')) as {
      state: OfficeState;
    };
    expect(backup.state.agents[0]?.name).toBe('Ada');

    // Corrupt the primary: the store falls back to the backup.
    await writeFile(join(dir, 'office.json'), '{ not json', 'utf8');
    const recovered = await new FileStore({ dir }).load();
    expect(recovered?.agents[0]?.name).toBe('Ada');
  });

  it('ignores a snapshot written by an incompatible data version', async () => {
    await writeFile(
      join(dir, 'office.json'),
      JSON.stringify({ version: DATA_VERSION + 1, savedAt: '', state: stateWithAgent() }),
      'utf8',
    );
    await writeFile(
      join(dir, 'office.json.bak'),
      JSON.stringify({ version: DATA_VERSION + 1, savedAt: '', state: stateWithAgent() }),
      'utf8',
    );
    await expect(new FileStore({ dir }).load()).resolves.toBeNull();
  });

  it('never leaves a temp file behind after flushing', async () => {
    const store = new FileStore({ dir, debounceMs: 0 });
    store.save(stateWithAgent());
    await store.flush();
    await expect(readFile(join(dir, 'office.json.tmp'), 'utf8')).rejects.toThrow();
  });
});

describe('FileStore: agent profiles', () => {
  it('writes one markdown file per agent and reads it back', async () => {
    const store = new FileStore({ dir });
    await store.writeAgentProfile('agent_1', {
      description: 'Tech lead',
      instructions: 'own the build',
    });

    await expect(store.readAgentProfile('agent_1')).resolves.toEqual({
      description: 'Tech lead',
      instructions: 'own the build',
    });
    const text = await readFile(join(dir, 'agents', 'agent_1.md'), 'utf8');
    expect(text).toContain('## Description');
    expect(text).toContain('own the build');
  });

  it('reads the same profile from a recreated store', async () => {
    const first = new FileStore({ dir });
    await first.writeAgentProfile('agent_1', { description: 'd', instructions: 'i' });

    await expect(new FileStore({ dir }).readAgentProfile('agent_1')).resolves.toEqual({
      description: 'd',
      instructions: 'i',
    });
  });

  it('reads an absent file as an empty profile', async () => {
    await expect(new FileStore({ dir }).readAgentProfile('nobody')).resolves.toEqual({
      description: '',
      instructions: '',
    });
  });

  it('leaves no partial temp file after a write', async () => {
    const store = new FileStore({ dir });
    await store.writeAgentProfile('agent_1', { description: 'd', instructions: 'i' });
    await expect(readFile(join(dir, 'agents', 'agent_1.md.tmp'), 'utf8')).rejects.toThrow();
  });

  it('recovers an empty or unrecognised file as an empty profile without throwing', async () => {
    const store = new FileStore({ dir });
    await writeAt(join(dir, 'agents', 'empty.md'), '');
    await writeAt(join(dir, 'agents', 'prose.md'), 'just some prose\nwith no headings\n');

    await expect(store.readAgentProfile('empty')).resolves.toEqual({ description: '', instructions: '' });
    await expect(store.readAgentProfile('prose')).resolves.toEqual({ description: '', instructions: '' });
  });
});

async function writeAt(path: string, contents: string): Promise<void> {
  await mkdir(join(path, '..'), { recursive: true });
  await writeFile(path, contents, 'utf8');
}
