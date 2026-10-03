import { spawn } from 'node:child_process';
import { ERROR_CODES, type SessionBacking } from '@ai-office/contracts';
import { OfficeFailure, type SpawnEvent, type SpawnPort, type SpawnSpec, type SpawnedProcess } from '@ai-office/core';

/**
 * On Windows, `npm i -g` installs a CLI as a `.cmd` shim, which `spawn` refuses to
 * execute without a shell. Bare command names therefore go through `cmd.exe`;
 * absolute paths and `.exe` files are spawned directly, so arguments are never
 * passed through a shell when we can avoid it.
 */
export interface LaunchPlan {
  command: string;
  args: string[];
}

/**
 * Resolves how to launch a command.
 *
 * On Windows, `npm i -g` installs a CLI as a `.cmd` shim, which `spawn` refuses to
 * run without a shell. Bare command names therefore go through `cmd.exe`; absolute
 * paths and `.exe` files are spawned directly, so arguments never touch a shell
 * when we can avoid it.
 *
 * `cmd.exe` cannot reassemble an argument that contains whitespace or a shell
 * metacharacter reliably, and the failure is silent corruption rather than an
 * error - it split a working-directory argument apart and PI tried to `mkdir` the
 * pieces. `assertShellSafe` turns that into a loud failure instead, and callers are
 * expected to keep path-like values out of argv (see `PiHarnessAdapter.argsFor`).
 */
export function shellWrap(command: string, args: string[]): LaunchPlan {
  const isBareName =
    process.platform === 'win32' &&
    !command.includes('/') &&
    !command.includes('\\') &&
    !/\.exe$/i.test(command);
  if (!isBareName) return { command, args };

  assertShellSafe(args);
  return {
    command: process.env.comspec ?? 'cmd.exe',
    args: ['/d', '/s', '/c', [command, ...args].join(' ')],
  };
}

/**
 * Rejects arguments a Windows shell would mangle. Failing loudly beats silently
 * handing the harness a different command than the one we meant to run.
 */
export function assertShellSafe(args: readonly string[]): void {
  if (process.platform !== 'win32') return;
  for (const arg of args) {
    if (/[\s"&|<>^%!]/.test(arg)) {
      throw new OfficeFailure(
        ERROR_CODES.unsupported,
        `Argument cannot be passed safely through the Windows shell: "${arg}". Avoid spaces here, or set PI_COMMAND to an absolute path so no shell is used.`,
      );
    }
  }
}

/**
 * Runs a harness process with piped stdio. This is the default backing for
 * structured harness protocols (PI RPC): stdout carries the protocol, stderr
 * carries diagnostics, and no terminal emulation is involved.
 */
export class PipeSpawnPort implements SpawnPort {
  readonly backing: SessionBacking = 'pipe';
  readonly supportsResize = false;

  async spawn(spec: SpawnSpec): Promise<SpawnedProcess> {
    const launch = shellWrap(spec.command, spec.args);
    const child = spawn(launch.command, launch.args, {
      cwd: spec.cwd,
      env: { ...process.env, ...spec.env },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    const listeners = new Set<(event: SpawnEvent) => void>();
    const emit = (event: SpawnEvent): void => {
      for (const listener of listeners) listener(event);
    };

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (data: string) => emit({ type: 'output', data }));
    child.stderr.on('data', (data: string) => emit({ type: 'output', data }));
    child.on('error', (error: Error) => {
      emit({ type: 'error', message: error.message });
      emit({ type: 'exit', exitCode: null });
    });
    child.on('close', (code: number | null) => emit({ type: 'exit', exitCode: code }));

    return {
      pid: child.pid,
      write: (data: string) => {
        if (child.stdin.writable) child.stdin.write(data);
      },
      resize: () => {
        throw new OfficeFailure(ERROR_CODES.unsupported, 'Pipe sessions cannot be resized');
      },
      kill: () => {
        child.kill();
      },
      onEvent: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };
  }
}

/**
 * Runs a harness process in a real pseudo-terminal, for harnesses that only
 * speak a terminal. `node-pty` is an optional dependency: when it is absent the
 * port reports the operation as unsupported instead of failing installation.
 */
export class PtySpawnPort implements SpawnPort {
  readonly backing: SessionBacking = 'pty';
  readonly supportsResize = true;

  async spawn(spec: SpawnSpec): Promise<SpawnedProcess> {
    let pty: typeof import('node-pty');
    try {
      pty = await import('node-pty');
    } catch {
      throw new OfficeFailure(
        ERROR_CODES.unsupported,
        'node-pty is not installed; the PTY session backing is unavailable on this host',
      );
    }

    const terminal = pty.spawn(spec.command, spec.args, {
      name: 'xterm-256color',
      cwd: spec.cwd,
      env: { ...process.env, ...spec.env } as Record<string, string>,
      cols: spec.cols,
      rows: spec.rows,
    });

    const listeners = new Set<(event: SpawnEvent) => void>();
    const emit = (event: SpawnEvent): void => {
      for (const listener of listeners) listener(event);
    };

    terminal.onData((data: string) => emit({ type: 'output', data }));
    terminal.onExit(({ exitCode }: { exitCode: number }) => emit({ type: 'exit', exitCode }));

    return {
      pid: terminal.pid,
      write: (data: string) => terminal.write(data),
      resize: (cols: number, rows: number) => terminal.resize(cols, rows),
      kill: () => terminal.kill(),
      onEvent: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };
  }
}
