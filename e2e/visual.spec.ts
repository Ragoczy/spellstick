import { expect, test, type Page } from '@playwright/test';

// Screenshots of match-flow screens for manual review.
type Handle = { fastForwardTo: (phase: string) => void; state: { phase: string } };
const ff = (page: Page, phase: string) =>
  page.evaluate((p) => {
    const h = (window as unknown as { __spellstick: Handle }).__spellstick;
    h.fastForwardTo(p);
    return h.state.phase;
  }, phase);

test('faceoff, period break, and final screens', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('./');
  await page.waitForFunction(
    () => (window as unknown as { __spellstick?: unknown }).__spellstick !== undefined,
  );
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'test-results/faceoff.png' });

  expect(await ff(page, 'periodBreak')).toBe('periodBreak');
  await page.waitForTimeout(150);
  await page.screenshot({ path: 'test-results/period-break.png' });

  expect(await ff(page, 'final')).toBe('final');
  await page.waitForTimeout(150);
  await page.screenshot({ path: 'test-results/final.png' });
});
