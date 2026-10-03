import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const API = 'http://127.0.0.1:4318';
const CONTROL = 'http://127.0.0.1:4319';
const MODEL = { providerId: 'fake', modelId: 'fake-1' };
const CAMERA_POSITION: [number, number, number] = [18, 22, 24];
const CAMERA_TARGET: [number, number, number] = [0, 0.6, 0];
const CAMERA_ZOOM = 30;
type Vec3 = [number, number, number];

test.use({
  channel: 'chromium',
  launchOptions: {
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  },
});

async function seed(request: APIRequestContext, names: string[]): Promise<string[]> {
  await request.post(`${CONTROL}/control/reset`);
  const department = await request.post(`${API}/api/departments`, { data: { name: 'Engineering' } });
  const departmentId = ((await department.json()) as { id: string }).id;
  const ids: string[] = [];
  for (const name of names) {
    const r = await request.post(`${API}/api/agents`, {
      data: { name, departmentId, workingDir: process.cwd(), harnessId: 'fake', model: MODEL },
    });
    ids.push(((await r.json()) as { id: string }).id);
  }
  return ids;
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const normalize = (v: Vec3): Vec3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};

function project(point: Vec3, box: { x: number; y: number; width: number; height: number }) {
  const zAxis = normalize(sub(CAMERA_POSITION, CAMERA_TARGET));
  const xAxis = normalize(cross([0, 1, 0], zAxis));
  const yAxis = cross(zAxis, xAxis);
  const rel = sub(point, CAMERA_TARGET);
  return {
    x: box.x + dot(xAxis, rel) * CAMERA_ZOOM + box.width / 2,
    y: box.y + -dot(yAxis, rel) * CAMERA_ZOOM + box.height / 2,
  };
}

async function readPose(page: Page, id: string) {
  return page.evaluate((agentId) => {
    const raw = localStorage.getItem('ai-office.poses.v1');
    return raw === null ? null : ((JSON.parse(raw) as Record<string, unknown>)[agentId] ?? null);
  }, id);
}

test('debug drag only', async ({ page, request }) => {
  const [ada] = await seed(request, ['Ada']);
  await page.goto('/');
  await expect(page.locator('.badge.connection-connected')).toHaveText('connected');
  await page.getByRole('button', { name: 'Office', exact: true }).click();
  const canvas = page.locator('.canvas-wrap canvas');
  await expect(canvas).toBeVisible();
  await page.waitForTimeout(2000);
  const box = (await canvas.boundingBox())!;
  const start = project([-1.7, 0.85, -1.6], box);
  console.log('START', JSON.stringify(start));
  await expect.poll(() => readPose(page, ada!)).not.toBeNull();
  const before = await readPose(page, ada!);
  await page.mouse.move(box.x + 5, box.y + 5);
  await page.mouse.move(start.x, start.y);
  await page.waitForTimeout(200);
  await page.mouse.down();
  for (let i = 1; i <= 14; i += 1) {
    await page.mouse.move(start.x + (140 * i) / 14, start.y - (60 * i) / 14);
  }
  await page.mouse.up();
  await page.waitForTimeout(600);
  const after = await readPose(page, ada!);
  console.log('BEFORE', JSON.stringify(before), 'AFTER', JSON.stringify(after));
  expect(after).not.toEqual(before);
});

test('debug hover only', async ({ page, request }) => {
  const [ada, grace] = await seed(request, ['Ada', 'Grace']);
  await request.post(`${API}/api/tasks`, {
    data: { agentId: grace, title: 'Write the parser', instruction: 'write the parser', originAgentId: ada },
  });
  await page.goto('/');
  await expect(page.locator('.badge.connection-connected')).toHaveText('connected');
  await page.getByRole('button', { name: 'Office', exact: true }).click();
  const canvas = page.locator('.canvas-wrap canvas');
  await expect(canvas).toBeVisible();
  await page.waitForTimeout(2000);
  const box = (await canvas.boundingBox())!;
  const envelope = project([-0.85, 0.95, -1.6], box);
  console.log('ENVELOPE', JSON.stringify(envelope));
  let found: { x: number; y: number } | null = null;
  for (let dx = -80; dx <= 80 && found === null; dx += 16) {
    for (let dy = -80; dy <= 80; dy += 16) {
      await page.mouse.move(envelope.x + dx, envelope.y + dy);
      if ((await page.getByTestId('comm-scene-popover').count()) > 0) {
        found = { x: envelope.x + dx, y: envelope.y + dy };
        break;
      }
    }
  }
  console.log('FOUND', JSON.stringify(found));
  expect(found).not.toBeNull();
});
