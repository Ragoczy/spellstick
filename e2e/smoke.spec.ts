import { expect, test } from '@playwright/test';

interface DebugHandle {
  state: { tick: number; period: number };
}

test('loads the game, runs the sim, and renders the rink', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('./');
  await expect(page.locator('canvas')).toBeVisible();
  await page.waitForFunction(
    () => (window as unknown as { __spellstick?: DebugHandle }).__spellstick !== undefined,
  );

  const tickAt = () =>
    page.evaluate(() => (window as unknown as { __spellstick: DebugHandle }).__spellstick.state.tick);
  const before = await tickAt();

  // A few seconds of input. M0 has no controllable player yet; this exercises the input path.
  await page.mouse.move(800, 400);
  for (const key of ['w', 'a', 's', 'd']) {
    await page.keyboard.down(key);
    await page.waitForTimeout(400);
    await page.keyboard.up(key);
  }

  const after = await tickAt();
  expect(after).toBeGreaterThan(before);

  await page.screenshot({ path: 'test-results/smoke.png' });
  expect(errors).toEqual([]);
});
