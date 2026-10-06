import { expect, test, type Page } from '@playwright/test';

interface DebugPlayer {
  team: number;
  role: string;
  pos: { x: number; y: number };
  primaryTicks: number;
  checkCooldown: number;
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
}

const debug = (page: Page) =>
  page.evaluate(() => {
    const h = (window as unknown as { __spellstick: DebugHandle }).__spellstick;
    return {
      state: JSON.parse(JSON.stringify(h.state)) as DebugHandle['state'],
      controlledId: h.controlledId,
      eventCounts: { ...h.eventCounts },
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

test('plays a 5v5 match: faceoff, move, check, switch, and shoot', async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('./');
  await expect(page.locator('canvas')).toBeVisible();
  await page.waitForFunction(
    () => (window as unknown as { __spellstick?: unknown }).__spellstick !== undefined,
  );

  // The match opens with a faceoff, and we're the home taker. Clicking right away jumps the
  // whistle (it can't blow in the first second): a misfire, so the away taker gets the ball.
  // That's deterministic, so it proves our click reaches the sim.
  const t0 = await debug(page);
  expect(t0.state.players.filter((p) => p.role === 'runner')).toHaveLength(8);
  expect(t0.state.players.filter((p) => p.role === 'goalie')).toHaveLength(2);
  expect(t0.state.phase).toBe('faceoff');
  expect(t0.state.faceoff!.whistled).toBe(false);
  const awayTaker = t0.state.faceoff!.takers[1];
  expect(t0.controlledId).toBe(t0.state.faceoff!.takers[0]);
  await page.mouse.click(640, 380);
  expect(await until(page, (d) => (d.eventCounts.faceoffWin ?? 0) >= 1, 5000)).toBe(true);
  const afterDraw = await debug(page);
  expect(afterDraw.eventCounts.whistle ?? 0).toBe(0);
  expect(afterDraw.state.ball.carrier).toBe(awayTaker);
  expect(afterDraw.state.phase).toBe('live');

  // Report the sim rate, to diagnose slow CI browsers.
  await page.waitForTimeout(1000);
  const t1 = await debug(page);
  console.log(`sim ticks per wall-clock second: ${t1.state.tick - afterDraw.state.tick}`);

  // WASD moves the controlled player.
  const me0 = afterDraw.state.players[afterDraw.controlledId]!;
  expect(me0.team).toBe(0);
  // Wait on sim progress rather than wall time (CI browsers can be very slow).
  await page.keyboard.down('s');
  const moved = await until(
    page,
    (d) => d.state.players[afterDraw.controlledId]!.pos.y > me0.pos.y + 0.5,
    8000,
  );
  await page.keyboard.up('s');
  expect(moved).toBe(true);

  // Right-click throws a check (it goes on cooldown).
  await page.mouse.move(640, 380);
  await page.mouse.click(640, 380, { button: 'right' });
  expect(await until(page, (d) => d.state.players[d.controlledId]!.checkCooldown > 0, 2000)).toBe(true);

  // Space switches to a teammate (always a home runner).
  await page.keyboard.press('Space');
  const t3 = await debug(page);
  expect(t3.state.players[t3.controlledId]).toMatchObject({ team: 0, role: 'runner' });

  // Chase the ball until our team has it (control follows the carrier), then shoot.
  const held = new Set<string>();
  let shot = false;
  // Budget by game time, not wall time: slow CI browsers run the sim well below real time.
  const startTick = (await debug(page)).state.tick;
  const budgetTicks = 30 * 60;
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
      // Wait on sim time, not wall time: a slow CI browser may run fewer ticks per second.
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

  expect(errors).toEqual([]);
});
