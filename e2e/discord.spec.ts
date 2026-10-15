import { expect, test, type Page } from '@playwright/test';

// Launched as a Discord Activity (docs/discord-activity.md). Discord itself isn't here, so these
// check the page's side: the SDK loads only on the Activity's address, and with no Discord to
// answer, the title explains what to do instead of offering a login that can't work in a frame.

const ACTIVITY = 'http://1234.discordsays.com:4173';

/** Serves the Activity's address from `vite preview`, as Discord's proxy would. */
async function asActivity(page: Page): Promise<string[]> {
  const loaded: string[] = [];
  await page.route(`${ACTIVITY}/**`, (route) => {
    const url = route.request().url().replace(ACTIVITY, 'http://localhost:4173');
    loaded.push(new URL(url).pathname);
    return route.continue({ url });
  });
  return loaded;
}

test('on the normal site, a frame_id changes nothing and the Discord SDK never loads', async ({ page }) => {
  const scripts: string[] = [];
  page.on('request', (r) => scripts.push(r.url()));
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({ status: 401, json: { error: 'unauthenticated' } }),
  );
  await page.goto('./?frame_id=x&instance_id=x&platform=desktop');
  await expect(page.getByRole('button', { name: 'Log in with Discord' })).toBeVisible();
  expect(scripts.some((u) => u.includes('discordActivity'))).toBe(false);
});

test('inside Discord, with no Discord to answer: no login button, and the title says what to do', async ({
  page,
}) => {
  const loaded = await asActivity(page);
  const warnings: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'warning') warnings.push(m.text());
  });
  // No instance_id: the SDK refuses to start, as it would if Discord's launch went wrong.
  await page.goto(`${ACTIVITY}/?frame_id=x`);
  await expect(page.getByRole('alert')).toHaveText(
    "Couldn't connect to Discord, or the permission request was declined. Close Spellstick and launch it again.",
  );
  await expect(page.getByRole('button', { name: 'Log in with Discord' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Play' })).toHaveCount(0);
  expect(loaded.some((p) => p.includes('discordActivity'))).toBe(true);
  expect(warnings.join('\n')).toContain('Spellstick: Discord features are off.');
  await page.screenshot({ path: 'test-results/title-in-discord-failed.png' });
});

test('inside Discord, while Discord answers: the title says it is signing in', async ({ page }) => {
  await asActivity(page);
  // A full launch address: the SDK starts and waits for Discord, which never answers here.
  await page.goto(`${ACTIVITY}/?frame_id=x&instance_id=x&platform=desktop`);
  await expect(page.getByRole('button', { name: 'Signing in through Discord…' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Log in with Discord' })).toHaveCount(0);
});
