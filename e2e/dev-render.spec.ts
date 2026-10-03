import { expect, test } from '@playwright/test';

/**
 * The cheapest possible guard against a white screen.
 *
 * It opens the running dev server, collects every uncaught page error and
 * console error, and asserts the app actually mounted. A stale dev server
 * serving an empty module fails here in ~1 second, with the browser error in
 * the output — instead of a blank page you have to debug by hand.
 *
 * Run it with the dev server up:
 *   npm run check:web
 */
test('the running dev server renders the app instead of a blank page', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') pageErrors.push(message.text());
  });

  await page.goto('/');

  // The React root is populated only when every module import resolved.
  await expect(page.locator('.app')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'AI Office' })).toBeVisible();

  expect(pageErrors, `browser errors:\n${pageErrors.join('\n')}`).toEqual([]);
});
