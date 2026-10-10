import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  outputDir: 'test-results/playwright',
  timeout: 30_000,
  // The match tests are timing-sensitive (a faceoff whistle after 1 s of game time); one at a time in CI.
  workers: process.env.CI ? 1 : undefined,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173/',
    viewport: { width: 1280, height: 720 },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 } } },
  ],
  webServer: {
    command: 'npm run preview',
    url: 'http://localhost:4173/',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
