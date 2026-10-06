import { expect, test, type Page } from '@playwright/test';

interface DebugHandle {
  state: {
    tick: number;
    ball: { carrier: number | null };
    players: { team: number; pos: { x: number; y: number }; primaryTicks: number }[];
  };
  controlledId: number;
  eventCounts: Record<string, number>;
}

const debug = (page: Page) =>
  page.evaluate(() => {
    const h = (window as unknown as { __spellstick: DebugHandle }).__spellstick;
    return { state: h.state, controlledId: h.controlledId, eventCounts: { ...h.eventCounts } };
  });

/** World meters → canvas pixels (matches src/render/view.ts for the default rink). */
const toScreen = (p: { x: number; y: number }) => ({ x: 640 + p.x * 20, y: 380 + p.y * 20 });
const AWAY_GOAL = { x: 25, y: 0 };

async function until(page: Page, check: (d: Awaited<ReturnType<typeof debug>>) => boolean, ms: number) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (check(await debug(page))) return true;
    await page.waitForTimeout(50);
  }
  return false;
}

test('loads the game, scoops, passes to a teammate, and shoots', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('./');
  await expect(page.locator('canvas')).toBeVisible();
  await page.waitForFunction(
    () => (window as unknown as { __spellstick?: unknown }).__spellstick !== undefined,
  );

  // Report the sim rate, to diagnose slow CI browsers.
  const t0 = await debug(page);
  await page.waitForTimeout(1000);
  const t1 = await debug(page);
  console.log(`sim ticks per wall-clock second: ${t1.state.tick - t0.state.tick}`);

  // Run right onto the ball at center court.
  const goal = toScreen(AWAY_GOAL);
  await page.mouse.move(goal.x, goal.y);
  await page.keyboard.down('d');
  expect(await until(page, (d) => d.state.ball.carrier === 0, 5000)).toBe(true);
  await page.keyboard.up('d');

  // Tap-pass to the teammate.
  const mate = (await debug(page)).state.players[1]!.pos;
  const mateScreen = toScreen(mate);
  await page.mouse.move(mateScreen.x, mateScreen.y);
  await page.waitForTimeout(50);
  await page.mouse.down();
  await page.mouse.up();
  expect(await until(page, (d) => (d.eventCounts.pass ?? 0) >= 1, 2000)).toBe(true);

  // Our team gets it back (a catch, or the AI teammate scoops a drop) and control follows.
  expect(
    await until(
      page,
      (d) => d.state.ball.carrier !== null && d.state.players[d.state.ball.carrier]!.team === 0,
      6000,
    ),
  ).toBe(true);
  const after = await debug(page);
  expect(after.controlledId).toBe(after.state.ball.carrier);

  // Wind up and shoot at the goal.
  await page.mouse.move(goal.x, goal.y);
  // Wait on sim time, not wall time: a slow CI browser may run fewer ticks per second.
  await page.mouse.down();
  expect(await until(page, (d) => (d.state.players[d.controlledId]?.primaryTicks ?? 0) > 30, 8000)).toBe(
    true,
  );
  await page.mouse.up();
  expect(await until(page, (d) => (d.eventCounts.shot ?? 0) >= 1, 4000)).toBe(true);
  await page.waitForTimeout(60);
  await page.screenshot({ path: 'test-results/smoke.png' });

  expect(errors).toEqual([]);
});
