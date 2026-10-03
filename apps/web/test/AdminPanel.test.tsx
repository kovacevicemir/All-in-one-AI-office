// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Capabilities } from '@ai-office/contracts';
import { AdminPanel } from '../src/components/AdminPanel.js';

afterEach(cleanup);

/** What the store holds before the runtime snapshot arrives. */
const NO_CAPABILITIES: Capabilities = { harnessAdapters: [], modelProviders: [] };

const CAPABILITIES: Capabilities = {
  harnessAdapters: [
    {
      id: 'pi',
      label: 'PI',
      capabilities: {
        cancel: true,
        midRunPrompt: true,
        telemetry: true,
        resize: false,
        interactiveInput: false,
      },
    },
  ],
  modelProviders: [{ id: 'deepseek', label: 'DeepSeek', models: ['deepseek-flash', 'deepseek-v4-pro'] }],
};

const WORKING_DIR = String.raw`C:\Users\emir\Documents\Personal Projects\outwar electron`;

type CreateAgentInput = Parameters<Parameters<typeof AdminPanel>[0]['onCreateAgent']>[0];
type CreateAgentMock = ReturnType<typeof vi.fn<(input: CreateAgentInput) => Promise<boolean>>>;

function setup(overrides: Partial<Parameters<typeof AdminPanel>[0]> = {}) {
  const onCreateAgent: CreateAgentMock = vi.fn(async () => true);
  const props = {
    capabilities: CAPABILITIES,
    busy: false,
    defaultWorkingDir: '',
    onCreateDepartment: vi.fn(),
    onCreateAgent,
    ...overrides,
  };
  const rendered = render(<AdminPanel {...props} />);
  return {
    props,
    // The override wins, so hand back what the component was actually given.
    onCreateAgent: props.onCreateAgent as CreateAgentMock,
    ...rendered,
  };
}

function fillAgentForm(name = 'Ada', dir = WORKING_DIR): void {
  fireEvent.change(screen.getByLabelText('New agent'), { target: { value: name } });
  fireEvent.change(screen.getByLabelText('Working directory'), { target: { value: dir } });
}

function clickAddAgent(): void {
  fireEvent.click(screen.getByRole('button', { name: 'Add agent' }));
}

describe('AdminPanel: adding an agent', () => {
  it('adds an agent with a working directory containing spaces', async () => {
    const { onCreateAgent } = setup();
    fillAgentForm('Ada', WORKING_DIR);
    clickAddAgent();

    await waitFor(() => expect(onCreateAgent).toHaveBeenCalledTimes(1));
    expect(onCreateAgent).toHaveBeenCalledWith({
      name: 'Ada',
      workingDir: WORKING_DIR,
      harnessId: 'pi',
      model: { providerId: 'deepseek', modelId: 'deepseek-flash' },
    });
  });

  /**
   * Regression: capabilities arrive asynchronously from the runtime snapshot.
   * Copying them into useState on mount froze the empty initial value, so the
   * selected model stayed '' and every submission was silently dropped.
   */
  it('picks up capabilities that arrive after mount', async () => {
    const onCreateAgent: CreateAgentMock = vi.fn(async () => true);
    const { rerender } = render(
      <AdminPanel
        capabilities={NO_CAPABILITIES}
        busy={false}
        defaultWorkingDir=""
        onCreateDepartment={vi.fn()}
        onCreateAgent={onCreateAgent}
      />,
    );

    rerender(
      <AdminPanel
        capabilities={CAPABILITIES}
        busy={false}
        defaultWorkingDir=""
        onCreateDepartment={vi.fn()}
        onCreateAgent={onCreateAgent}
      />,
    );

    fillAgentForm();
    clickAddAgent();

    await waitFor(() => expect(onCreateAgent).toHaveBeenCalledTimes(1));
    expect(onCreateAgent.mock.calls[0]?.[0]).toMatchObject({
      harnessId: 'pi',
      model: { providerId: 'deepseek', modelId: 'deepseek-flash' },
    });
  });

  it('uses a model the user picks explicitly', async () => {
    const { onCreateAgent } = setup();
    fillAgentForm();
    fireEvent.change(screen.getByLabelText('Model'), { target: { value: 'deepseek:deepseek-v4-pro' } });
    clickAddAgent();

    await waitFor(() => expect(onCreateAgent).toHaveBeenCalledTimes(1));
    expect(onCreateAgent.mock.calls[0]?.[0]).toMatchObject({
      model: { providerId: 'deepseek', modelId: 'deepseek-v4-pro' },
    });
  });

  it('keeps the typed name when creation fails', async () => {
    const onCreateAgent: CreateAgentMock = vi.fn(async () => false);
    setup({ onCreateAgent });
    fillAgentForm('Ada');
    clickAddAgent();

    await waitFor(() => expect(onCreateAgent).toHaveBeenCalledTimes(1));
    expect((screen.getByLabelText('New agent') as HTMLInputElement).value).toBe('Ada');
  });

  it('clears the name once the agent is created', async () => {
    const onCreateAgent: CreateAgentMock = vi.fn(async () => true);
    setup({ onCreateAgent });
    fillAgentForm('Ada');
    clickAddAgent();

    await waitFor(() => expect((screen.getByLabelText('New agent') as HTMLInputElement).value).toBe(''));
  });
});

describe('AdminPanel: never fails silently', () => {
  it('asks for a name instead of doing nothing', () => {
    const { onCreateAgent } = setup();
    fireEvent.change(screen.getByLabelText('Working directory'), { target: { value: WORKING_DIR } });
    clickAddAgent();

    expect(screen.getByRole('alert').textContent).toContain('name');
    expect(onCreateAgent).not.toHaveBeenCalled();
  });

  it('asks for a working directory instead of doing nothing', () => {
    const { onCreateAgent } = setup();
    fireEvent.change(screen.getByLabelText('New agent'), { target: { value: 'Ada' } });
    clickAddAgent();

    expect(screen.getByRole('alert').textContent).toContain('working directory');
    expect(onCreateAgent).not.toHaveBeenCalled();
  });

  it('explains that it is waiting when the runtime reports no harness or model', () => {
    const onCreateAgent: CreateAgentMock = vi.fn(async () => true);
    setup({ capabilities: NO_CAPABILITIES, onCreateAgent });
    fillAgentForm();
    clickAddAgent();

    expect(screen.getByText(/Waiting for the runtime/)).toBeDefined();
    expect(onCreateAgent).not.toHaveBeenCalled();
    expect((screen.getByRole('button', { name: 'Add agent' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('clears the complaint once the form is valid again', async () => {
    const { onCreateAgent } = setup();
    clickAddAgent();
    expect(screen.getByRole('alert')).toBeDefined();

    fillAgentForm();
    clickAddAgent();
    await waitFor(() => expect(onCreateAgent).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('AdminPanel: departments', () => {
  it('adds a department and clears the field', () => {
    const onCreateDepartment = vi.fn();
    setup({ onCreateDepartment });
    fireEvent.change(screen.getByLabelText('New department'), { target: { value: 'Engineering' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add department' }));

    expect(onCreateDepartment).toHaveBeenCalledWith('Engineering');
    expect((screen.getByLabelText('New department') as HTMLInputElement).value).toBe('');
  });

  it('says why an empty department name was rejected', () => {
    const onCreateDepartment = vi.fn();
    setup({ onCreateDepartment });
    fireEvent.click(screen.getByRole('button', { name: 'Add department' }));

    expect(screen.getByRole('alert').textContent).toContain('department');
    expect(onCreateDepartment).not.toHaveBeenCalled();
  });
});
