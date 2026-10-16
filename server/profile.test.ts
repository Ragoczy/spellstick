import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ProfileView } from '../src/achievements/index.js';
import { makeConfig } from '../src/sim/index.js';
import { SESSION_COOKIE } from './auth/auth.js';
import { signJwt } from './auth/jwt.js';
import { Badges } from './badges/service.js';
import { MemoryStore } from './badges/store.js';
import { createHandler } from './http.js';

const SECRET = 'profile-test-secret';
const ANN = '111111111111111111';
const BEA = '222222222222222222';

let server: Server;
let base: string;
const store = new MemoryStore();
const badges = new Badges(store, null, makeConfig(), () => {});

const cookie = (id: string) =>
  `${SESSION_COOKIE}=${signJwt({ sub: id, username: 'x', avatar: null, role: 'player', iat: 0, exp: 4e9 }, SECRET)}`;

beforeAll(async () => {
  server = createServer(
    createHandler({
      distDir: '.',
      deps: { env: { SESSION_SECRET: SECRET }, fetch, nowSeconds: () => 1000, log: () => {} },
      badges,
    }),
  );
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const seat = (id: string, name: string) => ({
    id,
    name,
    avatarUrl: '',
    guest: false,
    connectedAtEnd: true,
  });
  await badges.record({
    final: true,
    seats: [seat(ANN, 'Ann'), seat(BEA, 'Bea')],
    credit: {
      seats: [
        { goals: 1, boardSlams: 0, loosens: 0, spells: ['blink'] },
        { goals: 0, boardSlams: 0, loosens: 0, spells: [] },
      ],
      score: [1, 0],
      maxDeficit: [0, 1],
      overtime: false,
    },
  });
});

afterAll(() => server.close());

const call = (path: string, opts: { method?: string; as?: string; origin?: boolean } = {}) =>
  fetch(`${base}${path}`, {
    method: opts.method ?? 'GET',
    headers: {
      ...(opts.as ? { cookie: cookie(opts.as) } : {}),
      ...(opts.origin === false ? {} : { origin: base }),
    },
  });

describe('profile API (M14)', () => {
  it('needs you signed in', async () => {
    expect((await call('/api/profile/me')).status).toBe(401);
    expect((await call(`/api/profile/${ANN}`)).status).toBe(401);
  });

  it('shows your own profile and anyone else’s, spells as a count only', async () => {
    const mine = (await (await call('/api/profile/me', { as: ANN })).json()) as ProfileView;
    expect(mine).toMatchObject({
      id: ANN,
      name: 'Ann',
      tier: 2,
      matches: 1,
      wins: 1,
      goals: 1,
      spellsCast: 1,
      spellsTotal: 10,
    });
    expect(mine.achievements.map((a) => a.id)).toEqual(['firstWhistle', 'offTheMark', 'firstWin', 'shutout']);
    expect(JSON.stringify(mine)).not.toContain('blink');
    const hers = (await (await call(`/api/profile/${BEA}`, { as: ANN })).json()) as ProfileView;
    expect(hers).toMatchObject({ name: 'Bea', tier: 1 });
  });

  it('404 for someone with no record, or an id that isn’t one', async () => {
    expect((await call('/api/profile/333333333333333333', { as: ANN })).status).toBe(404);
    expect((await call('/api/profile/not-an-id', { as: ANN })).status).toBe(404);
  });

  it('deletes only your own record, and only from the game’s own pages', async () => {
    expect((await call(`/api/profile/${BEA}`, { method: 'DELETE', as: ANN })).status).toBe(405);
    expect((await call('/api/profile/me', { method: 'DELETE', as: BEA, origin: false })).status).toBe(403);
    const r = await call('/api/profile/me', { method: 'DELETE', as: BEA });
    expect(await r.json()).toEqual({ deleted: true });
    expect((await call(`/api/profile/${BEA}`, { as: ANN })).status).toBe(404);
    expect(await store.get(ANN)).not.toBeNull();
  });
});

describe('profile API with no database (M14)', () => {
  it('says profiles are unavailable', async () => {
    const off = createServer(
      createHandler({
        distDir: '.',
        deps: { env: { SESSION_SECRET: SECRET }, fetch, nowSeconds: () => 1000, log: () => {} },
      }),
    );
    await new Promise<void>((r) => off.listen(0, '127.0.0.1', r));
    const url = `http://127.0.0.1:${(off.address() as AddressInfo).port}/api/profile/me`;
    const r = await fetch(url, { headers: { cookie: cookie(ANN) } });
    expect(r.status).toBe(503);
    off.close();
  });
});
