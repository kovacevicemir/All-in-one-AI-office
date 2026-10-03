import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

/**
 * WebGL end-to-end coverage for the isometric 2D office.
 *
 * The default suite runs with WebGL disabled, so this file turns it back on
 * (SwiftShader) and drives the real scene: it opens the office, drags a bot on
 * the floor, and hovers the communication envelope. Deterministic floor
 * positions come from the layout, so the expected screen points are projected
 * with the same orthographic camera the scene uses.
 */
const API = 'http://127.0.0.1:4318';
const CONTROL = 'http://127.0.0.1:4319';

const MODEL = { providerId: 'fake', modelId: 'fake-1' };

// Must match `OfficeView` in apps/web/src/office/OfficeScene.tsx.
const CAMERA_POSITION: [number, number, number] = [18, 22, 24];
const CAMERA_TARGET: [number, number, number] = [0, 0.6, 0];
const CAMERA_ZOOM = 30;

type Vec3 = [number, number, number];

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface StoredPose {
  x: number;
  y: number;
  facing: number;
}

test.use({
  channel: 'chromium',
  launchOptions: {
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  },
});

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const normalize = (v: Vec3): Vec3 => {
  const length = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / length, v[1] / length, v[2] / length];
};

/**
 * Projects a world point to a client point with the scene's orthographic
 * camera. For an orthographic camera the projection is independent of the
 * camera translation, so only the orientation and the zoom matter.
 */
function projectToClient(point: Vec3, box: Box): { x: number; y: number } {
  const zAxis = normalize(sub(CAMERA_POSITION, CAMERA_TARGET));
  const xAxis = normalize(cross([0, 1, 0], zAxis));
  const yAxis = cross(zAxis, xAxis);
  const rel = sub(point, CAMERA_TARGET);
  const screenX = dot(xAxis, rel) * CAMERA_ZOOM + box.width / 2;
  const screenY = -dot(yAxis, rel) * CAMERA_ZOOM + box.height / 2;
  return { x: box.x + screenX, y: box.y + screenY };
}

async function seedOffice(request: APIRequestContext, names: string[]): Promise<string[]> {
  await request.post(`${CONTROL}/control/reset`);
  const department = await request.post(`${API}/api/departments`, { data: { name: 'Engineering' } });
  const departmentId = ((await department.json()) as { id: string }).id;
  const ids: string[] = [];
  for (const name of names) {
    const response = await request.post(`${API}/api/agents`, {
      data: { name, departmentId, workingDir: process.cwd(), harnessId: 'fake', model: MODEL },
    });
    expect(response.ok(), await response.text()).toBeTruthy();
    ids.push(((await response.json()) as { id: string }).id);
  }
  return ids;
}

async function openOffice(page: Page): Promise<{ canvas: ReturnType<Page['locator']>; box: Box }> {
  await page.goto('/');
  await expect(page.locator('.badge.connection-connected')).toHaveText('connected');
  await page.getByRole('button', { name: 'Office', exact: true }).click();
  const canvas = page.locator('.canvas-wrap canvas');
  await expect(canvas).toBeVisible();
  // The real scene must be rendering, not the no-WebGL fallback.
  await expect(page.getByText(/no WebGL/)).toHaveCount(0);
  // The layout styles arrive with the app bundle; wait until the floor canvas
  // has its real size before projecting world points onto it.
  await expect
    .poll(async () => (await canvas.boundingBox())?.height ?? 0)
    .toBeGreaterThan(300);
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  // Let the scene mount and the first frames settle before projecting onto it.
  await page.waitForTimeout(1000);
  return { canvas, box: box as Box };
}

/** The stored pose for one agent, from browser storage. */
async function readPose(page: Page, agentId: string): Promise<StoredPose | null> {
  return page.evaluate((id) => {
    const raw = localStorage.getItem('ai-office.poses.v1');
    if (raw === null) return null;
    const poses = JSON.parse(raw) as Record<string, StoredPose>;
    return poses[id] ?? null;
  }, agentId);
}

test('drags an agent around the isometric floor and keeps it facing the move', async ({
  page,
  request,
}) => {
  const [ada] = await seedOffice(request, ['Ada']);
  const { box } = await openOffice(page);

  await expect.poll(() => readPose(page, ada!)).not.toBeNull();
  const before = await readPose(page, ada!);

  // Ada is the first agent in the first zone: x = -1.7, y = -1.6.
  const start = projectToClient([-1.7, 0.85, -1.6], box);
  // A warm-up move makes R3F initialise its pointer state before the drag.
  await page.mouse.move(box.x + 5, box.y + 5);
  await page.mouse.move(start.x, start.y);
  await page.waitForTimeout(150);
  await page.mouse.down();
  for (let step = 1; step <= 14; step += 1) {
    await page.mouse.move(start.x + (140 * step) / 14, start.y - (60 * step) / 14);
  }
  await page.mouse.up();

  await expect.poll(() => readPose(page, ada!)).not.toEqual(before);
  const moved = await readPose(page, ada!);
  expect(moved?.x).not.toBeCloseTo(-1.7, 2);
  // The heading follows the drag, so it is no longer the default 0.
  expect(moved?.facing ?? 0).not.toBeCloseTo(0, 2);
});

test('shows a dashed floor link with a hover summary between two agents', async ({ page, request }) => {
  const [ada, grace] = await seedOffice(request, ['Ada', 'Grace']);
  await request.post(`${API}/api/tasks`, {
    data: {
      agentId: grace,
      title: 'Write the parser',
      instruction: 'write the parser',
      originAgentId: ada,
    },
  });
  const { canvas, box } = await openOffice(page);

  // The envelope sits at the midpoint of the two bots' floor anchors. Sweep a
  // raster around it so the pointer crosses the sprite (R3F fires pointer-over
  // on enter), rather than teleporting onto it.
  const envelope = projectToClient([-0.85, 0.95, -1.6], box);
  let found = false;
  for (let dx = -80; dx <= 80 && !found; dx += 16) {
    for (let dy = -80; dy <= 80; dy += 16) {
      await page.mouse.move(envelope.x + dx, envelope.y + dy);
      if ((await page.getByTestId('comm-scene-popover').count()) > 0) {
        found = true;
        break;
      }
    }
  }
  expect(found, 'hovering the floor envelope shows the summary popover').toBe(true);
  await expect(page.getByTestId('comm-scene-popover')).toContainText(
    'Ada → Grace: Write the parser',
  );

  // Zooming must never rotate the view under the floor or blank the canvas.
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, 400);
  await expect(canvas).toBeVisible();
});
