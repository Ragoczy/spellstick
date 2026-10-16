/**
 * Starts the Spellstick server: the built game, Discord login, and online play, on PORT (default 8080).
 * In Azure, settings arrive as environment variables (the shared Discord ones are Key Vault
 * references). Locally, a git-ignored .env is read if present (`npm run env:pull` writes it).
 */
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeConfig } from '../src/sim/index.js';
import { roleSyncFromEnv } from './badges/roles.js';
import { Badges } from './badges/service.js';
import { PgStore } from './badges/store.js';
import { createPool, databaseConfig, migrate } from './db.js';
import { createHandler } from './http.js';
import { attachOnline } from './online.js';

const REQUIRED = ['DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET', 'DISCORD_GUILD_ID', 'SESSION_SECRET'];

if (existsSync('.env')) process.loadEnvFile('.env');
const missing = REQUIRED.filter((k) => !process.env[k]);
if (missing.length > 0) console.warn(`Login won't work until these are set: ${missing.join(', ')}`);

// Bundled to dist-server/main.js; the built game is next to it in dist/.
const distDir = process.env.DIST_DIR ?? resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const port = Number(process.env.PORT ?? 8080);

const log = (message: string) => console.warn(message);

/** Achievements and tier roles (M14): on when a database is set, else off and everything else works. */
async function startBadges(): Promise<Badges | null> {
  const db = databaseConfig(process.env);
  if (!db) {
    log('badges: off (no database set)');
    return null;
  }
  try {
    const pool = createPool(db);
    const applied = await migrate(pool);
    if (applied.length > 0) log(`badges: applied ${applied.join(', ')}`);
    return new Badges(new PgStore(pool), roleSyncFromEnv(process.env, { fetch, log }), makeConfig(), log);
  } catch (e) {
    log(`badges: off, the database failed (${(e as Error).message})`);
    return null;
  }
}
const badges = await startBadges();

const deps = {
  env: process.env,
  fetch,
  nowSeconds: () => Math.floor(Date.now() / 1000),
  log,
  afterSignIn: badges
    ? (user: { id: string; name: string; avatarUrl: string }, roles: string[] | null) =>
        void badges
          .signedIn(user, roles)
          .catch((e: unknown) => log(`badges: sign-in sync failed (${(e as Error).name})`))
    : undefined,
  forgetPlayer: badges
    ? (id: string) =>
        badges.deleteRecord(id).then(
          () => true,
          (e: unknown) => (log(`badges: deleting a record failed (${(e as Error).name})`), false),
        )
    : undefined,
};
const server = createServer(createHandler({ distDir, deps, badges }));
// Guests (no Discord login) are for local testing only; never set ONLINE_GUESTS in Azure.
const guests = process.env.ONLINE_GUESTS === 'true';
if (guests) console.warn('ONLINE_GUESTS is on: anyone can play online without logging in.');
const online = attachOnline(server, { deps, guests, badges });
server.listen(port, () => console.log(`Spellstick on http://localhost:${port} (serving ${distDir})`));

// Container Apps stops idle copies with SIGTERM. Online matches end there and then.
process.on('SIGTERM', () => {
  online.close();
  server.close(() => process.exit(0));
});
