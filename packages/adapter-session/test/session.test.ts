import { describe, expect, it } from 'vitest';
import { OfficeFailure } from '@ai-office/core';
import { PipeSpawnPort, PtySpawnPort, shellWrap } from '@ai-office/adapter-session';
import type { SpawnedProcess } from '@ai-office/core';

const JAVASCRIPT = 'process.stdout.write("hello\\n"); process.stderr.write("warn\\n");';

function spec(command: string, args: string[]) {
  return {
    sessionId: 'session_1',
    command,
    args,
    cwd: process.cwd(),
    env: {},
    cols: 80,
    rows: 24,
  };
}

interface Collected {
  output: string;
  exitCode: number | null | undefined;
  errors: string[];
}

function collect(child: SpawnedProcess): Promise<Collected> {
  const result: Collected = { output: '', exitCode: undefined, errors: [] };
  return new Promise((resolve) => {
    child.onEvent((event) => {
      if (event.type === 'output') result.output += event.data;
      else if (event.type === 'error') result.errors.push(event.message);
      else {
        result.exitCode = event.exitCode;
        resolve(result);
      }
    });
  });
}

describe('shell wrapping', () => {
  it('never routes an absolute executable path through a shell', () => {
    const absolute = process.platform === 'win32' ? 'C:\\Program Files\\node.exe' : '/usr/bin/node';
    const wrapped = shellWrap(absolute, ['-e', 'a b']);
    expect(wrapped.command).toBe(absolute);
    expect(wrapped.args).toEqual(['-e', 'a b']);
  });

  it('passes arguments through untouched when no shell is involved', () => {
    const wrapped = shellWrap('/usr/bin/node', ['-e', 'process.stdout.write("hi")']);
    expect(wrapped.command).toBe('/usr/bin/node');
    expect(wrapped.args[1]).toBe('process.stdout.write("hi")');
  });

  it('routes a bare name through cmd.exe on Windows, and only there', () => {
    const wrapped = shellWrap('pi', ['--version']);
    if (process.platform === 'win32') {
      expect(wrapped.command.toLowerCase()).toContain('cmd.exe');
      expect(wrapped.args.slice(0, 3)).toEqual(['/d', '/s', '/c']);
      expect(wrapped.args[3]).toContain('pi');
      expect(wrapped.args[3]).toContain('--version');
    } else {
      expect(wrapped.command).toBe('pi');
      expect(wrapped.args).toEqual(['--version']);
    }
  });
});

describe('PipeSpawnPort', () => {
  it('declares a pipe backing that cannot be resized', () => {
    const port = new PipeSpawnPort();
    expect(port.backing).toBe('pipe');
    expect(port.supportsResize).toBe(false);
  });

  it('runs a process, streams stdout and stderr, and reports the exit code', async () => {
    const port = new PipeSpawnPort();
    const child = await port.spawn(spec(process.execPath, ['-e', JAVASCRIPT]));
    const result = await collect(child);

    expect(result.output).toContain('hello');
    expect(result.output).toContain('warn');
    expect(result.exitCode).toBe(0);
  });

  it('reports a non-zero exit code without throwing', async () => {
    const port = new PipeSpawnPort();
    const child = await port.spawn(spec(process.execPath, ['-e', 'process.exit(3)']));
    const result = await collect(child);
    expect(result.exitCode).toBe(3);
  });

  it('reports an unavailable command as a failure rather than hanging', async () => {
    const port = new PipeSpawnPort();
    const child = await port.spawn(spec('definitely-not-a-real-binary-xyz', []));
    const result = await collect(child);

    // On Windows a bare name goes through cmd.exe, which reports the failure
    // itself; elsewhere spawn emits an error event. Either way it must not hang
    // and must not look successful.
    expect(result.exitCode === null || result.exitCode !== 0).toBe(true);
    expect(result.exitCode).not.toBe(0);
  });

  it('writes input through to the process', async () => {
    const port = new PipeSpawnPort();
    const child = await port.spawn(
      spec(process.execPath, [
        '-e',
        'process.stdin.setEncoding("utf8");process.stdin.on("data",(d)=>process.stdout.write("echo:"+d));',
      ]),
    );

    const received = await new Promise<string>((resolve) => {
      let buffer = '';
      child.onEvent((event) => {
        if (event.type === 'output') {
          buffer += event.data;
          if (buffer.includes('echo:ping')) resolve(buffer);
        }
      });
      child.write('ping\n');
    });

    expect(received).toContain('echo:ping');
    child.kill();
  });

  it('refuses to resize, because a pipe is not a terminal', async () => {
    const port = new PipeSpawnPort();
    const child = await port.spawn(spec(process.execPath, ['-e', 'setTimeout(()=>{}, 300)']));
    expect(() => child.resize(100, 40)).toThrow(OfficeFailure);
    child.kill();
  });

  it('is killed on request', async () => {
    const port = new PipeSpawnPort();
    const child = await port.spawn(spec(process.execPath, ['-e', 'setInterval(()=>{}, 50)']));
    const finished = collect(child);
    child.kill();
    await finished;
  });
});

describe('PtySpawnPort', () => {
  it('declares a pty backing that supports resize', () => {
    const port = new PtySpawnPort();
    expect(port.backing).toBe('pty');
    expect(port.supportsResize).toBe(true);
  });

  it('either runs in a real terminal or reports the backing as unsupported', async () => {
    const port = new PtySpawnPort();
    let child: SpawnedProcess;
    try {
      child = await port.spawn(spec(process.execPath, ['-e', JAVASCRIPT]));
    } catch (error) {
      // node-pty is an optional native dependency; its absence must be explicit.
      expect(error).toBeInstanceOf(OfficeFailure);
      expect((error as OfficeFailure).code).toBe('unsupported_capability');
      return;
    }

    const result = await collect(child);
    expect(result.output).toContain('hello');
    expect(result.exitCode).toBe(0);
  });
});
