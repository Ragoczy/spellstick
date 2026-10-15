import { expect, test, type Page } from '@playwright/test';
import { mockLoggedIn } from './auth';

/** M9: the training ground and goal replays, played through the real UI. */

interface Debug {
  tick: number;
  phase: string;
  controlledId: number;
  me: { x: number; y: number };
  ball: { x: number; y: number };
  carrier: number | null;
  players: { team: number; role: string; pos: { x: number; y: number } }[];
  whistled: boolean;
  replaying: boolean;
  training: { drill: string; points: number; done: boolean } | null;
}

const debug = (page: Page) =>
  page.evaluate((): Debug => {
    const h = (
      window as unknown as {
        __spellstick: {
          state: {
            tick: number;
            phase: string;
            faceoff: { whistled: boolean } | null;
            ball: { pos: { x: number; y: number }; carrier: number | null };
            players: { team: number; role: string; pos: { x: number; y: number } }[];
          };
          controlledId: number;
          replaying: boolean;
          training: Debug['training'];
        };
      }
    ).__spellstick;
    const s = h.state;
    return {
      tick: s.tick,
      phase: s.phase,
      controlledId: h.controlledId,
      // Nobody is controlled in the title-screen demo.
      me: { ...(s.players[h.controlledId]?.pos ?? { x: 0, y: 0 }) },
      ball: { ...s.ball.pos },
      carrier: s.ball.carrier,
      players: s.players.map((p) => ({ team: p.team, role: p.role, pos: { ...p.pos } })),
      whistled: s.faceoff?.whistled ?? false,
      replaying: h.replaying,
      training: h.training ? { ...h.training } : null,
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

/** World meters → canvas pixels at 1280 × 720 (matches src/render/view.ts for the default rink). */
const toScreen = (p: { x: number; y: number }) => ({ x: 640 + p.x * 20, y: 380 + p.y * 20 });

/** Runs toward the loose ball with WASD until `done` (or `ms` passes). */
async function chaseBall(page: Page, done: (d: Debug) => boolean, ms: number) {
  return chase(page, (d) => d.ball, done, ms);
}

/**
 * Runs toward `target(d)` with WASD, calling `act` every step (to click, check, or cast),
 * until `done` (or `ms` passes).
 */
async function chase(
  page: Page,
  target: (d: Debug) => { x: number; y: number },
  done: (d: Debug) => boolean,
  ms: number,
  act: (d: Debug) => Promise<void> = async () => {},
) {
  const held = new Set<string>();
  const end = Date.now() + ms;
  let ok = false;
  while (Date.now() < end) {
    const d = await debug(page);
    if (done(d)) {
      ok = true;
      break;
    }
    const to = target(d);
    const want = new Set<string>();
    if (to.x - d.me.x > 0.3) want.add('d');
    if (to.x - d.me.x < -0.3) want.add('a');
    if (to.y - d.me.y > 0.3) want.add('s');
    if (to.y - d.me.y < -0.3) want.add('w');
    for (const k of [...held]) {
      if (!want.has(k)) {
        await page.keyboard.up(k);
        held.delete(k);
      }
    }
    for (const k of want) {
      if (!held.has(k)) {
        await page.keyboard.down(k);
        held.add(k);
      }
    }
    await act(d);
    await page.waitForTimeout(60);
  }
  for (const k of held) await page.keyboard.up(k);
  return ok;
}

async function openTitle(page: Page, errors: string[]) {
  page.on('pageerror', (e) => errors.push(e.message));
  await mockLoggedIn(page);
  await page.goto('./');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(
    () => (window as unknown as { __spellstick?: unknown }).__spellstick !== undefined,
  );
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
}

test('training: the lesson list, a whole lesson, the next one, skip, and quit', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  await openTitle(page, errors);

  // A new player (nothing finished yet) is pointed at Training; Play stays the main button.
  const nudge = page.locator('.training-nudge');
  await expect(nudge).toHaveText('New? Start here: seven short lessons.');
  await expect(page.getByRole('button', { name: 'Training' })).toHaveAttribute(
    'aria-describedby',
    'training-nudge',
  );
  await expect(page.getByRole('button', { name: 'Play' })).toBeFocused();
  await page.screenshot({ path: 'test-results/title-nudge.png' });

  await page.getByRole('button', { name: 'Training' }).click();
  await expect(page.getByRole('heading', { name: 'Training' })).toBeVisible();
  await expect(page.locator('#training .lesson-pick')).toHaveCount(7);
  await page.getByRole('button', { name: 'Start training' }).click();

  const card = page.locator('#lesson');
  await expect(card).toBeVisible();
  await expect(card).toContainText('Lesson 1 of 7');
  await expect(card).toContainText('Run and scoop');
  await expect(card).toContainText('W A S D');
  expect((await debug(page)).training).toMatchObject({ drill: 'scoop', points: 0 });

  // Scoop the first ball: a point, and the drill sets up the second ball elsewhere.
  expect(await chaseBall(page, (d) => (d.training?.points ?? 0) >= 1, 30_000)).toBe(true);
  await expect(card).toContainText('Nice!');
  await page.screenshot({ path: 'test-results/training.png' });
  const first = (await debug(page)).ball;
  expect(await until(page, (d) => d.ball.x !== first.x || d.ball.y !== first.y, 5000)).toBe(true);

  // The second ball finishes the lesson, and lesson 2 follows on its own.
  expect(await chaseBall(page, (d) => d.training?.done === true, 30_000)).toBe(true);
  await expect(card).toContainText('Lesson complete!');
  await expect(card).toContainText('Lesson 2 of 7', { timeout: 10_000 });
  await expect(card).toContainText('Complete 3 passes');

  // Esc: skip the lesson from the pause menu.
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Paused' })).toBeVisible();
  await page.getByRole('button', { name: 'Skip lesson' }).click();
  await expect(card).toContainText('Lesson 3 of 7');
  expect((await debug(page)).training).toMatchObject({ drill: 'shoot', points: 0 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'test-results/training-shoot.png' });

  // Quit training: back to the title, card gone, demo running.
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Quit training' }).click();
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
  await expect(card).toBeHidden();
  await expect(nudge).toHaveCount(0); // a lesson is finished: no more nudge
  expect((await debug(page)).training).toBeNull();

  // The finished lesson is remembered (the skipped one isn't), even after a reload, and
  // training continues from the first unfinished lesson.
  await page.reload();
  await page.getByRole('button', { name: 'Training' }).click();
  await expect(page.getByRole('button', { name: '1. Run and scoop (done)' })).toBeVisible();
  await expect(page.getByRole('button', { name: '2. Pass', exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/training-list.png' });
  await page.getByRole('button', { name: 'Continue training' }).click();
  await expect(card).toContainText('Lesson 2 of 7');
  expect(errors).toEqual([]);
});

test('goal replays: a goal replays in slow motion, the sim waits, and a click skips it', async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  await openTitle(page, errors);

  // Team select shows each team's style.
  await page.getByRole('button', { name: 'Play' }).click();
  await expect(page.locator('#team-select')).toContainText('Hit hard and carry the ball');
  await page.getByRole('button', { name: 'Choose spells' }).click();
  await page.getByRole('button', { name: 'Start match' }).click();
  await page.getByRole('button', { name: 'Face off!' }).click();
  expect(await until(page, (d) => d.phase === 'faceoff', 5000)).toBe(true);

  const started = await page.evaluate(() =>
    (
      window as unknown as { __spellstick: { fastForwardToReplay(): boolean } }
    ).__spellstick.fastForwardToReplay(),
  );
  expect(started).toBe(true);
  await page.waitForTimeout(700);
  await page.screenshot({ path: 'test-results/replay.png' });
  const during = await debug(page);
  expect(during.replaying).toBe(true);
  expect(during.phase).toBe('goalPause');
  await page.waitForTimeout(500);
  expect((await debug(page)).tick).toBe(during.tick); // the sim waits

  await page.mouse.click(640, 400);
  expect(await until(page, (d) => !d.replaying, 3000)).toBe(true);
  // Play goes on: the rest of the goal pause, then the faceoff.
  expect(await until(page, (d) => d.phase === 'faceoff', 8000)).toBe(true);
  expect(errors).toEqual([]);
});

test('training: every lesson can be finished with keyboard and mouse', async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  await openTitle(page, errors);
  await page.getByRole('button', { name: 'Training' }).click();
  await page.getByRole('button', { name: 'Start training' }).click();
  const card = page.locator('#lesson');
  const lessonDone = (d: Debug) => d.training?.done === true;
  const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
  const goalCorner = (d: Debug) => ({ x: 25, y: d.me.y > 0 ? 0.6 : -0.6 });
  /** Waits for the next lesson to start, then for its drill to be set up and live. */
  const next = async (n: number) => {
    await expect(card).toContainText(`Lesson ${n} of 7`, { timeout: 10_000 });
  };
  /** Holds the button `ms` with the mouse on `aim`. */
  const shoot = async (aim: { x: number; y: number }, ms = 800) => {
    const at = toScreen(aim);
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    await page.waitForTimeout(ms);
    await page.mouse.up();
  };

  // 1. Run and scoop.
  expect(await chaseBall(page, lessonDone, 60_000)).toBe(true);

  // 2. Pass: aim at a teammate and tap; run down a loose ball if a pass goes astray.
  await next(2);
  expect(
    await chase(
      page,
      (d) => (d.carrier === null ? d.ball : d.me),
      lessonDone,
      90_000,
      async (d) => {
        if (d.carrier !== d.controlledId) return;
        const mate = d.players.find((p, i) => p.team === 0 && i !== d.controlledId)!;
        const at = toScreen(mate.pos);
        await page.mouse.move(at.x, at.y);
        await page.mouse.click(at.x, at.y);
        await page.waitForTimeout(1200);
      },
    ),
  ).toBe(true);

  // 3. Shoot, and 4. Bent Shot (R first): hold and release at a corner until it's done.
  for (const [n, bent] of [
    [3, false],
    [4, true],
  ] as const) {
    await next(n);
    const end = Date.now() + 90_000;
    while (!lessonDone(await debug(page)) && Date.now() < end) {
      const d = await debug(page);
      if (d.phase !== 'live' || d.carrier !== d.controlledId) {
        await page.waitForTimeout(150);
        continue;
      }
      if (bent) {
        await page.keyboard.press('r');
        await page.waitForTimeout(100);
      }
      await shoot(goalCorner(d));
      await page.waitForTimeout(1600); // the result, then the drill sets up again
    }
    expect(lessonDone(await debug(page))).toBe(true);
  }

  // 5. Body check: run at the carrier and right-click up close.
  await next(5);
  const carrierPos = (d: Debug) => d.players.find((p) => p.team === 1)!.pos;
  expect(
    await chase(page, carrierPos, lessonDone, 60_000, async (d) => {
      const them = carrierPos(d);
      if (dist(d.me, them) < 1.8) {
        const at = toScreen(them);
        await page.mouse.click(at.x, at.y, { button: 'right' });
      }
    }),
  ).toBe(true);

  // 6. Hex Shove: get close, point the stick at the carrier, press Q.
  await next(6);
  expect(
    await chase(page, carrierPos, lessonDone, 60_000, async (d) => {
      const them = carrierPos(d);
      const at = toScreen(them);
      await page.mouse.move(at.x, at.y);
      if (dist(d.me, them) < 2.2) await page.keyboard.press('q');
    }),
  ).toBe(true);

  // 7. Faceoff: click the moment the whistle blows.
  await next(7);
  const foEnd = Date.now() + 60_000;
  while (!lessonDone(await debug(page)) && Date.now() < foEnd) {
    const d = await debug(page);
    if (d.phase === 'faceoff' && d.whistled) await page.mouse.click(640, 380);
    else await page.waitForTimeout(16);
  }
  expect(lessonDone(await debug(page))).toBe(true);

  // Done: the last screen offers a match.
  await expect(page.getByRole('heading', { name: 'Training complete' })).toBeVisible({ timeout: 10_000 });
  await page.screenshot({ path: 'test-results/training-done.png' });
  await page.getByRole('button', { name: 'Play a match' }).click();
  await expect(page.getByRole('heading', { name: 'Choose your match' })).toBeVisible();
  expect(errors).toEqual([]);
});
