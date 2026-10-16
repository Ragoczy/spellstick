import type pg from 'pg';
import type { StoredPlayer } from '../../src/achievements/index.js';
import { ACHIEVEMENT_IDS, type AchievementId } from '../../src/content/badges.js';
import { SPELL_POOL, type RunnerSpell } from '../../src/sim/index.js';

/** Where players' records live (M14). Postgres in Azure; memory in tests and local play. */
export interface AchievementStore {
  get(id: string): Promise<StoredPlayer | null>;
  /** Creates or replaces the record. Achievements are only ever added. */
  put(player: StoredPlayer): Promise<void>;
  /** Deletes the record; false if there was none. */
  remove(id: string): Promise<boolean>;
}

export class MemoryStore implements AchievementStore {
  private readonly players = new Map<string, StoredPlayer>();

  get(id: string): Promise<StoredPlayer | null> {
    const p = this.players.get(id);
    return Promise.resolve(p ? structuredClone(p) : null);
  }

  put(player: StoredPlayer): Promise<void> {
    this.players.set(player.id, structuredClone(player));
    return Promise.resolve();
  }

  remove(id: string): Promise<boolean> {
    return Promise.resolve(this.players.delete(id));
  }
}

const isAchievement = (s: string): s is AchievementId => (ACHIEVEMENT_IDS as readonly string[]).includes(s);
const isSpell = (s: string): s is RunnerSpell => (SPELL_POOL as readonly string[]).includes(s);

export class PgStore implements AchievementStore {
  constructor(private readonly pool: pg.Pool) {}

  async get(id: string): Promise<StoredPlayer | null> {
    const p = await this.pool.query<{
      username: string;
      avatar_url: string;
      tier: number;
      matches: number;
      wins: number;
      goals: number;
      spells_cast: string[];
    }>(
      'select username, avatar_url, tier, matches, wins, goals, spells_cast from players where discord_id = $1',
      [id],
    );
    const row = p.rows[0];
    if (!row) return null;
    const a = await this.pool.query<{ achievement_id: string; unlocked_at: Date }>(
      'select achievement_id, unlocked_at from achievements where discord_id = $1 order by unlocked_at, achievement_id',
      [id],
    );
    const unlocked = a.rows.filter((r) => isAchievement(r.achievement_id));
    return {
      id,
      name: row.username,
      avatarUrl: row.avatar_url,
      tier: row.tier,
      career: {
        matches: row.matches,
        wins: row.wins,
        goals: row.goals,
        spellsCast: row.spells_cast.filter(isSpell),
        achievements: unlocked.map((r) => r.achievement_id as AchievementId),
      },
      unlockedAt: Object.fromEntries(unlocked.map((r) => [r.achievement_id, r.unlocked_at.toISOString()])),
    };
  }

  async put(p: StoredPlayer): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      await client.query(
        `insert into players (discord_id, username, avatar_url, tier, matches, wins, goals, spells_cast)
         values ($1, $2, $3, $4, $5, $6, $7, $8)
         on conflict (discord_id) do update set
           username = excluded.username, avatar_url = excluded.avatar_url, tier = excluded.tier,
           matches = excluded.matches, wins = excluded.wins, goals = excluded.goals,
           spells_cast = excluded.spells_cast, last_seen = now()`,
        [
          p.id,
          p.name,
          p.avatarUrl,
          p.tier,
          p.career.matches,
          p.career.wins,
          p.career.goals,
          p.career.spellsCast,
        ],
      );
      for (const id of p.career.achievements) {
        await client.query(
          `insert into achievements (discord_id, achievement_id, unlocked_at) values ($1, $2, $3)
           on conflict do nothing`,
          [p.id, id, p.unlockedAt[id] ?? new Date().toISOString()],
        );
      }
      await client.query('commit');
    } catch (err) {
      await client.query('rollback').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  async remove(id: string): Promise<boolean> {
    const r = await this.pool.query('delete from players where discord_id = $1', [id]);
    return (r.rowCount ?? 0) > 0;
  }
}
