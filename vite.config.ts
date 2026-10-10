import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';

function buildId(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return 'dev';
  }
}

// Azure Static Web Apps serves the game at the site root (https://spellstick.games.darkspace.press/).
export default defineConfig({
  base: '/',
  define: {
    __BUILD_ID__: JSON.stringify(buildId()),
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        manualChunks: (id) => (id.includes('node_modules/phaser') ? 'phaser' : undefined),
      },
    },
  },
});
