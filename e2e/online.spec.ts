import { expect, test, type Browser, type Page } from '@playwright/test';
import { signJwt } from '../server/auth/jwt';

/**
 * Online 1v1 (SPEC §11) against the real server (the second webServer in playwright.config.ts):
 * two people log in, meet in a room through its link, take the two seats, ready up, and play.
 */
const SERVER = 'http://localhost:4180';
const SECRET = 'e2e-online-only-secret';

interface OnlineDebug {
  online: { side: number | null; tick: number | null; serverTick: number | null } | null;
  controlledId: number;
  setup: { mode: string };
  state: { phase: string; players: { pos: { x: number; y: number } }[] };
}

/** A browser window logged in as this Discord user (a session cookie the test server accepts). */
async function player(browser: Browser, id: string, username: string): Promise<Page> {
  const now = Math.floor(Date.now() / 1000);
  const token = signJwt(
    { sub: id, username, avatar: null, role: 'player', iat: now, exp: now + 3600 },
    SECRET,
  );
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await context.addCookies([{ name: 'dsg_session', value: token, domain: 'localhost', path: '/' }]);
  return context.newPage();
}

const debug = (page: Page) =>
  page.evaluate(() => {
    const h = (window as unknown as { __spellstick: OnlineDebug }).__spellstick;
    return JSON.parse(
      JSON.stringify({ online: h.online, controlledId: h.controlledId, setup: h.setup, state: h.state }),
    ) as OnlineDebug;
  });

async function until(page: Page, check: (d: OnlineDebug) => boolean, ms: number): Promise<OnlineDebug> {
  const end = Date.now() + ms;
  for (;;) {
    const d = await debug(page);
    if (check(d)) return d;
    if (Date.now() > end) throw new Error(`timed out; last: ${JSON.stringify(d.online)} ${d.state.phase}`);
    await page.waitForTimeout(100);
  }
}

test('two players meet in a room, ready up, and play online', async ({ browser }) => {
  test.setTimeout(90_000);
  const ann = await player(browser, '100000000000000001', 'ann-online');
  const bea = await player(browser, '100000000000000002', 'bea-online');

  // Ann opens a room; its link takes Bea straight to the same lobby.
  await ann.goto(SERVER);
  await ann.getByRole('button', { name: 'Online 1v1' }).click();
  await expect(ann.locator('#lobby')).toBeVisible();
  const link = (await ann.locator('.room-link').textContent())!;
  expect(link).toMatch(/\/\?room=[a-z0-9]{6}$/);
  await bea.goto(link);
  await expect(bea.locator('#lobby')).toBeVisible();
  await expect(ann.locator('.watchers')).toContainText('bea-online');

  // A seat each, then both ready.
  await ann.locator('.seat').nth(0).getByRole('button', { name: 'Take this seat' }).click();
  await expect(bea.locator('.seat').nth(0)).toContainText('ann-online');
  await bea.locator('.seat').nth(1).getByRole('button', { name: 'Take this seat' }).click();
  await ann.getByRole('button', { name: "I'm ready" }).click();
  await expect(bea.locator('.seat').nth(0)).toContainText('Ready');
  await bea.screenshot({ path: 'test-results/online-lobby.png' });
  await bea.getByRole('button', { name: "I'm ready" }).click();
  await expect(ann.locator('.lobby-status')).toContainText('Face-off in');

  // The match: each screen plays its own side, a little ahead of the server.
  const a = await until(ann, (d) => d.setup.mode === 'online' && (d.online?.serverTick ?? 0) > 60, 20_000);
  const b = await until(bea, (d) => d.setup.mode === 'online' && (d.online?.serverTick ?? 0) > 60, 20_000);
  expect(a.online!.side).toBe(0);
  expect(b.online!.side).toBe(1);
  // A player's screen settles a few ticks ahead of the latest server state it has.
  await until(ann, (d) => d.online!.tick! >= d.online!.serverTick!, 10_000);
  await until(bea, (d) => d.online!.tick! >= d.online!.serverTick!, 10_000);

  // Past the faceoff, Ann runs up the rink (W). Her witch moves on her screen and on Bea's.
  const live = await until(ann, (d) => d.state.phase === 'live' && d.controlledId >= 0, 20_000);
  const id = live.controlledId;
  const y0 = live.state.players[id]!.pos.y;
  await ann.keyboard.down('w');
  await ann.waitForTimeout(2500);
  const mine = await debug(ann);
  const theirs = await debug(bea);
  await ann.keyboard.up('w');
  if (mine.controlledId === id) {
    expect(mine.state.players[id]!.pos.y, JSON.stringify(mine.online)).toBeLessThan(y0 - 1);
    expect(theirs.state.players[id]!.pos.y).toBeLessThan(y0 - 1);
  }

  await ann.screenshot({ path: 'test-results/online-ann.png' });
  await bea.screenshot({ path: 'test-results/online-bea.png' });

  // Esc: no pause online, just a menu; the match goes on behind it.
  await ann.keyboard.press('Escape');
  await expect(ann.getByRole('button', { name: 'Keep playing' })).toBeVisible();
  const before = (await debug(ann)).online!.serverTick!;
  await ann.waitForTimeout(500);
  expect((await debug(ann)).online!.serverTick!).toBeGreaterThan(before);
  await ann.getByRole('button', { name: 'Keep playing' }).click();
  await expect(ann.locator('#pause')).toHaveCount(0);

  // Ann leaves; the AI takes her side and Bea's lobby shows her as dropped.
  await ann.keyboard.press('Escape');
  await ann.getByRole('button', { name: 'Leave match' }).click();
  await expect(ann.locator('#title')).toBeVisible();
  const goneAt = (await debug(bea)).online!.serverTick!;
  await until(bea, (d) => (d.online?.serverTick ?? 0) > goneAt + 60, 10_000);
});
