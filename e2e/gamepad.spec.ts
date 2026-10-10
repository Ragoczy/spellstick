import { expect, test, type Page } from '@playwright/test';

/**
 * M8: the whole flow on a gamepad, with no mouse or keyboard. The browser's Gamepad API is
 * replaced by a fake standard-mapping pad that the test presses buttons on.
 */

const BUTTON = {
  A: 0,
  B: 1,
  X: 2,
  Y: 3,
  LB: 4,
  RB: 5,
  LT: 6,
  RT: 7,
  BACK: 8,
  START: 9,
  UP: 12,
  DOWN: 13,
  LEFT: 14,
  RIGHT: 15,
} as const;
type Button = keyof typeof BUTTON;

interface FakePad {
  plugged: boolean;
  axes: number[];
  buttons: { pressed: boolean; value: number }[];
}

interface DebugState {
  tick: number;
  phase: string;
  faceoff: { takers: [number, number] } | null;
  ball: {
    carrier: number | null;
    pos: { x: number; y: number };
    flight: { kind: string; by: number } | null;
  };
  players: {
    team: number;
    role: string;
    pos: { x: number; y: number };
    primaryTicks: number;
    checkCooldown: number;
    quickstepTicks: number;
  }[];
}

const debug = (page: Page) =>
  page.evaluate(() => {
    const h = (
      window as unknown as {
        __spellstick: {
          state: unknown;
          controlledId: number;
          eventCounts: Record<string, number>;
          setup: unknown;
        };
      }
    ).__spellstick;
    return {
      state: JSON.parse(JSON.stringify(h.state)) as DebugState,
      controlledId: h.controlledId,
      eventCounts: { ...h.eventCounts },
      setup: { ...(h.setup as object) } as { mode: string; difficulty: string },
    };
  });
type Debug = Awaited<ReturnType<typeof debug>>;

async function until(page: Page, check: (d: Debug) => boolean, ms: number) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (check(await debug(page))) return true;
    await page.waitForTimeout(50);
  }
  return false;
}

const setButton = (page: Page, b: Button, down: boolean) =>
  page.evaluate(
    ([i, d]) => {
      (window as unknown as { __pad: FakePad }).__pad.buttons[i as number] = {
        pressed: d as boolean,
        value: d ? 1 : 0,
      };
    },
    [BUTTON[b], down] as const,
  );

const setAxes = (page: Page, axes: number[]) =>
  page.evaluate((a) => ((window as unknown as { __pad: FakePad }).__pad.axes = a), axes);

/** Press and release, holding long enough for a few frames to see it. */
async function press(page: Page, b: Button) {
  await setButton(page, b, true);
  await page.waitForTimeout(150);
  await setButton(page, b, false);
  await page.waitForTimeout(150);
}

const focusedText = (page: Page) => page.evaluate(() => document.activeElement?.textContent ?? '');

