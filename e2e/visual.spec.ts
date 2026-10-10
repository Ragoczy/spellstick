import { expect, test, type Page } from '@playwright/test';
import { mockLoggedIn } from './auth';

// Screenshots of each screen for manual review.
type Handle = { fastForwardTo: (phase: string) => void; state: { phase: string } };
const ff = (page: Page, phase: string) =>
  page.evaluate((p) => {
    const h = (window as unknown as { __spellstick: Handle }).__spellstick;
    h.fastForwardTo(p);
    return h.state.phase;
  }, phase);

test('title, team select, faceoff, spells, period break', async ({ page }) => {
  test.setTimeout(60_000);
  await mockLoggedIn(page);
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'SPELLSTICK' })).toBeVisible();
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'test-results/title.png' });

  await page.getByRole('button', { name: 'Play' }).click();
  await page.locator('[data-team="willowmere"][data-side="home"]').click();
  await page.screenshot({ path: 'test-results/team-select.png' });
  await page.getByRole('button', { name: 'Start match' }).click();
  await page.getByRole('button', { name: 'Face off!' }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'test-results/faceoff.png' });

  // Live play (jump the whistle), then cast Quickstep, Bent Shot, and Hex Shove.
  await page.mouse.click(640, 380);
  await page.waitForTimeout(300);
  await page.keyboard.press('e');
  await page.keyboard.press('r');
  await page.keyboard.down('d');
  await page.waitForTimeout(500);
  await page.keyboard.up('d');
  await page.screenshot({ path: 'test-results/spells-active.png' });
  await page.keyboard.press('q');
  await page.waitForTimeout(60);
  await page.screenshot({ path: 'test-results/hex-shove.png' });

  expect(await ff(page, 'periodBreak')).toBe('periodBreak');
  await page.waitForTimeout(150);
  await page.screenshot({ path: 'test-results/period-break.png' });
});
