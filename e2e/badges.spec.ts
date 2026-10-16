import { expect, test, type Page } from '@playwright/test';
import { TEST_USER, mockLoggedIn } from './auth';

// M14: the profile page (tier badge, ladder, achievements) from the title's account line and from
// a /profile/ link. `vite preview` has no API, so the profile answers are mocked.

const OTHER = '222222222222222222';

const view = (over: Record<string, unknown> = {}) => ({
  id: TEST_USER.id,
  name: TEST_USER.username,
  avatarUrl: TEST_USER.avatarUrl,
  tier: 2,
  toNext: 1,
  achievements: [
    { id: 'firstWhistle', unlockedAt: '2026-10-16T12:00:00.000Z' },
    { id: 'offTheMark', unlockedAt: '2026-10-16T12:00:00.000Z' },
    { id: 'firstWin', unlockedAt: '2026-10-16T12:30:00.000Z' },
    { id: 'shutout', unlockedAt: '2026-10-16T12:30:00.000Z' },
  ],
  matches: 3,
  wins: 2,
  goals: 4,
  spellsCast: 7,
  spellsTotal: 10,
  ...over,
});

async function mockProfiles(page: Page, deleted: { yes: boolean }) {
  await page.route('**/api/profile/**', (route) => {
    const req = route.request();
    if (req.method() === 'DELETE') {
      deleted.yes = true;
      return route.fulfill({ json: { deleted: true } });
    }
    if (req.url().endsWith('/me')) {
      return deleted.yes
        ? route.fulfill({ status: 404, json: { error: 'not_found' } })
        : route.fulfill({ json: view() });
    }
    if (req.url().endsWith(`/${OTHER}`)) {
      return route.fulfill({
        json: view({
          id: OTHER,
          name: 'golden-gwen',
          tier: 5,
          toNext: null,
          achievements: [
            'firstWhistle',
            'offTheMark',
            'firstWin',
            'hatTrick',
            'intoTheBoards',
            'lightFingers',
            'shutout',
            'comeback',
            'fullLibrary',
          ].map((id) => ({ id, unlockedAt: '2026-10-16T12:00:00.000Z' })),
          spellsCast: 10,
        }),
      });
    }
    return route.fulfill({ status: 404, json: { error: 'not_found' } });
  });
}

test('your profile: from your name on the title, tier, ladder, and all ten achievements', async ({
  page,
}) => {
  await mockLoggedIn(page);
  const deleted = { yes: false };
  await mockProfiles(page, deleted);
  await page.goto('./');
  await page.getByRole('button', { name: TEST_USER.username }).click();

  const profile = page.locator('#profile');
  await expect(profile.getByRole('heading', { name: TEST_USER.username })).toBeVisible();
  await expect(profile.locator('.profile-rank')).toHaveText('Varsity Witch');
  await expect(profile).toContainText('1 more achievement to First Line');
  await expect(profile).toContainText('3 online matches · 2 wins · 4 goals');
  await expect(profile.locator('.ach')).toHaveCount(10);
  await expect(profile.locator('.ach.earned')).toHaveCount(4);
  await expect(profile.locator('.tier-step.reached')).toHaveCount(2);
  await expect(profile.locator('.ach', { hasText: 'Full Library' })).toContainText('7 / 10 spells cast');
  await page.screenshot({ path: 'test-results/profile.png' });

  // Delete my record: asks first, then it's gone.
  await profile.getByRole('button', { name: 'Delete my record' }).click();
  await expect(profile).toContainText('Your tier role in Discord goes too.');
  await profile.locator('.delete-confirm').getByRole('button', { name: 'Delete my record' }).click();
  await expect(profile).toContainText('Your record is deleted.');
  expect(deleted.yes).toBe(true);
  await expect(profile.locator('.profile-rank')).toHaveText('No rank yet', { timeout: 5000 });

  await profile.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
});

test("someone else's profile from a link: no delete button, and Back tidies the address", async ({
  page,
}) => {
  await mockLoggedIn(page);
  await mockProfiles(page, { yes: false });
  await page.goto(`./profile/${OTHER}`);
  const profile = page.locator('#profile');
  await expect(profile.locator('.profile-rank')).toHaveText('Golden Stick');
  await expect(profile).toContainText('Top rank');
  await expect(profile.locator('.ach.earned')).toHaveCount(9);
  await expect(profile.getByRole('button', { name: 'Delete my record' })).toHaveCount(0);
  await page.screenshot({ path: 'test-results/profile-top.png' });
  await profile.getByRole('button', { name: 'Back' }).click();
  await expect(page).toHaveURL(/\/$/);
});