test('a whole match on a gamepad: menus, faceoff, move, check, spell, pause, shoot, results', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.addInitScript(() => {
    const pad: FakePad = {
      plugged: false,
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
    };
    (window as unknown as { __pad: FakePad }).__pad = pad;
    Object.defineProperty(navigator, 'getGamepads', {
      value: () => [
        pad.plugged
          ? {
              id: 'Fake pad',
              index: 0,
              connected: true,
              mapping: 'standard',
              axes: pad.axes,
              buttons: pad.buttons,
            }
          : null,
      ],
    });
  });
  await page.goto('./');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByRole('heading', { name: 'SPELLSTICK' })).toBeVisible();
  await page.waitForFunction(
    () => (window as unknown as { __spellstick?: unknown }).__spellstick !== undefined,
  );

  // Plug it in: the game says so.
  await page.evaluate(() => ((window as unknown as { __pad: FakePad }).__pad.plugged = true));
  await expect(page.locator('#pad-toast')).toHaveText('Controller connected');

  // Title: D-pad down to Controls, A opens it, B comes back.
  expect(await focusedText(page)).toBe('Play');
  await press(page, 'DOWN');
  expect(await focusedText(page)).toBe('Controls');
  await press(page, 'A');
  await expect(page.getByRole('heading', { name: 'How to play' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Controller' })).toBeVisible();
  await press(page, 'B');
  await expect(page.getByRole('heading', { name: 'SPELLSTICK' })).toBeVisible();

  // Play → team select. The focus starts on Start match; go up into the difficulty row and pick one.
  expect(await focusedText(page)).toBe('Play');
  await press(page, 'A');
  await expect(page.getByRole('heading', { name: 'Choose your match' })).toBeVisible();
  expect(await focusedText(page)).toBe('Start match');
  await press(page, 'UP');
  const picked = await page.evaluate(() => document.activeElement?.getAttribute('data-difficulty'));
  expect(picked).toBeTruthy();
  await press(page, 'A');
  await expect(page.locator(`[data-difficulty="${picked}"]`)).toHaveAttribute('aria-pressed', 'true');
  await press(page, 'DOWN');
  if ((await focusedText(page)) !== 'Start match') await press(page, 'RIGHT');
  expect(await focusedText(page)).toBe('Start match');
  await press(page, 'A');

  // The controls card, then the faceoff.
  await expect(page.getByRole('heading', { name: 'How to play' })).toBeVisible();
  await press(page, 'A');
  const t0 = await debug(page);
  expect(t0.setup).toMatchObject({ mode: 'play', difficulty: picked });
  expect(t0.state.phase).toBe('faceoff');
  const awayTaker = t0.state.faceoff!.takers[1];

  // Pulling RT right away jumps the whistle: a misfire, so the away taker wins the draw.
  // Deterministic, so it proves the trigger reaches the sim.
  await press(page, 'RT');
  expect(await until(page, (d) => (d.eventCounts.faceoffWin ?? 0) >= 1, 5000)).toBe(true);
  expect((await debug(page)).state.ball.carrier).toBe(awayTaker);

  // Left stick down moves the controlled player down.
  const t1 = await debug(page);
  const meId = t1.controlledId;
  await setAxes(page, [0, 1, 0, 0]);
  const moved = await until(
    page,
    (d) => d.state.players[meId]!.pos.y > t1.state.players[meId]!.pos.y + 0.5,
    8000,
  );
  await setAxes(page, [0, 0, 0, 0]);
  expect(moved).toBe(true);

  // LT checks; Y casts Quickstep (spell 2); RB switches to a teammate.
  await press(page, 'LT');
  expect(await until(page, (d) => d.state.players[d.controlledId]!.checkCooldown > 0, 4000)).toBe(true);
  await press(page, 'Y');
  expect(await until(page, (d) => d.state.players[d.controlledId]!.quickstepTicks > 0, 4000)).toBe(true);
  await page.screenshot({ path: 'test-results/gamepad-match.png' });
  await press(page, 'RB');
  const t3 = await debug(page);
  expect(t3.state.players[t3.controlledId]).toMatchObject({ team: 0, role: 'runner' });

  // Start pauses; A on Resume resumes (and that A doesn't fire a pass or shot).
  await press(page, 'START');
  await expect(page.getByRole('heading', { name: 'Paused' })).toBeVisible();
  const p0 = (await debug(page)).state.tick;
  await page.waitForTimeout(400);
  expect((await debug(page)).state.tick).toBe(p0);
  await press(page, 'A');
  await expect(page.getByRole('heading', { name: 'Paused' })).toBeHidden();
  expect(await until(page, (d) => d.state.tick > p0, 4000)).toBe(true);

  // Chase the ball with the left stick (checking the carrier) until we have it, then aim right with the right
  // stick (toward the goal we attack) and hold RT to shoot.
  let shot = false;
  const startTick = (await debug(page)).state.tick;
  let now = startTick;
  while (!shot && now - startTick < 60 * 60) {
    const d = await debug(page);
    now = d.state.tick;
    const me = d.state.players[d.controlledId]!;
    if (d.state.ball.carrier === d.controlledId) {
      await setAxes(page, [0, 0, 1, 0]);
      await setButton(page, 'RT', true);
      const charged = await until(
        page,
        (x) => (x.state.players[x.controlledId]?.primaryTicks ?? 0) > 15,
        8000,
      );
      await setButton(page, 'RT', false);
      if (charged) {
        const id = d.controlledId;
        shot = await until(
          page,
          (x) => x.state.ball.flight?.kind === 'shot' && x.state.ball.flight.by === id,
          2000,
        );
      }
      await setAxes(page, [0, 0, 0, 0]);
    } else {
      const dx = d.state.ball.pos.x - me.pos.x;
      const dy = d.state.ball.pos.y - me.pos.y;
      const len = Math.hypot(dx, dy) || 1;
      await setAxes(page, [dx / len, dy / len, 0, 0]);
      // Close to the carrier: check them (LT) to knock it loose.
      if (len < 1.6 && d.state.ball.carrier !== null && me.checkCooldown === 0) await press(page, 'LT');
      else await page.waitForTimeout(80);
    }
  }
  await setAxes(page, [0, 0, 0, 0]);
  expect(shot).toBe(true);

  // Skip to the final whistle; on the results, D-pad right to Main menu and A.
  await page.evaluate(() =>
    (window as unknown as { __spellstick: { fastForwardTo(p: string): void } }).__spellstick.fastForwardTo(
      'final',
    ),
  );
  await expect(page.getByRole('heading', { name: /^Final/ })).toBeVisible({ timeout: 15_000 });
  expect(await focusedText(page)).toBe('Rematch');
  await press(page, 'RIGHT');
  expect(await focusedText(page)).toBe('Main menu');
  await press(page, 'A');
  await expect(page.getByRole('heading', { name: 'SPELLSTICK' })).toBeVisible();

  expect(errors).toEqual([]);
});
