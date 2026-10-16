import { describe, expect, it } from 'vitest';
import type { MatchCredit, MatchRecord, StoredPlayer } from '../../src/achievements/index.js';
import { makeConfig } from '../../src/sim/index.js';
import { createPool, migrate } from '../db.js';
import { RoleSync, roleSyncFromEnv } from './roles.js';
import { Badges } from './service.js';
import { MemoryStore, PgStore, type AchievementStore } from './store.js';

const config = makeConfig();
const ANN = '111111111111111111';
const BEA = '222222222222222222';
const ROLES = ['901', '902', '903', '904', '905'].map((r) => r.padStart(18, '9'));

function credit(over: Partial<MatchCredit> = {}): MatchCredit {
  return {
    seats: [
      { goals: 0, boardSlams: 0, loosens: 0, spells: [] },
      { goals: 0, boardSlams: 0, loosens: 0, spells: [] },
    ],
    score: [0, 0],
    maxDeficit: [0, 0],
    overtime: false,
    ...over,
  };
}

function match(c: MatchCredit = credit(), more: Partial<MatchRecord> = {}): MatchRecord {
  const seat = (id: string, name: string) => ({
    id,
    name,
    avatarUrl: `${name}.png`,
    guest: false,
    connectedAtEnd: true,
  });
  return { final: true, seats: [seat(ANN, 'Ann'), seat(BEA, 'Bea')], credit: c, ...more };
}

/** A fake Discord: records role calls, answers with `status`. */
function fakeDiscord(status = 204) {
  const calls: string[] = [];
  const fetch = ((url: string, init: RequestInit) => {
    const m = /members\/(\d+)\/roles\/(\d+)$/.exec(url)!;
    calls.push(
      `${init.method} ${m[1] === ANN ? 'ann' : m[1] === BEA ? 'bea' : m[1]} ${ROLES.indexOf(m[2]!) + 1}`,
    );
    return Promise.resolve(new Response(null, { status }));
  }) as typeof globalThis.fetch;
  return { calls, fetch };
}

function setup(store: AchievementStore = new MemoryStore(), status = 204) {
  const d = fakeDiscord(status);
  const logs: string[] = [];
  const roles = new RoleSync({
    token: 't',
    guildId: '123456789',
    tierRoleIds: ROLES,
    fetch: d.fetch,
    log: (m) => logs.push(m),
  });
  let clock = Date.parse('2026-10-16T12:00:00Z');
  const badges = new Badges(
    store,
    roles,
    config,
    (m) => logs.push(m),
    () => new Date((clock += 60_000)),
  );
  return { badges, calls: d.calls, logs, store };
}

describe('badges on the server (M14)', () => {
  it('records a match for both players, gives tier 1 roles, and says what they earned', async () => {
    const s = setup();
    const news = await s.badges.record(match(credit({ score: [2, 1] })));
    expect(news).toEqual([
      { userId: ANN, unlocked: ['firstWhistle', 'firstWin'], tier: 1, promoted: true },
      { userId: BEA, unlocked: ['firstWhistle'], tier: 1, promoted: true },
    ]);
    expect(s.calls).toEqual(['PUT ann 1', 'PUT bea 1']);
    const ann = await s.badges.profile(ANN);
    expect(ann).toMatchObject({ name: 'Ann', avatarUrl: 'Ann.png', tier: 1, toNext: 1, matches: 1, wins: 1 });
    expect(ann!.achievements.map((a) => a.id)).toEqual(['firstWhistle', 'firstWin']);
    expect(ann!.achievements[0]!.unlockedAt).toMatch(/^2026-10-16T12:01/);
  });

  it('a promotion swaps the tier role; staying in a tier changes nothing in Discord', async () => {
    const s = setup();
    await s.badges.record(match(credit({ score: [1, 0] }))); // Ann: whistle, win, shutout → tier 2
    expect(s.calls).toContain('PUT ann 2');
    s.calls.length = 0;
    await s.badges.record(match(credit({ score: [1, 0] }))); // nothing new
    expect(s.calls).toEqual([]);
    const seats = credit().seats;
    seats[0].goals = 1;
    await s.badges.record(match(credit({ score: [1, 3], seats }))); // Ann: Off the Mark → 4, still tier 2
    expect(s.calls).toEqual([]);
    expect((await s.badges.profile(ANN))!.toNext).toBe(1);
  });

  it("doesn't record matches that don't count", async () => {
    const s = setup();
    expect(await s.badges.record(match(credit(), { final: false }))).toEqual([]);
    const m = match();
    m.seats[1] = { ...m.seats[1]!, guest: true };
    expect(await s.badges.record(m)).toEqual([]);
    expect(await s.badges.profile(ANN)).toBeNull();
  });

  it('deletes a record and takes the tier role away', async () => {
    const s = setup();
    await s.badges.record(match());
    s.calls.length = 0;
    expect(await s.badges.deleteRecord(ANN)).toBe(true);
    expect(s.calls).toEqual(['DELETE ann 1']);
    expect(await s.badges.profile(ANN)).toBeNull();
    expect(await s.badges.deleteRecord(ANN)).toBe(false);
  });

  it('at sign-in, puts the tier role right and refreshes the name; nobody new gets a record', async () => {
    const s = setup();
    await s.badges.record(match());
    s.calls.length = 0;
    await s.badges.signedIn({ id: ANN, name: 'Annie', avatarUrl: 'new.png' }, [ROLES[2]!, '42']);
    expect(s.calls).toEqual(['DELETE ann 3', 'PUT ann 1']);
    expect((await s.badges.profile(ANN))!.name).toBe('Annie');
    s.calls.length = 0;
    await s.badges.signedIn({ id: ANN, name: 'Annie', avatarUrl: 'new.png' }, [ROLES[0]!]);
    expect(s.calls).toEqual([]); // already right
    await s.badges.signedIn({ id: '333333333333333333', name: 'Cat', avatarUrl: '' }, []);
    expect(await s.store.get('333333333333333333')).toBeNull();
  });

  it('two matches ending together for one player both count', async () => {
    const s = setup();
    await Promise.all([s.badges.record(match()), s.badges.record(match())]);
    expect((await s.badges.profile(ANN))!.matches).toBe(2);
  });

  it('a Discord failure is logged and the record is still saved', async () => {
    const s = setup(new MemoryStore(), 403);
    const news = await s.badges.record(match());
    expect(news).toHaveLength(2);
    expect(s.logs.some((l) => l.includes('returned 403'))).toBe(true);
    expect(s.logs.join('\n')).not.toMatch(/\d{17}/); // no Discord ids in the log
    expect(await s.badges.profile(ANN)).not.toBeNull();
  });
});

