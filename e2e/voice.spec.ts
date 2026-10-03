import { tmpdir } from 'node:os';
import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test';

/**
 * Browser end-to-end coverage for voice prompting.
 *
 * The web server is started with `VITE_VOICE_FAKE=1`, so the app swaps in a
 * deterministic streaming speech engine: dictation appears in the field as the
 * user "speaks", with no microphone, no model download, and no network.
 */
const API = 'http://127.0.0.1:4318';
const CONTROL = 'http://127.0.0.1:4319';

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
  name: string,
  departmentId: string,
): Promise<string> {
  const response = await request.post(`${API}/api/agents`, {
    data: {
      name,
      departmentId,
      workingDir: tmpdir(),
      harnessId: 'fake',
      model: { providerId: 'fake', modelId: 'fake-1' },
    },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return ((await response.json()) as { id: string }).id;
}

async function inspect(page: Page, agentName: string): Promise<Locator> {
  await page
    .getByRole('row')
    .filter({ hasText: agentName })
    .getByRole('button', { name: 'Inspect' })
    .click();
  const inspector = page.getByRole('complementary', { name: `Inspector for ${agentName}` });
  await expect(inspector).toBeVisible();
  return inspector;
}

async function inspectNewAgent(page: Page, request: APIRequestContext): Promise<Locator> {
  const departmentId = await createDepartment(request, unique('Voice'));
  const name = unique('Vera');
  await createAgent(request, name, departmentId);
  return inspect(page, name);
}

/** Seeds one agent with a queued task and starts its run so prompting is live. */
async function startLiveAgent(page: Page, request: APIRequestContext): Promise<Locator> {
  const departmentId = await createDepartment(request, unique('Voice'));
  const name = unique('Vera');
  const agentId = await createAgent(request, name, departmentId);
  await request.post(`${API}/api/tasks`, {
    data: { agentId, title: unique('Speak'), instruction: 'say something' },
  });

  const inspector = await inspect(page, name);
  await inspector.getByRole('button', { name: 'Start next task' }).click();
  await expect(inspector.getByRole('button', { name: 'Start voice prompt' })).toBeEnabled();
  return inspector;
}

function promptRequest(page: Page) {
  return page.waitForRequest(
    (candidate) => candidate.url().includes('/prompt') && candidate.method() === 'POST',
  );
}

test.beforeEach(async ({ page, request }) => {
  await request.post(`${CONTROL}/control/reset`);
  await page.goto('/');
  await expect(page.locator('.badge.connection-connected')).toHaveText('connected');
});

test('dictates into the prompt field live and sends the cleaned text', async ({ page, request }) => {
  const inspector = await startLiveAgent(page, request);

  await inspector.getByRole('button', { name: 'Start voice prompt' }).click();
  // The fake engine streams the transcript; it shows up without stopping first.
  await expect(inspector.getByRole('textbox', { name: 'Prompt' })).toHaveValue('Hello there.');

  const pending = promptRequest(page);
  await inspector.getByRole('button', { name: 'Send' }).click();
  const sent = await pending;

  expect(sent.postDataJSON()).toEqual({ text: 'Hello there.' });
});

test('edits a dictated prompt before sending', async ({ page, request }) => {
  const inspector = await startLiveAgent(page, request);

  await inspector.getByRole('button', { name: 'Start voice prompt' }).click();
  const field = inspector.getByRole('textbox', { name: 'Prompt' });
  await expect(field).toHaveValue('Hello there.');
  await field.fill('Refined prompt for the agent');

  const pending = promptRequest(page);
  await inspector.getByRole('button', { name: 'Send' }).click();
  const sent = await pending;

  expect(sent.postDataJSON()).toEqual({ text: 'Refined prompt for the agent' });
});

test('dictates a task instruction live without a live run', async ({ page, request }) => {
  const inspector = await inspectNewAgent(page, request);

  await inspector.getByRole('button', { name: 'Start task instruction' }).click();

  await expect(inspector.getByRole('textbox', { name: 'Task instruction' })).toHaveValue(
    'Hello there.',
  );
});
