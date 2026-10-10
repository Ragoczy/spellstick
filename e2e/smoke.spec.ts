import { expect, test, type Page } from '@playwright/test';
import { mockLoggedIn } from './auth';

interface DebugPlayer {
  team: number;
  role: string;
  pos: { x: number; y: number };
  primaryTicks: number;
  checkCooldown: number;
  quickstepTicks: number;
}
interface DebugHandle {
  state: {
    tick: number;
    phase: string;
    faceoff: { takers: [number, number]; whistled: boolean } | null;
    ball: {
      carrier: number | null;
      pos: { x: number; y: number };
      flight: { kind: string; by: number } | null;
    };
    players: DebugPlayer[];
  };
  controlledId: number;
  eventCounts: Record<string, number>;
  setup: { mode: string; home: string; away: string; difficulty: string };
  fastForwardTo(phase: string): void;
}

const debug = (page: Page) =>
  page.evaluate(() => {
    const h = (window as unknown as { __spellstick: DebugHandle }).__spellstick;
    return {
      state: JSON.parse(JSON.stringify(h.state)) as DebugHandle['state'],
      controlledId: h.controlledId,
      eventCounts: { ...h.eventCounts },
      setup: { ...h.setup },
    };
  });
type Debug = Awaited<ReturnType<typeof debug>>;

/** World meters → canvas pixels (matches src/render/view.ts for the default rink). */
const toScreen = (p: { x: number; y: number }) => ({ x: 640 + p.x * 20, y: 380 + p.y * 20 });
const AWAY_GOAL = { x: 25, y: 0 };

async function until(page: Page, check: (d: Debug) => boolean, ms: number) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (check(await debug(page))) return true;
    await page.waitForTimeout(50);
  }
  return false;
}

/** Holds the WASD keys that point from `from` toward `to`; releases the others. */
async function steerToward(
  page: Page,
  held: Set<string>,
  from: { x: number; y: number },
  to: { x: number; y: number },
) {
  const want = new Set<string>();
  if (to.x - from.x > 0.5) want.add('d');
  if (to.x - from.x < -0.5) want.add('a');
  if (to.y - from.y > 0.5) want.add('s');
  if (to.y - from.y < -0.5) want.add('w');
  for (const k of [...held]) {
    if (want.has(k)) continue;
    await page.keyboard.up(k);
    held.delete(k);
  }
  for (const k of want) {
    if (held.has(k)) continue;
    await page.keyboard.down(k);
    held.add(k);
  }
}

async function releaseAll(page: Page, held: Set<string>) {
  for (const k of held) await page.keyboard.up(k);
  held.clear();
}

