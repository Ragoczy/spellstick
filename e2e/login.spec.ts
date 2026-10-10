import { expect, test } from '@playwright/test';
import { TEST_USER, mockLoggedIn } from './auth';

// Login is required to play: the title shows "Log in with Discord" until /api/auth/me knows you.

test('logged out: no Play, and the login button goes to the auth API', async ({ page }) => {
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({ status: 401, json: { error: 'unauthenticated' } }),
  );
  await page.route('**/api/auth/login', (route) => route.fulfill({ status: 200, body: 'login reached' }));
  await page.goto('./');
  const login = page.getByRole('button', { name: 'Log in with Discord' });
  await expect(login).toBeVisible();
  await expect(login).toBeFocused();
  await expect(page.getByRole('button', { name: 'Play' })).toHaveCount(0);
  await expect(page.locator('.login-note')).toHaveText('Log in with your Discord account to play.');
  await expect(page.locator('.login-note')).toBeVisible();
  await page.screenshot({ path: 'test-results/title-logged-out.png' });
  await login.click();
  await expect(page).toHaveURL(/\/api\/auth\/login$/);
});

test('a failed login says so and tidies the address bar', async ({ page }) => {
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({ status: 401, json: { error: 'unauthenticated' } }),
  );
  await page.goto('./?login=failed');
  await expect(page.getByRole('alert')).toHaveText("Discord login didn't work. Try again.");
  await expect(page).toHaveURL(/\/$/);
});

test('no auth API in a production build: still locked, with a message', async ({ page }) => {
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({ status: 500, json: { error: 'auth_not_configured' } }),
  );
  await page.goto('./');
  await expect(page.getByRole('alert')).toContainText("Can't reach the login server");
  await expect(page.getByRole('button', { name: 'Play' })).toHaveCount(0);
});

test('logged in: name and avatar, Play, and Log out', async ({ page }) => {
  await mockLoggedIn(page);
  let loggedOut = false;
  await page.route('**/api/auth/logout', (route) => {
    loggedOut = route.request().method() === 'POST';
    return route.fulfill({ status: 204 });
  });
  await page.goto('./');
  const account = page.getByLabel('Logged in');
  await expect(account).toContainText(TEST_USER.username);
  await expect(account.locator('img.avatar')).toHaveAttribute('src', TEST_USER.avatarUrl);
  await expect(page.getByRole('button', { name: 'Play' })).toBeFocused();
  await page.screenshot({ path: 'test-results/title-logged-in.png' });

  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page.getByRole('button', { name: 'Log in with Discord' })).toBeVisible();
  expect(loggedOut).toBe(true);
});
