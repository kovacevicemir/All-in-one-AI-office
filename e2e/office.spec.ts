import { tmpdir } from 'node:os';
import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test';

/**
 * Browser end-to-end coverage for the MVP orchestration loop.
 *
 * Setup is seeded through the versioned HTTP API; the run itself is started
 * through the UI and the run's harness events are driven through the e2e control
 * API, so every assertion below is about what a person sees in the office.
 */
const API = 'http://127.0.0.1:4318';
const CONTROL = 'http://127.0.0.1:4319';

interface StartedRun {
  runId: string;
  taskId: string;
  sessionId: string;
}

let counter = 0;
function unique(label: string): string {
  counter += 1;
  return `${label} ${process.pid}-${counter}`;
}

async function createDepartment(request: APIRequestContext, name: string): Promise<string> {
  const response = await request.post(`${API}/api/departments`, { data: { name } });
  expect(response.ok(), await response.text()).toBeTruthy();
  return ((await response.json()) as { id: string }).id;
}

async function createAgent(
  request: APIRequestContext,
  input: { name: string; departmentId: string },
): Promise<string> {
  const response = await request.post(`${API}/api/agents`, {
    data: {
      name: input.name,
      departmentId: input.departmentId,
      workingDir: tmpdir(),
      harnessId: 'fake',
      model: { providerId: 'fake', modelId: 'fake-1' },
    },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return ((await response.json()) as { id: string }).id;
}

async function createTask(
  request: APIRequestContext,
  input: {
    agentId: string;
    title: string;
    instruction: string;
    dependsOn?: string[];
    originAgentId?: string;
  },
): Promise<string> {
  const response = await request.post(`${API}/api/tasks`, { data: input });
  expect(response.ok(), await response.text()).toBeTruthy();
  return ((await response.json()) as { id: string }).id;
}

async function control(
  request: APIRequestContext,
  runId: string,
  action: string,
  body: Record<string, unknown> = {},
): Promise<void> {
  const response = await request.post(`${CONTROL}/control/runs/${runId}/${action}`, { data: body });
  expect(response.ok(), await response.text()).toBeTruthy();
}

/** Selects an agent in the list and returns its inspector locator. */
async function inspect(page: Page, agentName: string) {
  await page.getByRole('row').filter({ hasText: agentName }).getByRole('button', { name: 'Inspect' }).click();
  const inspector = page.getByRole('complementary', { name: `Inspector for ${agentName}` });
  await expect(inspector).toBeVisible();
  return inspector;
}

function row(page: Page, agentName: string) {
  return page.getByRole('row').filter({ hasText: agentName });
}

/** Exact match on an AgentList cell, avoiding header/label substring collisions. */
function cell(page: Page, agentName: string, text: string) {
  return row(page, agentName).getByRole('cell', { name: text, exact: true });
}

/** Clicks Start next task and returns the ids the runtime linked together. */
async function startNextTask(page: Page, inspector: Locator): Promise<StartedRun> {
  const [response] = await Promise.all([
    page.waitForResponse(
      (candidate) => candidate.url().includes('/run') && candidate.request().method() === 'POST',
    ),
    inspector.getByRole('button', { name: 'Start next task' }).click(),
  ]);
  expect(response.ok(), await response.text()).toBeTruthy();
  return (await response.json()) as StartedRun;
}

test.beforeEach(async ({ page, request }) => {
  await request.post(`${CONTROL}/control/reset`);
  await page.goto('/');
  await expect(page.locator('.badge.connection-connected')).toHaveText('connected');
});

test('live state, activity, context, unblocking, results and terminal output', async ({ page, request }) => {
  const departmentId = await createDepartment(request, unique('Engineering'));
  const ada = await createAgent(request, { name: unique('Ada'), departmentId });
  const grace = await createAgent(request, { name: unique('Grace'), departmentId });

  const parserTask = await createTask(request, {
    agentId: ada,
    title: 'Write the parser',
    instruction: 'write the parser',
  });
  await createTask(request, {
    agentId: grace,
    title: 'Add parser tests',
    instruction: 'add parser tests',
    dependsOn: [parserTask],
  });

  // Grace depends on Ada's unfinished task, so her queue is blocked.
  await expect(cell(page, 'Grace', '1 task')).toBeVisible();
  const graceBlocked = await inspect(page, 'Grace');
  await expect(graceBlocked.getByTestId('agent-next-task')).toHaveText('—');
  await expect(graceBlocked.getByTestId('agent-waiting')).toContainText('Write the parser (queued)');

  // Start Ada's run and drive it from the outside.
  const adaInspector = await inspect(page, 'Ada');
  const run = await startNextTask(page, adaInspector);
  await control(request, run.runId, 'activity', { summary: 'Writing the parser' });
  await control(request, run.runId, 'output', { data: 'writing the parser...\n' });
  await control(request, run.runId, 'telemetry', { percent: 12, tokens: 1200, contextWindow: 10_000 });

  // Live state is visible in both the list and the inspector. An activity event
  // moves a running agent to `thinking` (see packages/core/src/state.ts).
  await expect(row(page, 'Ada').locator('.badge.state-thinking')).toBeVisible();
  await expect(row(page, 'Ada').getByText('Writing the parser')).toBeVisible();
  await expect(cell(page, 'Ada', '12%')).toBeVisible();
  await expect(adaInspector.getByTestId('agent-activity')).toHaveText('Writing the parser');
  await expect(adaInspector.getByTestId('agent-context')).toContainText('12% of 10K tokens');
  await expect(adaInspector.getByTestId('agent-pressure')).toHaveText('nominal');
  await expect(adaInspector.getByTestId('terminal-tail')).toContainText('writing the parser...');

  // Completing Ada's run records a result and unblocks Grace.
  await control(request, run.runId, 'complete', { output: 'parser written fine' });
  await expect(adaInspector.getByTestId('agent-last-report')).toContainText('parser written fine');
  await expect(cell(page, 'Grace', '1 task')).toBeHidden();

  const graceUnblocked = await inspect(page, 'Grace');
  await expect(graceUnblocked.getByTestId('agent-next-task')).toHaveText('Add parser tests');
  await expect(graceUnblocked.getByTestId('agent-waiting')).toHaveText('—');

  // Grace can now run her previously blocked task to completion.
  const graceRun = await startNextTask(page, graceUnblocked);
  await control(request, graceRun.runId, 'complete', { output: 'tests added' });
  await expect(graceUnblocked.getByTestId('agent-last-report')).toContainText('tests added');
});

test('a blocked task unblocks and the mood changes at warning and critical', async ({ page, request }) => {
  const departmentId = await createDepartment(request, unique('Operations'));
  const lin = await createAgent(request, { name: unique('Lin'), departmentId });
  const setupTask = await createTask(request, {
    agentId: lin,
    title: 'Cap the sessions',
    instruction: 'cap the sessions',
  });
  await createTask(request, {
    agentId: lin,
    title: 'Report the caps',
    instruction: 'report the caps',
    dependsOn: [setupTask],
  });

  const inspector = await inspect(page, 'Lin');
  await expect(inspector.getByTestId('agent-next-task')).toHaveText('Cap the sessions');

  const run = await startNextTask(page, inspector);

  // Crossing the warning threshold at 30% turns the bot into "complaining".
  await control(request, run.runId, 'telemetry', { percent: 35, tokens: 3500, contextWindow: 10_000 });
  await expect(row(page, 'Lin').locator('.badge.pressure-warning')).toHaveText('complaining');
  await expect(inspector.getByTestId('agent-pressure')).toHaveText('complaining');

  // Crossing the critical threshold at 50% turns it into "stressed".
  await control(request, run.runId, 'telemetry', { percent: 60, tokens: 6000, contextWindow: 10_000 });
  await expect(row(page, 'Lin').locator('.badge.pressure-critical')).toHaveText('stressed');
  await expect(inspector.getByTestId('agent-pressure')).toHaveText('stressed');

  // The dependent task is blocked until this run finishes, then runnable.
  await control(request, run.runId, 'complete', { output: 'sessions capped' });
  await expect(inspector.getByTestId('agent-next-task')).toHaveText('Report the caps');
  await expect(inspector.getByTestId('agent-waiting')).toHaveText('—');
  await expect(inspector.getByTestId('agent-last-report')).toContainText('sessions capped');
});

test('shows a delegation and a dependency hand-off as markers and inspector entries', async ({
  page,
  request,
}) => {
  const departmentId = await createDepartment(request, unique('Engineering'));
  const ada = await createAgent(request, { name: unique('Ada'), departmentId });
  const grace = await createAgent(request, { name: unique('Grace'), departmentId });

  const base = await createTask(request, {
    agentId: ada,
    title: 'Build the parser',
    instruction: 'build the parser',
  });
  const dependent = await createTask(request, {
    agentId: grace,
    title: 'Test the parser',
    instruction: 'test the parser',
    dependsOn: [base],
    originAgentId: ada,
  });

  // The delegation is visible in the accessible inspector list before anything runs.
  const graceInspector = await inspect(page, 'Grace');
  await expect(graceInspector.getByTestId(`comm-list-item-comm_req_${dependent}`)).toContainText(
    /Ada .+ → Grace .+: Test the parser/,
  );

  // Run the dependency, then the dependent task, so a hand-off is delivered.
  const adaInspector = await inspect(page, 'Ada');
  const baseRun = await startNextTask(page, adaInspector);
  await control(request, baseRun.runId, 'complete', { output: 'parser built' });

  const graceRun = await startNextTask(page, await inspect(page, 'Grace'));
  await control(request, graceRun.runId, 'output', { data: 'running tests\n' });
  await control(request, graceRun.runId, 'complete', { output: 'tests pass' });

  const handoffId = `comm_hand_${dependent}_${base}`;
  await expect(graceInspector.getByTestId(`comm-list-item-${handoffId}`)).toContainText(
    "results of 'Build the parser' delivered",
  );

  // The retained transcript interleaves the hand-off marker, and its summary is
  // reachable by hover (and, in the component tests, by keyboard focus).
  await graceInspector.getByRole('button', { name: 'Transcript' }).first().click();
  const marker = page.getByTestId(`comm-marker-${handoffId}`);
  await expect(marker).toBeVisible();
  await marker.hover();
  await expect(page.getByTestId(`comm-popover-${handoffId}`)).toContainText(
    /Ada .+ → Grace .+: results of 'Build the parser' delivered/,
  );
});
