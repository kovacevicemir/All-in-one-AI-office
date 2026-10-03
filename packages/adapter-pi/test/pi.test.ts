import { describe, expect, it } from 'vitest';
import type { HarnessEvent, StartRunRequest } from '@ai-office/core';
import { MemoryProcess, MemorySpawn } from '@ai-office/adapter-fake';
import { PiHarnessAdapter, composeInitialPrompt } from '@ai-office/adapter-pi';

const request: StartRunRequest = {
  runId: 'run_1',
  sessionId: 'session_1',
  agentId: 'agent_1',
  taskId: 'task_1',
  workingDir: '/tmp/work',
  instruction: 'refactor the auth module',
  model: {
    providerId: 'deepseek',
    modelId: 'deepseek-flash',
    provider: 'deepseek',
    model: 'deepseek-flash',
  },
  dependencyResults: [],
  cols: 120,
  rows: 30,
};

function setup(options: { available?: boolean; approveProject?: boolean } = {}) {
  const spawn = new MemorySpawn();
  spawn.onSpawn = () =>
    options.available === false ? [{ type: 'error' as const, message: 'spawn pi ENOENT' }] : [];
  const adapter = new PiHarnessAdapter({
    spawn,
    telemetryIntervalMs: 60_000,
    approveProject: options.approveProject,
  });
  return { spawn, adapter };
}

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function respond(run: MemoryProcess, command: string, data?: unknown, id?: string): void {
  run.stdout(`${JSON.stringify({ id, type: 'response', command, success: true, data })}\n`);
}

async function start(
  options: { available?: boolean; approveProject?: boolean } = {},
  override: Partial<StartRunRequest> = {},
) {
  const ctx = setup(options);
  const events: HarnessEvent[] = [];
  const run = await ctx.adapter.startRun({ ...request, ...override });
  run.onEvent((event) => events.push(event));
  await tick();
  return { ...ctx, run, events, process: ctx.spawn.last };
}

