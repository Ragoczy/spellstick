import { expect, test } from '@playwright/test';
import { TEST_USER, mockLoggedIn } from './auth';

// Settings: Report a problem (also in the title footer) and "Unlink my Discord account".

test('Report a problem: from the footer and from Settings, with the five categories', async ({ page }) => {
  await mockLoggedIn(page);
  await page.goto('./');
  await page.locator('.site-footer').getByRole('button', { name: 'Report a problem' }).click();
  const report = page.locator('#report');
  await expect(report.getByRole('heading', { name: 'Report a problem' })).toBeVisible();
  for (const c of [
    'Bug',
    'Player behavior / harassment',
    'Cheating or exploit',
    'Privacy / data request',
    'Other',
  ]) {
    await expect(report.getByRole('button', { name: c, exact: true })).toBeVisible();
  }
  // Logged in: the player is told their name and Discord ID go in the email.
  await expect(report).toContainText(
    `your player name (${TEST_USER.username}) and Discord user ID (${TEST_USER.id})`,
  );
  await page.screenshot({ path: 'test-results/report.png' });
  await report.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();

  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.locator('#settings')).toContainText(
    'To report a problem or request help with your data, contact admin@darkspace.press.',
  );
  await page.locator('#settings').getByRole('button', { name: 'Report a problem' }).click();
  await page.locator('#report').getByRole('button', { name: 'Back' }).click();
  await expect(page.locator('#settings')).toBeVisible();
});

test('logged out: Settings has Report a problem but no unlink', async ({ page }) => {
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({ status: 401, json: { error: 'unauthenticated' } }),
  );
  await page.goto('./');
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.locator('#settings').getByRole('button', { name: 'Report a problem' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Unlink my Discord account' })).toHaveCount(0);
});

test('Unlink my Discord account: typed confirmation, then the data is gone and the title says so', async ({
  page,
}) => {
  let unlinked = false;
  await page.route('**/api/auth/me', (route) =>
    unlinked
      ? route.fulfill({ status: 401, json: { error: 'unauthenticated' } })
      : route.fulfill({ json: TEST_USER }),
  );
  await page.route('**/api/auth/unlink', (route) => {
    unlinked = route.request().method() === 'POST';
    return route.fulfill({ json: { unlinked: true } });
  });
  await page.goto('./');
  await page.evaluate(() => {
    localStorage.setItem('spellstick.muted', '1');
    localStorage.setItem('spellstick.selection', '{"home":"x"}');
  });

  await page.getByRole('button', { name: 'Settings' }).click();
  // Settings opens on Back, never on the destructive button.
  await expect(page.locator('#settings').getByRole('button', { name: 'Back' })).toBeFocused();
  await page.screenshot({ path: 'test-results/settings.png' });
  await page.getByRole('button', { name: 'Unlink my Discord account' }).click();

  const dialog = page.getByRole('alertdialog', { name: 'Unlink your Discord account from Spellstick?' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('It only affects this game.');
  const go = dialog.getByRole('button', { name: 'Unlink and delete my game data' });
  await expect(go).toBeDisabled();
  await dialog.getByLabel('Type UNLINK to confirm').fill('unlin');
  await expect(go).toBeDisabled();
  await dialog.getByLabel('Type UNLINK to confirm').fill('UNLINK');
  await expect(go).toBeEnabled();
  await page.screenshot({ path: 'test-results/unlink.png' });

  // Cancel goes back without calling the server.
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.locator('#settings')).toBeVisible();
  expect(unlinked).toBe(false);

  await page.getByRole('button', { name: 'Unlink my Discord account' }).click();
  await page.getByLabel('Type UNLINK to confirm').fill('UNLINK');
  await page.getByRole('button', { name: 'Unlink and delete my game data' }).click();

  await expect(page.getByRole('alert')).toHaveText(
    'Your Spellstick data has been deleted and the game is disconnected from Discord. Your Discord account was not affected.',
  );
  expect(unlinked).toBe(true);
  await expect(page.getByRole('button', { name: 'Log in with Discord' })).toBeVisible();
  expect(
    await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('spellstick.'))),
  ).toEqual([]);
  await expect(page).toHaveURL(/\/$/);
});

test('Unlink: if the server fails, nothing is cleared and the dialog says so', async ({ page }) => {
  await mockLoggedIn(page);
  await page.route('**/api/auth/unlink', (route) => route.fulfill({ status: 500, json: { error: 'x' } }));
  await page.goto('./');
  await page.evaluate(() => localStorage.setItem('spellstick.muted', '1'));
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Unlink my Discord account' }).click();
  await page.getByLabel('Type UNLINK to confirm').fill('UNLINK');
  await page.getByRole('button', { name: 'Unlink and delete my game data' }).click();
  await expect(page.getByRole('alert')).toContainText('Nothing was deleted');
  expect(await page.evaluate(() => localStorage.getItem('spellstick.muted'))).toBe('1');
});
