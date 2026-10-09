import { expect, test } from '@playwright/test';

interface VoiceHandle {
  recorded: string[];
  spoken: string[];
  speak(id: string): boolean;
  preload(): Promise<void>;
}

// With recordings in src/content/announcer-voice/, a recorded line must decode and play.
// With none (the default until Paul adds them), the announcer stays text-only and quiet.
test('announcer voice: recorded lines play; with none, nothing breaks', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./');
  await page.getByRole('button', { name: 'Play' }).click(); // a user gesture: audio unlocks
  const result = await page.evaluate(async () => {
    const v = (window as unknown as { __spellstickUi: { voice: VoiceHandle } }).__spellstickUi.voice;
    await v.preload();
    const id = v.recorded[0];
    return { recorded: v.recorded, played: id ? v.speak(id) : null, spoken: [...v.spoken] };
  });
  console.log(`announcer recordings: ${result.recorded.length}`);
  if (result.recorded.length > 0) {
    expect(result.played).toBe(true);
    expect(result.spoken).toContain(result.recorded[0]);
  } else {
    expect(result.spoken).toEqual([]);
  }
  expect(errors).toEqual([]);
});