describe('PI harness: launch', () => {
  it('declares its capabilities and identity', () => {
    const { adapter } = setup();
    expect(adapter.id).toBe('pi');
    expect(adapter.backing).toBe('pipe');
    expect(adapter.capabilities.midRunPrompt).toBe(true);
    expect(adapter.capabilities.telemetry).toBe(true);
    expect(adapter.capabilities.resize).toBe(false);
  });

  it('launches PI in rpc mode with the resolved model and a per-run session', async () => {
    const { process } = await start();
    expect(process.spec.command).toBe('pi');
    expect(process.spec.cwd).toBe('/tmp/work');
    const args = process.spec.args;
    expect(args).toContain('--mode');
    expect(args[args.indexOf('--mode') + 1]).toBe('rpc');
    expect(args[args.indexOf('--provider') + 1]).toBe('deepseek');
    expect(args[args.indexOf('--model') + 1]).toBe('deepseek-flash');
    expect(args[args.indexOf('--session-id') + 1]).toBe('session_1');
  });

  it('inherits PI project trust when no override is configured', async () => {
    const { process } = await start();
    expect(process.spec.args).not.toContain('--approve');
    expect(process.spec.args).not.toContain('--no-approve');
  });

  it('honors an explicit project-trust override', async () => {
    const { process } = await start({ approveProject: false });
    expect(process.spec.args).toContain('--no-approve');
    expect(process.spec.args).not.toContain('--approve');
  });

  /**
   * Regression: a workspace path was passed as `--session-dir`. On Windows a
   * path containing spaces is split apart by the `cmd.exe` shim wrapper, and PI
   * received a mangled path that it tried to mkdir. The working directory now
   * travels as the process cwd, which is never shell-quoted.
   */
  it('passes no path or whitespace on the command line', async () => {
    const { process } = await start({}, { workingDir: '/tmp/work with spaces/and more' });
    expect(process.spec.args).not.toContain('--session-dir');
    for (const arg of process.spec.args) {
      expect(arg, `argument "${arg}" contains whitespace and would be mangled on Windows`).not.toMatch(
        /\s/,
      );
    }
  });

  it('never injects an office-authored system prompt', async () => {
    const { process } = await start();
    expect(process.spec.args).not.toContain('--append-system-prompt');
    expect(process.spec.args).not.toContain('--system-prompt');
  });

  it('passes an explicitly configured system prompt as a replace, never an append', async () => {
    const { process } = await start({}, { systemPrompt: 'You are a careful reviewer.' });
    expect(process.spec.args).toContain('--system-prompt');
    expect(process.spec.args[process.spec.args.indexOf('--system-prompt') + 1]).toBe(
      'You are a careful reviewer.',
    );
    expect(process.spec.args).not.toContain('--append-system-prompt');
  });

  it('appends the agent\'s saved instructions as a distinct system message', async () => {
    const instructions = 'You own the build.\nRun npm test before marking work done.';
    const { process } = await start({}, { instructions });
    expect(process.spec.args).toContain('--append-system-prompt');
    expect(process.spec.args[process.spec.args.indexOf('--append-system-prompt') + 1]).toBe(instructions);
    expect(process.spec.args).not.toContain('--system-prompt');

    const prompt = process.commands().find((command) => command.type === 'prompt');
    expect(prompt?.message).toBe(request.instruction);
  });

  it('adds no system flag when the agent has no instructions', async () => {
    const { process } = await start({}, { instructions: '' });
    expect(process.spec.args).not.toContain('--append-system-prompt');
    expect(process.spec.args).not.toContain('--system-prompt');
  });

  it('can combine a replacement prompt with appended agent instructions', async () => {
    const { process } = await start(
      {},
      { systemPrompt: 'base', instructions: 'agent instructions' },
    );
    expect(process.spec.args[process.spec.args.indexOf('--system-prompt') + 1]).toBe('base');
    expect(process.spec.args[process.spec.args.indexOf('--append-system-prompt') + 1]).toBe(
      'agent instructions',
    );
  });

  it('sends the instruction verbatim as the user prompt', async () => {
    const instruction = 'refactor the auth module\nkeep the public API ';
    const { process } = await start({}, { instruction });
    const commands = process.commands();
    const prompt = commands.find((command) => command.type === 'prompt');
    expect(prompt?.message).toBe(instruction);
  });

  it('prefixes dependency results as a delimited block but leaves the instruction intact', async () => {
    const dependencyResults = [{ taskId: 'task_0', title: 'Base', output: 'base output' }];
    const composed = composeInitialPrompt({ ...request, dependencyResults });
    expect(composed).toContain('Dependency results');
    expect(composed).toContain('### Base (task_0)');
    expect(composed).toContain('base output');
    expect(composed.endsWith(request.instruction)).toBe(true);
  });

  it('composes no wrapper at all when there are no dependencies', () => {
    expect(composeInitialPrompt({ ...request, dependencyResults: [] })).toBe(request.instruction);
  });
});

describe('PI harness: availability', () => {
  it('reports available when the CLI answers', async () => {
    const spawn = new MemorySpawn();
    spawn.onSpawn = () => [{ type: 'exit', exitCode: 0 }];
    const adapter = new PiHarnessAdapter({ spawn });
    await expect(adapter.isAvailable()).resolves.toBe(true);
    expect(spawn.last.spec.args).toEqual(['--version']);
  });

  it('reports unavailable when the CLI is missing', async () => {
    const spawn = new MemorySpawn();
    spawn.onSpawn = () => [{ type: 'error', message: 'ENOENT' }];
    const adapter = new PiHarnessAdapter({ spawn });
    await expect(adapter.isAvailable()).resolves.toBe(false);
  });
});

