import { expect, test, type Page } from '@playwright/test';
import { mockLoggedIn } from './auth';

/** M10: pick three of the ten spells, then cast them in a match. */

interface Debug {
  tick: number;
  phase: string;
  controlledId: number;
  spells: string[];
  walls: number;
  images: number;
  eventCounts: Record<string, number>;
}

const debug = (page: Page) =>
  page.evaluate((): Debug => {
    const h = (
      window as unknown as {
        __spellstick: {
          state: {
            tick: number;
            phase: string;
            walls: unknown[];
            players: { spells: string[]; images: number }[];
          };
          controlledId: number;
          eventCounts: Record<string, number>;
        };
      }
    ).__spellstick;
    const me = h.state.players[h.controlledId];
    return {
      tick: h.state.tick,
      phase: h.state.phase,
      controlledId: h.controlledId,
      spells: [...(me?.spells ?? [])],
      walls: h.state.walls.length,
      images: me?.images ?? 0,
      eventCounts: { ...h.eventCounts },
    };
  });

async function until(page: Page, check: (d: Debug) => boolean, ms: number) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (check(await debug(page))) return true;
    await page.waitForTimeout(50);
  }
  return false;
}

test('pick Blink, Ice Wall, and Glamour Self, and cast all three on Q, E, R', async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await mockLoggedIn(page);
  await page.goto('./');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: 'Play' }).click();
  await page.getByRole('button', { name: 'Choose spells' }).click();

  // Drop the starting three, then pick in key order: Blink (Q), Ice Wall (E), Glamour Self (R).
  for (const s of ['hexShove', 'quickstep', 'bentShot']) await page.locator(`[data-spell="${s}"]`).click();
  await page.getByRole('button', { name: 'Start match' }).click();
  await expect(page.locator('.spell-hint')).toHaveText('Pick three spells.');
  for (const s of ['blink', 'iceWall', 'glamourSelf']) await page.locator(`[data-spell="${s}"]`).click();
  await expect(page.locator('.slot-pill').first()).toContainText('Blink');
  await page.getByRole('button', { name: 'Start match' }).click();
  await page.getByRole('button', { name: 'Face off!' }).click();
  expect((await debug(page)).spells).toEqual(['blink', 'iceWall', 'glamourSelf']);

  // Jump the whistle to get to live play, aim right, and cast.
  await page.mouse.click(640, 380);
  expect(await until(page, (d) => d.phase === 'live', 5000)).toBe(true);
  await page.mouse.move(1000, 380);
  // R (Glamour Self, 15 mana), then Q (Blink, 40) while moving, then E (Ice Wall, 50). That's
  // 105 of the 100 you start with, so the wall waits a few seconds for mana to come back.
  await page.keyboard.press('r');
  expect(await until(page, (d) => d.images > 0, 4000)).toBe(true);
  await page.keyboard.down('s');
  await page.keyboard.press('q');
  expect(await until(page, (d) => (d.eventCounts.blink ?? 0) >= 1, 4000)).toBe(true);
  await page.keyboard.up('s');
  const end = Date.now() + 20_000;
  while ((await debug(page)).walls < 1 && Date.now() < end) {
    await page.keyboard.press('e');
    await page.waitForTimeout(250);
  }
  expect((await debug(page)).walls).toBeGreaterThanOrEqual(1);
  await page.waitForTimeout(150);
  await page.screenshot({ path: 'test-results/spells-in-play.png' });

  // The choice is remembered for next time.
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('spellstick.selection') ?? '{}'));
  expect(saved.spells).toEqual(['blink', 'iceWall', 'glamourSelf']);
  expect(errors).toEqual([]);
});
