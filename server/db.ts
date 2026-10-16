/**
 * The Postgres pool and its migrations (M14: achievements and tier roles). Copied from the card
 * game's server/db.ts and server/migrate.ts (Ragoczy/spellstick-cardgame).
 *
 * Locally: DATABASE_URL with a password. In Azure the server has passwords turned off, so the
 * app signs in with its managed identity: DB_HOST, DB_NAME, DB_USER (the identity's name) and
 * AZURE_CLIENT_ID. With none of these set there's no database, and badges are off.
 */
import pg from 'pg';
import { MIGRATIONS } from './migrations.js';

/** The Azure resource that Postgres tokens are issued for. */
const POSTGRES_RESOURCE = 'https://ossrdbms-aad.database.windows.net';

export type DatabaseConfig =
  { url: string } | { entra: { host: string; database: string; user: string; clientId?: string } };

/** The database settings from the environment, or null for none. */
export function databaseConfig(env: Record<string, string | undefined>): DatabaseConfig | null {
  if (env.DATABASE_URL) return { url: env.DATABASE_URL };
  if (env.DB_HOST && env.DB_NAME && env.DB_USER) {
    return {
      entra: { host: env.DB_HOST, database: env.DB_NAME, user: env.DB_USER, clientId: env.AZURE_CLIENT_ID },
    };
  }
  return null;
}

export function createPool(config: DatabaseConfig, options: { searchPath?: string } = {}): pg.Pool {
  // Lets tests run in their own schema without touching other data.
  const pgOptions = options.searchPath ? `-c search_path=${options.searchPath}` : undefined;
  if ('url' in config) return new pg.Pool({ connectionString: config.url, options: pgOptions, max: 4 });
  const e = config.entra;
  return new pg.Pool({
    host: e.host,
    database: e.database,
    user: e.user,
    password: managedIdentityToken(e.clientId),
    ssl: true,
    options: pgOptions,
    max: 4,
  });
}

/** Returns a function that gets (and caches) an Azure token from the container's identity endpoint. */
function managedIdentityToken(clientId: string | undefined): () => Promise<string> {
  let cached: { token: string; expiresAt: number } | null = null;
  return async () => {
    // Reuse the token until five minutes before it expires.
    if (cached && cached.expiresAt - Date.now() > 5 * 60_000) return cached.token;
    const endpoint = process.env.IDENTITY_ENDPOINT;
    const header = process.env.IDENTITY_HEADER;
    if (!endpoint || !header)
      throw new Error('No managed identity here. Set DATABASE_URL to use a password instead.');
    const url = new URL(endpoint);
    url.searchParams.set('resource', POSTGRES_RESOURCE);
    url.searchParams.set('api-version', '2019-08-01');
    if (clientId) url.searchParams.set('client_id', clientId);
    const res = await fetch(url, { headers: { 'X-IDENTITY-HEADER': header } });
    if (!res.ok) throw new Error(`Managed identity token request failed: ${res.status}`);
    const body = (await res.json()) as { access_token: string; expires_on: string };
    cached = { token: body.access_token, expiresAt: Number(body.expires_on) * 1000 };
    return cached.token;
  };
}

/**
 * Applies the migrations in server/migrations.ts that haven't run yet, in order, each in a
 * transaction, recording them in schema_migrations. Never edit one that has run in Azure: add
 * a new one instead.
 */
export async function migrate(pool: pg.Pool): Promise<string[]> {
  const client = await pool.connect();
  try {
    // One copy at a time per schema (a deploy can briefly run two).
    await client.query('select pg_advisory_lock(727272, hashtext(current_schema()))');
    await client.query(`create table if not exists schema_migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    )`);
    const done = new Set(
      (await client.query<{ name: string }>('select name from schema_migrations')).rows.map((r) => r.name),
    );
    const applied: string[] = [];
    for (const m of MIGRATIONS) {
      if (done.has(m.name)) continue;
      await client.query('begin');
      try {
        await client.query(m.sql);
        await client.query('insert into schema_migrations (name) values ($1)', [m.name]);
        await client.query('commit');
        applied.push(m.name);
      } catch (err) {
        await client.query('rollback');
        throw new Error(`Migration ${m.name} failed: ${(err as Error).message}`, { cause: err });
      }
    }
    return applied;
  } finally {
    await client.query('select pg_advisory_unlock(727272, hashtext(current_schema()))').catch(() => {});
    client.release();
  }
}