describe('PI harness: event mapping', () => {
  it('maps message deltas, tool activity and results into normalized events', async () => {
    const { process, run } = await start();
    const events: HarnessEvent[] = [];
    run.onEvent((event) => events.push(event));

    process.stdout('{"type":"agent_start"}\n');
    process.stdout(
      `${JSON.stringify({
        type: 'message_update',
        usage: { input: 100, output: 2, cacheRead: 0, cacheWrite: 0, totalTokens: 102, cost: { total: 0.002 } },
        assistantMessageEvent: { type: 'text_delta', contentIndex: 0, delta: 'Hello ' },
      })}\n`,
    );
    process.stdout(
      `${JSON.stringify({ type: 'tool_execution_start', toolCallId: 'c1', toolName: 'bash', args: { command: 'ls -la' } })}\n`,
    );
    process.stdout(
      `${JSON.stringify({
        type: 'tool_execution_end',
        toolCallId: 'c1',
        toolName: 'bash',
        result: { content: [{ type: 'text', text: 'total 48' }] },
        isError: false,
      })}\n`,
    );

    const output = events.filter((event) => event.type === 'output').map((event) => event.data);
    expect(output).toContain('Hello ');
    expect(output.some((chunk) => chunk.includes('$ ls -la'))).toBe(true);
    expect(output.some((chunk) => chunk.includes('total 48'))).toBe(true);
    const activity = events.filter((event) => event.type === 'activity');
    expect(activity.at(-1)).toEqual({ type: 'activity', summary: 'Running: ls -la' });
  });

  it('shows written code and edits in the terminal transcript', async () => {
    const { process, run } = await start();
    const events: HarnessEvent[] = [];
    run.onEvent((event) => events.push(event));

    process.stdout(
      `${JSON.stringify({ type: 'tool_execution_start', toolCallId: 'w1', toolName: 'write', args: { path: 'xox.html', content: '<h1>hi</h1>' } })}\n`,
    );
    process.stdout(
      `${JSON.stringify({ type: 'tool_execution_start', toolCallId: 'e1', toolName: 'edit', args: { path: 'app.ts', edits: [{ oldText: 'a', newText: 'b' }] } })}\n`,
    );

    const output = events
      .filter((event) => event.type === 'output')
      .map((event) => event.data)
      .join('');
    expect(output).toContain('[write] xox.html');
    expect(output).toContain('<h1>hi</h1>');
    expect(output).toContain('[edit] app.ts');
    expect(output).toContain('- a');
    expect(output).toContain('+ b');
  });

  it('surfaces non-protocol diagnostics verbatim instead of dropping them', async () => {
    const { process, run } = await start();
    const events: HarnessEvent[] = [];
    run.onEvent((event) => events.push(event));

    process.stdout('warn: something odd\n');
    expect(events).toContainEqual({ type: 'output', data: 'warn: something odd\n' });
  });

  it('handles CRLF framing and split records', async () => {
    const { process, run } = await start();
    const events: HarnessEvent[] = [];
    run.onEvent((event) => events.push(event));

    process.stdout('{"type":"message_update","assistantMessageEvent":{"type":"text_de');
    process.stdout('lta","delta":"split"}}\r\n');
    const output = events.filter((event) => event.type === 'output').map((event) => event.data);
    expect(output).toContain('split');
  });

  it('reports context usage from get_session_stats', async () => {
    const { process, run, events } = await start();
    run.onEvent((event) => events.push(event));
    process.stdout('{"type":"turn_end","message":{},"toolResults":[]}\n');
    await tick();

    const statsCommand = process.commands().find((command) => command.type === 'get_session_stats');
    expect(statsCommand).toBeDefined();
    respond(
      process,
      'get_session_stats',
      {
        contextUsage: { tokens: 300_000, contextWindow: 1_000_000, percent: 30 },
        tokens: { input: 250_000, output: 50_000, cacheRead: 0, cacheWrite: 0, totalTokens: 300_000 },
        cost: 0.42,
      },
      String(statsCommand?.id),
    );
    await tick();

    const telemetry = events.filter((event) => event.type === 'telemetry').at(-1);
    expect(telemetry).toBeDefined();
    if (telemetry?.type !== 'telemetry') return;
    expect(telemetry.telemetry.available).toBe(true);
    expect(telemetry.telemetry.contextUsage.percent).toBe(30);
    expect(telemetry.telemetry.usage.cost).toBe(0.42);
  });

  it('reports unknown percent after compaction until fresh usage arrives', async () => {
    const { process, run, events } = await start();
    run.onEvent((event) => events.push(event));

    process.stdout('{"type":"compaction_start","reason":"threshold"}\n');
    process.stdout('{"type":"compaction_end","reason":"threshold","aborted":false}\n');

    const telemetry = events.filter((event) => event.type === 'telemetry').at(-1);
    expect(telemetry).toBeDefined();
    if (telemetry?.type !== 'telemetry') return;
    expect(telemetry.telemetry.contextUsage.percent).toBeNull();
  });

  it('ends the run on agent_settled with the final assistant output', async () => {
    const { process, events } = await start();
    process.stdout('{"type":"agent_start"}\n');
    process.stdout('{"type":"message_start","message":{"role":"assistant","content":[]}}\n');
    process.stdout(
      `${JSON.stringify({ type: 'message_end', message: { role: 'assistant', content: [{ type: 'text', text: 'final answer' }] } })}\n`,
    );
    process.stdout('{"type":"agent_settled"}\n');
    await tick();

    const end = events.filter((event) => event.type === 'end').at(-1);
    expect(end).toBeDefined();
    if (end?.type !== 'end') return;
    expect(end.status).toBe('completed');
    expect(end.finalOutput).toBe('final answer');
  });

  it('reports failure when the process exits non-zero before settling', async () => {
    const { process, events } = await start();
    process.stdout('{"type":"agent_start"}\n');
    process.exit(3);

    const end = events.filter((event) => event.type === 'end').at(-1);
    expect(end).toBeDefined();
    if (end?.type !== 'end') return;
    expect(end.status).toBe('failed');
    expect(end.exitCode).toBe(3);
    expect(end.failureReason).toContain('3');
  });

  it('rejects raw terminal input and resize, since RPC is not a terminal', async () => {
    const { run } = await start();
    expect(() => run.write('x')).toThrow(/do not accept raw terminal input/);
    expect(() => run.resize(80, 24)).toThrow(/cannot be resized/);
  });

  it('uses steering when a prompt arrives while the agent is streaming', async () => {
    const { process, run } = await start();
    process.stdout('{"type":"agent_start"}\n');

    const pending = run.prompt('change of plan');
    await tick();
    const sent = process.commands().find((command) => command.type === 'prompt' && command.streamingBehavior === 'steer');
    expect(sent).toBeDefined();
    respond(process, 'prompt', undefined, String(sent?.id));

    await expect(pending).resolves.toBe('steer');
  });
});

