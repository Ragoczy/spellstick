import { expect, test, type Page } from '@playwright/test';

interface DebugState {
  tick: number;
  ball: { carrier: number | null; pos: { x: number; y: number } };
  players: { pos: { x: number; y: number } }[];
}

const debugState = (page: Page) =>
  page.evaluate(() => (window as unknown as { __spellstick: { state: DebugState } }).__spellstick.state);

test('loads the game, runs around, scoops and drops the ball', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('./');
  await expect(page.locator('canvas')).toBeVisible();
  await page.waitForFunction(
    () => (window as unknown as { __spellstick?: unknown }).__spellstick !== undefined,
  );
  const start = await debugState(page);
  expect(start.ball.carrier).toBeNull();

  // Aim right, then run right onto the ball at center court.
  await page.mouse.move(1100, 380);
  await page.keyboard.down('d');
  await page.waitForFunction(
    () =>
      (window as unknown as { __spellstick: { state: DebugState } }).__spellstick.state.ball.carrier === 0,
    undefined,
    { timeout: 5000 },
  );
  await page.keyboard.up('d');

  // Carry it up and around a bit.
  for (const key of ['w', 'a', 's']) {
    await page.keyboard.down(key);
    await page.waitForTimeout(350);
    await page.keyboard.up(key);
  }
  const carried = await debugState(page);
  expect(carried.ball.carrier).toBe(0);
  expect(carried.tick).toBeGreaterThan(start.tick);

  // Toss it toward the cursor; it should come loose.
  await page.keyboard.press('t');
  await page.waitForTimeout(150);
  const tossed = await debugState(page);
  expect(tossed.ball.carrier).toBeNull();

  await page.screenshot({ path: 'test-results/smoke.png' });
  expect(errors).toEqual([]);
});