test('a new player: title, team select, controls, a match, pause, results, back to title', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await mockLoggedIn(page);
  await page.goto('./');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByRole('heading', { name: 'SPELLSTICK' })).toBeVisible();
  await page.waitForFunction(
    () => (window as unknown as { __spellstick?: unknown }).__spellstick !== undefined,
  );
  expect((await debug(page)).setup.mode).toBe('demo'); // AI vs AI behind the title
  await expect(page.getByRole('region', { name: "What's new" }).locator('.change')).toHaveCount(3);

  // Title → team select: pick Hard, keep the default teams.
  await page.getByRole('button', { name: 'Play' }).click();
  await expect(page.getByRole('heading', { name: 'Choose your match' })).toBeVisible();
  await page.locator('[data-difficulty="hard"]').click();
  await page.getByRole('button', { name: 'Start match' }).click();

  // The one-screen controls card comes up before the first match.
  await expect(page.getByRole('heading', { name: 'How to play' })).toBeVisible();
  await page.screenshot({ path: 'test-results/controls-card.png' });
  await page.getByRole('button', { name: 'Face off!' }).click();

  const t0 = await debug(page);
  expect(t0.setup).toMatchObject({
    mode: 'play',
    home: 'wyverns',
    away: 'ichthyocentaurs',
    difficulty: 'hard',
  });
  expect(t0.state.phase).toBe('faceoff');
  expect(t0.state.faceoff!.whistled).toBe(false);
  const awayTaker = t0.state.faceoff!.takers[1];
  expect(t0.controlledId).toBe(t0.state.faceoff!.takers[0]);

  // Clicking right away jumps the whistle (it can't blow in the first second): a misfire,
  // so the away taker gets the ball. Deterministic, so it proves our click reaches the sim.
  await page.mouse.click(640, 380);
  expect(await until(page, (d) => (d.eventCounts.faceoffWin ?? 0) >= 1, 5000)).toBe(true);
  const afterDraw = await debug(page);
  expect(afterDraw.eventCounts.whistle ?? 0).toBe(0);
  expect(afterDraw.state.ball.carrier).toBe(awayTaker);

  await page.waitForTimeout(1000);
  const t1 = await debug(page);
  console.log(`sim ticks per wall-clock second: ${t1.state.tick - afterDraw.state.tick}`);

  // WASD moves the controlled player (waiting on sim progress; CI browsers can be slow).
  const meId = t1.controlledId;
  const me0 = t1.state.players[meId]!;
  await page.keyboard.down('s');
  const moved = await until(page, (d) => d.state.players[meId]!.pos.y > me0.pos.y + 0.5, 8000);
  await page.keyboard.up('s');
  expect(moved).toBe(true);

  // Right-click throws a check; E casts Quickstep.
  await page.mouse.move(640, 380);
  await page.mouse.click(640, 380, { button: 'right' });
  expect(await until(page, (d) => d.state.players[d.controlledId]!.checkCooldown > 0, 4000)).toBe(true);
  await page.keyboard.press('e');
  expect(await until(page, (d) => d.state.players[d.controlledId]!.quickstepTicks > 0, 4000)).toBe(true);

  // Space switches to a teammate (always a home runner).
  await page.keyboard.press('Space');
  const t3 = await debug(page);
  expect(t3.state.players[t3.controlledId]).toMatchObject({ team: 0, role: 'runner' });

  // Esc pauses: the sim stops until Resume.
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Paused' })).toBeVisible();
  const p0 = (await debug(page)).state.tick;
  await page.waitForTimeout(500);
  expect((await debug(page)).state.tick).toBe(p0);
  await page.getByRole('button', { name: 'Resume' }).click();
  expect(await until(page, (d) => d.state.tick > p0, 4000)).toBe(true);

  // Chase the ball until our team has it (control follows the carrier), then shoot.
  const held = new Set<string>();
  let shot = false;
  const startTick = (await debug(page)).state.tick;
  const budgetTicks = 40 * 60; // game time, not wall time
  let now = startTick;
  while (!shot && now - startTick < budgetTicks) {
    const d = await debug(page);
    now = d.state.tick;
    const me = d.state.players[d.controlledId]!;
    if (d.state.ball.carrier === d.controlledId) {
      await releaseAll(page, held);
      const goal = toScreen(AWAY_GOAL);
      await page.mouse.move(goal.x, goal.y);
      await page.mouse.down();
      const charged = await until(
        page,
        (x) => (x.state.players[x.controlledId]?.primaryTicks ?? 0) > 15,
        8000,
      );
      await page.mouse.up();
      if (charged) {
        const id = d.controlledId;
        shot = await until(
          page,
          (x) => x.state.ball.flight?.kind === 'shot' && x.state.ball.flight.by === id,
          2000,
        );
      }
    } else {
      await steerToward(page, held, me.pos, d.state.ball.pos);
      await page.waitForTimeout(80);
    }
  }
  await releaseAll(page, held);
  expect(shot).toBe(true);
  await page.waitForTimeout(80);
  await page.screenshot({ path: 'test-results/smoke.png' });

  // Skip to the final whistle: the results screen shows the score and stats.
  await page.evaluate(() =>
    (window as unknown as { __spellstick: DebugHandle }).__spellstick.fastForwardTo('final'),
  );
  await expect(page.getByRole('heading', { name: /^Final/ })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('cell', { name: 'Spells cast' })).toBeVisible();
  await page.screenshot({ path: 'test-results/results.png' });

  // Main menu → back to the title, with the demo running again.
  await page.getByRole('button', { name: 'Main menu' }).click();
  await expect(page.getByRole('heading', { name: 'SPELLSTICK' })).toBeVisible();
  expect((await debug(page)).setup.mode).toBe('demo');

  expect(errors).toEqual([]);
});
