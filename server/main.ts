/**
 * Starts the Spellstick server: the built game plus Discord login, on PORT (default 8080).
 * In Azure, settings arrive as environment variables (the shared Discord ones are Key Vault
 * references). Locally, a git-ignored .env is read if present (`npm run env:pull` writes it).
 */
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHandler } from './http.js';

const REQUIRED = ['DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET', 'DISCORD_GUILD_ID', 'SESSION_SECRET'];

if (existsSync('.env')) process.loadEnvFile('.env');
const missing = REQUIRED.filter((k) => !process.env[k]);
if (missing.length > 0) console.warn(`Login won't work until these are set: ${missing.join(', ')}`);

// Compiled to dist-server/main.js; the built game is next to it in dist/.
const distDir = process.env.DIST_DIR ?? resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const port = Number(process.env.PORT ?? 8080);

const server = createServer(
  createHandler({
    distDir,
    deps: {
      env: process.env,
      fetch,
      nowSeconds: () => Math.floor(Date.now() / 1000),
      log: (message) => console.warn(message),
    },
  }),
);
server.listen(port, () => console.log(`Spellstick on http://localhost:${port} (serving ${distDir})`));

// Container Apps stops idle copies with SIGTERM.
process.on('SIGTERM', () => server.close(() => process.exit(0)));