describe('PI harness: interactive dialogs', () => {
  /**
   * Regression: PI blocks on a dialog (e.g. "Allow project MCP server?"). The
   * adapter ignored it, PI waited forever, and the run died with a confusing
   * "PI did not respond" timeout after 15 seconds of dead waiting.
   */
  it('answers a blocking dialog instead of hanging', async () => {
    const { process, run, events } = await start();
    run.onEvent((event) => events.push(event));

    process.stdout(
      `${JSON.stringify({
        type: 'extension_ui_request',
        id: 'ui-1',
        method: 'confirm',
        title: 'Allow project MCP server "postgres"?',
        message: 'A project MCP server wants to run.',
      })}\n`,
    );
    await tick();

    const answer = process.commands().find((command) => command.type === 'extension_ui_response');
    expect(answer).toMatchObject({ id: 'ui-1', cancelled: true });

    const output = events.filter((event) => event.type === 'output').map((event) => event.data).join('');
    expect(output).toContain('Allow project MCP server');
  });

  it('never auto-approves a dialog on the user behalf', async () => {
    const { process } = await start();
    for (const method of ['confirm', 'select', 'input', 'editor']) {
      process.stdout(`${JSON.stringify({ type: 'extension_ui_request', id: `ui-${method}`, method, title: 'x' })}\n`);
    }
    await tick();

    const answers = process.commands().filter((command) => command.type === 'extension_ui_response');
    expect(answers).toHaveLength(4);
    for (const answer of answers) {
      expect(answer).toMatchObject({ cancelled: true });
      expect(answer).not.toHaveProperty('confirmed');
      expect(answer).not.toHaveProperty('value');
    }
  });

  it('does not answer fire-and-forget UI methods', async () => {
    const { process } = await start();
    process.stdout('{"type":"extension_ui_request","id":"ui-2","method":"setStatus","statusKey":"ralph"}\n');
    process.stdout('{"type":"extension_ui_request","id":"ui-3","method":"setWidget","widgetKey":"ralph"}\n');
    await tick();

    expect(process.commands().some((command) => command.type === 'extension_ui_response')).toBe(false);
  });

  it('does not present an extension notification as agent activity', async () => {
    const { process, run, events } = await start();
    run.onEvent((event) => events.push(event));

    process.stdout('{"type":"extension_ui_request","id":"ui-4","method":"notify","message":"MCP: 1 server enabled"}\n');
    await tick();

    expect(events.filter((event) => event.type === 'activity')).toHaveLength(0);
    expect(process.commands().some((command) => command.type === 'extension_ui_response')).toBe(false);
  });
});
