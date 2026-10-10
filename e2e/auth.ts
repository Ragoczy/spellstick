import type { Page } from '@playwright/test';

export const TEST_USER = {
  id: '80351110224678912',
  username: 'test-witch',
  avatar: null,
  role: 'player',
  // A data URL so the test never reaches Discord's CDN.
  avatarUrl:
    'data:image/svg+xml,' +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28"><circle cx="14" cy="14" r="14" fill="#5865f2"/></svg>',
    ),
};

/** `vite preview` has no auth API: answer /api/auth/me as a logged-in Discord user. */
export async function mockLoggedIn(page: Page): Promise<void> {
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: TEST_USER }));
}