describe('tier role settings (M14)', () => {
  const deps = { fetch, log: () => {} };
  it('off when unset or half-set, on with a token, the server, and five role ids', () => {
    expect(roleSyncFromEnv({}, deps)).toBeNull();
    expect(roleSyncFromEnv({ DISCORD_BOT_TOKEN: 'x', DISCORD_GUILD_ID: '123456789' }, deps)).toBeNull();
    expect(
      roleSyncFromEnv(
        { DISCORD_BOT_TOKEN: 'x', DISCORD_GUILD_ID: '123456789', DISCORD_TIER_ROLE_IDS: ROLES.join(',') },
        deps,
      ),
    ).toBeInstanceOf(RoleSync);
  });

  it('waits out a rate limit once', async () => {
    let n = 0;
    const waits: number[] = [];
    const roles = new RoleSync({
      token: 't',
      guildId: '123456789',
      tierRoleIds: ROLES,
      fetch: (() => {
        n++;
        return Promise.resolve(
          n === 1
            ? new Response(JSON.stringify({ retry_after: 0.25 }), { status: 429 })
            : new Response(null, { status: 204 }),
        );
      }) as typeof fetch,
      log: () => {},
      sleep: (ms) => (waits.push(ms), Promise.resolve()),
    });
    await roles.setTier(ANN, 1);
    expect(n).toBe(2);
    expect(waits).toEqual([250]);
  });
});

// Against a real Postgres when one is given (local: `docker run -p 5434:5432 -e POSTGRES_PASSWORD=pw postgres:16-alpine`
// and TEST_DATABASE_URL=postgres://postgres:pw@localhost:5434/postgres). Each run uses a fresh schema.
const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)('the Postgres store (M14)', () => {
  it('migrates, saves, reads back, adds achievements, and deletes', async () => {
    const schema = `t${Date.now()}`;
    const admin = createPool({ url: url! });
    await admin.query(`create schema ${schema}`);
    const pool = createPool({ url: url! }, { searchPath: schema });
    try {
      expect(await migrate(pool)).toEqual(['001_badges']);
      expect(await migrate(pool)).toEqual([]);
      const store = new PgStore(pool);
      const p: StoredPlayer = {
        id: ANN,
        name: 'Ann',
        avatarUrl: 'a.png',
        tier: 1,
        career: {
          matches: 1,
          wins: 1,
          goals: 2,
          spellsCast: ['blink', 'snare'],
          achievements: ['firstWhistle'],
        },
        unlockedAt: { firstWhistle: '2026-10-16T12:00:00.000Z' },
      };
      await store.put(p);
      expect(await store.get(ANN)).toEqual(p);
      const more: StoredPlayer = {
        ...p,
        name: 'Annie',
        tier: 2,
        career: { ...p.career, matches: 2, achievements: ['firstWhistle', 'shutout', 'firstWin'] },
        unlockedAt: {
          ...p.unlockedAt,
          shutout: '2026-10-16T13:00:00.000Z',
          firstWin: '2026-10-16T13:00:00.000Z',
        },
      };
      await store.put(more);
      const back = await store.get(ANN);
      expect(back).toMatchObject({ name: 'Annie', tier: 2 });
      expect(back!.career.achievements).toEqual(['firstWhistle', 'firstWin', 'shutout']);
      expect(back!.unlockedAt.shutout).toBe('2026-10-16T13:00:00.000Z');
      expect(await store.remove(ANN)).toBe(true);
      expect(await store.get(ANN)).toBeNull();
      expect(await store.remove(ANN)).toBe(false);
    } finally {
      await pool.end();
      await admin.query(`drop schema ${schema} cascade`);
      await admin.end();
    }
  });
});
