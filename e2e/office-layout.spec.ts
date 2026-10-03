import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

/**
 * Browser coverage for the accessible layout editor. The default suite runs
 * with WebGL disabled, which is exactly the point: adding, removing, resetting,
 * exporting and importing a layout all work without the scene, a real file
 * dialog, or any network.
 */
const API = 'http://127.0.0.1:4318';
const CONTROL = 'http://127.0.0.1:4319';

async function openEditor(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('.badge.connection-connected')).toHaveText('connected');
  await page.getByRole('button', { name: 'Office', exact: true }).click();
  await page.getByRole('button', { name: 'Edit layout' }).click();
  await expect(page.locator('.layout-items')).toBeVisible();
}

function items(page: Page) {
  return page.locator('.layout-items li');
}

interface StoredItem {
  id: string;
  kind: string;
  x: number;
  y: number;
  rotation: number;
}

async function readLayout(page: Page): Promise<StoredItem[]> {
  return page.evaluate(() => {
    const raw = localStorage.getItem('ai-office.layout.v1');
    if (raw === null) return [];
    return (JSON.parse(raw) as { items: StoredItem[] }).items;
  });
}

test.beforeEach(async ({ request }: { request: APIRequestContext }) => {
  await request.post(`${CONTROL}/control/reset`);
});

test('adds, keeps, resets, exports and refuses a bad import without a scene', async ({ page }) => {
  await openEditor(page);
  const before = await items(page).count();
  expect(before).toBeGreaterThan(0);

  // Add a chair from the catalogue through the keyboard-reachable Place control.
  await page.getByRole('button', { name: 'Chair', exact: true }).click();
  await page.getByRole('button', { name: 'Place Chair' }).click();
  await expect(items(page)).toHaveCount(before + 1);

  // The edit survives a reload.
  await page.reload();
  await expect(page.locator('.badge.connection-connected')).toHaveText('connected');
  await page.getByRole('button', { name: 'Office', exact: true }).click();
  await page.getByRole('button', { name: 'Edit layout' }).click();
  await expect(items(page)).toHaveCount(before + 1);

  // ... and a switch to the list view and back.
  await page.getByRole('button', { name: 'Switch to list view' }).click();
  await page.getByRole('button', { name: 'Switch to office' }).click();
  await page.getByRole('button', { name: 'Edit layout' }).click();
  await expect(items(page)).toHaveCount(before + 1);

  // Export produces a JSON download with no dialog and no network.
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('ai-office-layout.json');

  // A rejected import names the reason and leaves the layout untouched.
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import' }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name: 'bad.json',
    mimeType: 'application/json',
    buffer: Buffer.from('this is not json'),
  });
  await expect(page.getByRole('alert')).toContainText('not valid JSON');
  await expect(items(page)).toHaveCount(before + 1);

  // Reset restores the default plan and discards the edit.
  await page.getByRole('button', { name: 'Reset to default' }).click();
  await expect(items(page)).toHaveCount(before);
});

test('imports a layout file and reports skipped unknowns', async ({ page }) => {  await openEditor(page);
  const before = await items(page).count();

  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import' }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name: 'layout.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        version: 1,
        items: [
          { id: 'desk_a', kind: 'desk', x: 0, y: 0, rotation: 0 },
          { id: 'ufo_a', kind: 'ufo', x: 1, y: 1, rotation: 0 },
        ],
      }),
    ),
  });

  await expect(page.locator('.layout-status.info')).toContainText('1 unknown item skipped');
  await expect(items(page)).toHaveCount(1);
  expect(before).toBeGreaterThan(1);
});

test('rotates, removes and resets a placed item', async ({ page }) => {  await openEditor(page);
  const before = await items(page).count();

  const first = page.locator('.layout-items button').first();
  await first.click();
  const id = (await first.locator('.item-id').textContent()) ?? '';
  expect(id.length).toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Rotate' }).click();
  await expect
    .poll(async () => (await readLayout(page)).find((item) => item.id === id)?.rotation)
    .toBe(1);

  await page.getByRole('button', { name: 'Remove' }).click();
  await expect(items(page)).toHaveCount(before - 1);
  await expect.poll(async () => (await readLayout(page)).some((item) => item.id === id)).toBe(false);

  await page.getByRole('button', { name: 'Reset to default' }).click();
  await expect(items(page)).toHaveCount(before);
  await expect.poll(async () => (await readLayout(page)).some((item) => item.id === id)).toBe(true);
});

test('rotates the pending item before placing it', async ({ page }) => {
  await openEditor(page);
  const before = await items(page).count();

  await page.getByRole('button', { name: 'Chair', exact: true }).click();
  await expect(page.getByTestId('layout-preview')).toContainText('Placing Chair · 0°');
  await page.getByRole('button', { name: 'Rotate 90°' }).click();
  await page.getByRole('button', { name: 'Rotate 90°' }).click();
  await page.getByRole('button', { name: 'Rotate 90°' }).click();
  await expect(page.getByTestId('layout-preview')).toContainText('Placing Chair · 270°');

  await page.getByRole('button', { name: 'Place Chair' }).click();
  await expect(items(page)).toHaveCount(before + 1);
  const added = (await readLayout(page)).find((item) => item.id.startsWith('chair_'));
  expect(added?.rotation).toBe(3);
});
