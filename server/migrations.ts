/**
 * Database changes, in order (server/db.ts runs them). Kept as code, not .sql files, so the
 * single-file server bundle carries them. Never edit one that has run in Azure: add a new one.
 */
export const MIGRATIONS: readonly { name: string; sql: string }[] = [
  {
    // M14: what's kept per player (docs/BADGES.md, "Privacy"), and nothing else.
    name: '001_badges',
    sql: `
      create table players (
        discord_id text primary key,
        username text not null,
        avatar_url text not null default '',
        tier smallint not null default 0,
        matches integer not null default 0,
        wins integer not null default 0,
        goals integer not null default 0,
        spells_cast text[] not null default '{}',
        first_seen timestamptz not null default now(),
        last_seen timestamptz not null default now()
      );
      create table achievements (
        discord_id text not null references players (discord_id) on delete cascade,
        achievement_id text not null,
        unlocked_at timestamptz not null default now(),
        primary key (discord_id, achievement_id)
      );
    `,
  },
];
