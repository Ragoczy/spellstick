import { describe, expect, it } from 'vitest';
import {
  SESSION_COOKIE,
  activityOrigin,
  activitySignIn,
  STATE_COOKIE,
  avatarUrl,
  callback,
  cookieDomainFor,
  login,
  logout,
  me,
  parseCookies,
  requestOrigin,
  unlink,
  unlinkAuditLine,
  type AuthDeps,
  type AuthRequest,
  type AuthResponse,
} from './auth.js';
import { signJwt, verifyJwt } from './jwt.js';

const NOW = 1_800_000_000;
const SECRET = 'test-session-secret-that-is-long-enough-0123456789';
const ENV = {
  DISCORD_CLIENT_ID: '1234',
  DISCORD_CLIENT_SECRET: 'client-secret',
  SESSION_SECRET: SECRET,
  DISCORD_GUILD_ID: '900',
  DISCORD_PLAYER_ROLE_IDS: '501',
  DISCORD_MODERATOR_ROLE_IDS: '502',
  DISCORD_ADMIN_ROLE_IDS: '503',
  ADMIN_DISCORD_IDS: '777',
};
const MEMBER_URL = 'https://discord.com/api/v10/users/@me/guilds/900/member';
const AZURE = 'https://ca-game-spellstick.proudbush-0a90b692.eastus2.azurecontainerapps.io';
const CUSTOM = 'https://spellstick.games.darkspace.press';

function req(url: string, headers: Record<string, string> = {}): AuthRequest {
  const h = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return { url, headers: { get: (n) => h.get(n.toLowerCase()) ?? null } };
}

/** A fake Discord: records the calls and answers the token exchange, /users/@me, and the server member lookup. */
function fakeDiscord(
  over: { token?: Response; user?: Response; member?: Response } = {},
  user: object = { id: '80351110224678912', username: 'nelly', avatar: '8342729096ea3675442027381ff50dfe' },
) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const f = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.endsWith('/oauth2/token'))
      return over.token ?? Response.json({ access_token: 'discord-access', token_type: 'Bearer' });
    if (url.endsWith('/users/@me')) return over.user ?? Response.json(user);
    if (url === MEMBER_URL) return over.member ?? Response.json({ roles: ['111', '501'] });
    return new Response('nope', { status: 404 });
  }) as typeof fetch;
  return { fetch: f, calls };
}

function deps(over: Partial<AuthDeps> = {}): AuthDeps & { logs: string[] } {
  const logs: string[] = [];
  return {
    env: ENV,
    fetch: fakeDiscord().fetch,
    nowSeconds: () => NOW,
    log: (m) => logs.push(m),
    logs,
    ...over,
  };
}

const cookie = (r: AuthResponse, name: string) => r.cookies?.find((c) => c.name === name);

describe('JWT (HS256)', () => {
  const claims = { sub: '1', username: 'nelly', avatar: null, role: 'player', iat: NOW, exp: NOW + 60 };

  it('round-trips and checks expiry', () => {
    const t = signJwt(claims, SECRET);
    expect(t.split('.')).toHaveLength(3);
    expect(verifyJwt(t, SECRET, NOW)).toEqual(claims);
    expect(verifyJwt(t, SECRET, NOW + 60)).toBeNull();
  });

  it('rejects a wrong secret, a tampered payload, and alg none', () => {
    const t = signJwt(claims, SECRET);
    expect(verifyJwt(t, 'another-secret', NOW)).toBeNull();
    const [h, , s] = t.split('.');
    const forged = Buffer.from(JSON.stringify({ ...claims, sub: '2' })).toString('base64url');
    expect(verifyJwt(`${h}.${forged}.${s}`, SECRET, NOW)).toBeNull();
    const none = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    expect(verifyJwt(`${none}.${t.split('.')[1]}.`, SECRET, NOW)).toBeNull();
    expect(verifyJwt('garbage', SECRET, NOW)).toBeNull();
  });
});

describe('origin and cookie domain', () => {
  it('takes the origin from the public URL of the request', () => {
    expect(requestOrigin(req(`${CUSTOM}/api/auth/login?x=1`))).toBe(CUSTOM);
    expect(requestOrigin(req('http://localhost:8080/api/auth/login'))).toBe('http://localhost:8080');
  });

  it('shares the cookie across *.games.darkspace.press and is host-only elsewhere', () => {
    expect(cookieDomainFor(CUSTOM)).toBe('.games.darkspace.press');
    expect(cookieDomainFor('https://games.darkspace.press')).toBe('.games.darkspace.press');
    expect(cookieDomainFor(AZURE)).toBeUndefined();
    expect(cookieDomainFor('http://localhost:4280')).toBeUndefined();
    expect(cookieDomainFor('https://evilgames.darkspace.press')).toBeUndefined();
  });

  it('parses cookie headers', () => {
    const c = parseCookies('a=1; dsg_session=x.y.z; b=2=3');
    expect(c.get('dsg_session')).toBe('x.y.z');
    expect(c.get('b')).toBe('2=3');
    expect(parseCookies(null).size).toBe(0);
  });

  it('builds avatar URLs, including the default avatar', () => {
    expect(avatarUrl('80351110224678912', 'abc')).toBe(
      'https://cdn.discordapp.com/avatars/80351110224678912/abc.png?size=64',
    );
    expect(avatarUrl('80351110224678912', 'a_abc')).toContain('.gif');
    expect(avatarUrl('80351110224678912', null)).toMatch(/embed\/avatars\/[0-5]\.png$/);
  });
});

describe('GET /api/auth/login', () => {
  it('redirects to Discord asking for identity and server roles, with a random state and the callback on this origin', () => {
    const r = login(req(`${AZURE}/api/auth/login`), deps());
    expect(r.status).toBe(302);
    const to = new URL(r.headers!.Location!);
    expect(to.origin + to.pathname).toBe('https://discord.com/oauth2/authorize');
    expect(to.searchParams.get('response_type')).toBe('code');
    expect(to.searchParams.get('scope')).toBe('identify guilds.members.read');
    expect(to.searchParams.get('prompt')).toBe('none');
    expect(to.searchParams.get('client_id')).toBe('1234');
    expect(to.searchParams.get('redirect_uri')).toBe(`${AZURE}/api/auth/callback`);
    const state = to.searchParams.get('state')!;
    expect(state.length).toBeGreaterThanOrEqual(40);
    const c = cookie(r, STATE_COOKIE)!;
    expect(c).toMatchObject({ value: state, httpOnly: true, secure: true, sameSite: 'Lax', maxAge: 600 });
    expect(c.domain).toBeUndefined();
    expect(login(req(`${AZURE}/api/auth/login`), deps()).headers!.Location).not.toBe(r.headers!.Location);
  });

  it('is a 500 (and says which setting) when the client id is missing', () => {
    const d = deps({ env: {} });
    expect(login(req(`${AZURE}/api/auth/login`), d).status).toBe(500);
    expect(d.logs.join()).toContain('DISCORD_CLIENT_ID');
  });
});

describe('GET /api/auth/callback', () => {
  const cb = (origin: string, state: string, cookieState: string | null, d = deps()) =>
    callback(
      req(
        `${origin}/api/auth/callback?code=the-code&state=${state}`,
        cookieState ? { cookie: `${STATE_COOKIE}=${cookieState}` } : {},
      ),
      d,
    );

  it('exchanges the code server-side, looks up the user and their roles, and sets a 30-day session cookie', async () => {
    const discord = fakeDiscord();
    const d = deps({ fetch: discord.fetch });
    const r = await cb(AZURE, 'abc', 'abc', d);
    expect(r.status).toBe(302);
    expect(r.headers!.Location).toBe('/');

    const [token, user, member] = discord.calls;
    expect(token!.url).toBe('https://discord.com/api/v10/oauth2/token');
    const form = new URLSearchParams(String(token!.init!.body));
    expect(Object.fromEntries(form)).toEqual({
      grant_type: 'authorization_code',
      code: 'the-code',
      redirect_uri: `${AZURE}/api/auth/callback`,
    });
    const basic = (token!.init!.headers as Record<string, string>).Authorization!;
    expect(Buffer.from(basic.replace(/^Basic /, ''), 'base64').toString()).toBe('1234:client-secret');
    expect(user!.url).toBe('https://discord.com/api/v10/users/@me');
    expect((user!.init!.headers as Record<string, string>).Authorization).toBe('Bearer discord-access');
    expect(member!.url).toBe(MEMBER_URL);
    expect((member!.init!.headers as Record<string, string>).Authorization).toBe('Bearer discord-access');
    expect(discord.calls).toHaveLength(3);

    const s = cookie(r, SESSION_COOKIE)!;
    expect(s).toMatchObject({ path: '/', httpOnly: true, secure: true, sameSite: 'Lax', maxAge: 30 * 86400 });
    expect(s.domain).toBeUndefined();
    expect(verifyJwt(s.value, SECRET, NOW)).toEqual({
      sub: '80351110224678912',
      username: 'nelly',
      avatar: '8342729096ea3675442027381ff50dfe',
      role: 'player',
      iat: NOW,
      exp: NOW + 30 * 86400,
    });
    expect(cookie(r, STATE_COOKIE)!.maxAge).toBe(0);
    expect(d.logs).toEqual([]);
  });

  it('sets Domain=.games.darkspace.press on the custom domain', async () => {
    const r = await cb(CUSTOM, 'abc', 'abc');
    expect(cookie(r, SESSION_COOKIE)!.domain).toBe('.games.darkspace.press');
  });

  it('refuses a missing or mismatched state without calling Discord', async () => {
    for (const [state, saved] of [
      ['abc', null],
      ['abc', 'abd'],
      ['abc', 'abcd'],
    ] as const) {
      const discord = fakeDiscord();
      const r = await cb(AZURE, state, saved, deps({ fetch: discord.fetch }));
      expect(r.headers!.Location).toBe('/?login=failed');
      expect(cookie(r, SESSION_COOKIE)).toBeUndefined();
      expect(discord.calls).toEqual([]);
    }
  });

  it('refuses people outside the Darkspace server, or without a Players role', async () => {
    const outside = await cb(
      AZURE,
      'abc',
      'abc',
      deps({ fetch: fakeDiscord({ member: new Response('', { status: 404 }) }).fetch }),
    );
    expect(outside.headers!.Location).toBe('/?login=not-member');
    expect(cookie(outside, SESSION_COOKIE)).toBeUndefined();
    const noRole = await cb(
      AZURE,
      'abc',
      'abc',
      deps({ fetch: fakeDiscord({ member: Response.json({ roles: ['111'] }) }).fetch }),
    );
    expect(noRole.headers!.Location).toBe('/?login=no-role');
    expect(cookie(noRole, SESSION_COOKIE)).toBeUndefined();
  });

  it('puts the role from the access rule in the session', async () => {
    const role = async (discord: ReturnType<typeof fakeDiscord>) =>
      verifyJwt(
        cookie(await cb(AZURE, 'abc', 'abc', deps({ fetch: discord.fetch })), SESSION_COOKIE)!.value,
        SECRET,
        NOW,
      )!.role;
    expect(await role(fakeDiscord({ member: Response.json({ roles: ['502'] }) }))).toBe('moderator');
    expect(await role(fakeDiscord({ member: Response.json({ roles: ['502', '503'] }) }))).toBe('admin');
    // The emergency admin gets in even outside the server.
    expect(
      await role(
        fakeDiscord(
          { member: new Response('', { status: 404 }) },
          { id: '777', username: 'paul', avatar: null },
        ),
      ),
    ).toBe('admin');
  });

  it('is a 500 without the server id, rather than letting anyone in', async () => {
    const d = deps({ env: { ...ENV, DISCORD_GUILD_ID: '' } });
    expect((await cb(AZURE, 'abc', 'abc', d)).status).toBe(500);
    expect(d.logs.join()).toContain('DISCORD_GUILD_ID');
  });

  it('sends a cancelled login home without a session', async () => {
    const r = await callback(req(`${AZURE}/api/auth/callback?error=access_denied&state=abc`), deps());
    expect(r.headers!.Location).toBe('/?login=cancelled');
    expect(cookie(r, SESSION_COOKIE)).toBeUndefined();
  });

  it('fails cleanly when Discord refuses, and never logs secrets', async () => {
    const bad = [
      fakeDiscord({ token: Response.json({ error: 'invalid_grant' }, { status: 400 }) }),
      fakeDiscord({ user: new Response('', { status: 401 }) }),
      fakeDiscord({}, { id: 'not-a-snowflake', username: 'x' }),
      fakeDiscord({ member: new Response('', { status: 500 }) }),
      fakeDiscord({ member: Response.json({ nope: true }) }),
    ];
    for (const discord of bad) {
      const d = deps({ fetch: discord.fetch });
      const r = await cb(AZURE, 'abc', 'abc', d);
      expect(r.headers!.Location).toBe('/?login=failed');
      expect(cookie(r, SESSION_COOKIE)).toBeUndefined();
      const logged = d.logs.join('\n');
      for (const s of ['client-secret', SECRET, 'the-code', 'discord-access'])
        expect(logged).not.toContain(s);
    }
  });
});

describe('GET /api/auth/me and POST /api/auth/logout', () => {
  const session = (claims: Partial<Parameters<typeof signJwt>[0]> = {}, secret = SECRET) =>
    `${SESSION_COOKIE}=${signJwt({ sub: '80351110224678912', username: 'nelly', avatar: null, role: 'player', iat: NOW, exp: NOW + 100, ...claims }, secret)}`;

  it('returns the user from a valid session', () => {
    const r = me(req(`${AZURE}/api/auth/me`, { cookie: session() }), deps());
    expect(r.status).toBe(200);
    expect(r.jsonBody).toMatchObject({
      id: '80351110224678912',
      username: 'nelly',
      avatar: null,
      role: 'player',
    });
    expect((r.jsonBody as { avatarUrl: string }).avatarUrl).toMatch(/^https:\/\/cdn\.discordapp\.com\//);
    expect(r.headers!['Cache-Control']).toBe('no-store');
  });

  it('is 401 with no cookie, an expired one, a forged one, or one without a valid role', () => {
    for (const c of [
      undefined,
      session({ exp: NOW }),
      session({}, 'wrong-secret'),
      session({ role: 'god' }),
    ]) {
      expect(me(req(`${AZURE}/api/auth/me`, c ? { cookie: c } : {}), deps()).status).toBe(401);
    }
  });

  it('logout clears the cookie with the same domain it was set with', () => {
    const onAzure = cookie(logout(req(`${AZURE}/api/auth/logout`, { origin: AZURE })), SESSION_COOKIE)!;
    expect(onAzure).toMatchObject({ value: '', maxAge: 0, path: '/' });
    expect(onAzure.domain).toBeUndefined();
    const custom = cookie(logout(req(`${CUSTOM}/api/auth/logout`, { origin: CUSTOM })), SESSION_COOKIE)!;
    expect(custom.domain).toBe('.games.darkspace.press');
  });

  it("logout refuses requests from another site's pages", () => {
    for (const headers of [{}, { origin: 'https://evil.example' }] as Record<string, string>[]) {
      const r = logout(req(`${AZURE}/api/auth/logout`, headers));
      expect(r.status).toBe(403);
      expect(r.cookies).toBeUndefined();
    }
  });
});

describe('POST /api/auth/unlink ("Unlink my Discord account")', async () => {
  const ID = '80351110224678912';
  const session = (claims: Partial<Parameters<typeof signJwt>[0]> = {}) =>
    `${SESSION_COOKIE}=${signJwt({ sub: ID, username: 'nelly', avatar: '8342729096ea3675442027381ff50dfe', role: 'player', iat: NOW, exp: NOW + 100, ...claims }, SECRET)}`;
  const unlinkReq = (headers: Record<string, string>, origin = CUSTOM) =>
    req(`${origin}/api/auth/unlink`, { origin, ...headers });

  it('ends the session: the cookie is cleared with the domain it was set with', async () => {
    const d = deps();
    const r = await unlink(unlinkReq({ cookie: session() }), d);
    expect(r.status).toBe(200);
    expect(r.jsonBody).toEqual({ unlinked: true });
    expect(r.headers!['Cache-Control']).toBe('no-store');
    expect(cookie(r, SESSION_COOKIE)).toMatchObject({
      value: '',
      maxAge: 0,
      path: '/',
      domain: '.games.darkspace.press',
    });
    const onAzure = await unlink(unlinkReq({ cookie: session() }, AZURE), deps());
    expect(cookie(onAzure, SESSION_COOKIE)!.domain).toBeUndefined();
  });

  it('writes one audit line with only the time and "account unlinked", and keeps no identifier', async () => {
    const d = deps();
    const r = await unlink(unlinkReq({ cookie: session() }), d);
    expect(d.logs).toEqual([unlinkAuditLine(NOW)]);
    expect(d.logs[0]).toBe(`audit: ${new Date(NOW * 1000).toISOString()} account unlinked`);
    // Nothing the server says or writes after an unlink carries the player's Discord identity.
    const everything = JSON.stringify({ logs: d.logs, r });
    for (const id of [ID, 'nelly', '8342729096ea3675442027381ff50dfe']) expect(everything).not.toContain(id);
  });

  it("doesn't call Discord (the shared app's authorization is left alone)", async () => {
    const discord = fakeDiscord();
    await unlink(unlinkReq({ cookie: session() }), deps({ fetch: discord.fetch }));
    expect(discord.calls).toEqual([]);
  });

  it('needs a valid session, and writes no audit line without one', async () => {
    for (const c of [undefined, session({ exp: NOW }), `${SESSION_COOKIE}=forged.token.here`]) {
      const d = deps();
      const r = await unlink(unlinkReq(c ? { cookie: c } : {}), d);
      expect(r.status).toBe(401);
      expect(r.cookies).toBeUndefined();
      expect(d.logs).toEqual([]);
    }
  });

  it('deletes the online record first (M14), and changes nothing if that fails', async () => {
    const forgot: string[] = [];
    const d = { ...deps(), forgetPlayer: (id: string) => (forgot.push(id), Promise.resolve(true)) };
    const r = await unlink(unlinkReq({ cookie: session() }), d);
    expect(r.status).toBe(200);
    expect(forgot).toEqual([ID]);
    const failing = { ...deps(), forgetPlayer: () => Promise.resolve(false) };
    const f = await unlink(unlinkReq({ cookie: session() }), failing);
    expect(f.status).toBe(503);
    expect(f.cookies).toBeUndefined();
    expect(failing.logs).toEqual([]);
  });

  it("refuses requests from another site's pages", async () => {
    for (const origin of [undefined, 'https://evil.example']) {
      const d = deps();
      const headers: Record<string, string> = { cookie: session() };
      if (origin) headers.origin = origin;
      const r = await unlink(req(`${CUSTOM}/api/auth/unlink`, headers), d);
      expect(r.status).toBe(403);
      expect(r.cookies).toBeUndefined();
      expect(d.logs).toEqual([]);
    }
  });
});

describe('POST /api/discord/signin (inside Discord, as an Activity)', () => {
  const ACTIVITY = 'https://1234.discordsays.com';
  const signIn = (body: string | undefined, d = deps(), origin: string | null = ACTIVITY) =>
    activitySignIn({ ...req(`${CUSTOM}/api/discord/signin`, origin ? { origin } : {}), body }, d);
  const codeBody = JSON.stringify({ code: 'sdk-code' });

  it("knows the Activity's address from the client id, and only from a real one", () => {
    expect(activityOrigin('1234')).toBe(ACTIVITY);
    expect(activityOrigin(undefined)).toBeNull();
    expect(activityOrigin('evil.example/x')).toBeNull();
  });

  it('trades the code without a redirect_uri, checks roles, and sets a partitioned cookie for the frame', async () => {
    const discord = fakeDiscord();
    const d = deps({ fetch: discord.fetch });
    const r = await signIn(codeBody, d);
    expect(r.status).toBe(200);
    expect(r.headers).toMatchObject({ 'Cache-Control': 'no-store' });
    expect(r.jsonBody).toEqual({ access_token: 'discord-access', signedIn: true });

    const [token, user, member] = discord.calls;
    expect(Object.fromEntries(new URLSearchParams(String(token!.init!.body)))).toEqual({
      grant_type: 'authorization_code',
      code: 'sdk-code',
    });
    const basic = (token!.init!.headers as Record<string, string>).Authorization!;
    expect(Buffer.from(basic.replace(/^Basic /, ''), 'base64').toString()).toBe('1234:client-secret');
    expect(user!.url).toBe('https://discord.com/api/v10/users/@me');
    expect(member!.url).toBe(MEMBER_URL);

    const s = cookie(r, SESSION_COOKIE)!;
    expect(s).toMatchObject({
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'None',
      partitioned: true,
      maxAge: 30 * 86400,
    });
    // Host-only: the browser keeps it for <client id>.discordsays.com, never .games.darkspace.press.
    expect(s.domain).toBeUndefined();
    expect(verifyJwt(s.value, SECRET, NOW)).toMatchObject({ sub: '80351110224678912', role: 'player' });
    expect(d.logs).toEqual([]);
  });

  it('a refused player still gets the token (for the profile details), and any earlier session ends', async () => {
    for (const [member, reason] of [
      [new Response('{}', { status: 404 }), 'not-member'],
      [Response.json({ roles: ['111'] }), 'no-role'],
    ] as const) {
      const r = await signIn(codeBody, deps({ fetch: fakeDiscord({ member }).fetch }));
      expect(r.status).toBe(200);
      expect(r.jsonBody).toEqual({ access_token: 'discord-access', signedIn: false, reason });
      expect(cookie(r, SESSION_COOKIE)).toMatchObject({
        value: '',
        maxAge: 0,
        sameSite: 'None',
        partitioned: true,
      });
    }
  });

  it("keeps an earlier session when Discord has trouble after the exchange, and doesn't log the token", async () => {
    const d = deps({ fetch: fakeDiscord({ member: new Response('busy', { status: 503 }) }).fetch });
    const r = await signIn(codeBody, d);
    expect(r.jsonBody).toEqual({ access_token: 'discord-access', signedIn: false, reason: 'failed' });
    expect(r.cookies).toEqual([]);
    expect(d.logs.join()).toContain('guild member lookup returned 503');
    expect(d.logs.join()).not.toContain('discord-access');
  });

  it('is a 502 when Discord turns the code down, and logs neither the code nor the secret', async () => {
    const d = deps({ fetch: fakeDiscord({ token: new Response('{}', { status: 400 }) }).fetch });
    const r = await signIn(codeBody, d);
    expect(r.status).toBe(502);
    expect(r.cookies).toBeUndefined();
    expect(d.logs.join()).toContain('token exchange returned 400');
    expect(d.logs.join()).not.toMatch(/sdk-code|client-secret/);
  });

  it("refuses other pages, including the game's own browser page, without calling Discord", async () => {
    for (const origin of [CUSTOM, 'https://999.discordsays.com', null]) {
      const discord = fakeDiscord();
      const r = await signIn(codeBody, deps({ fetch: discord.fetch }), origin);
      expect(r.status).toBe(403);
      expect(discord.calls).toHaveLength(0);
    }
  });

  it('is a 400 for a missing or odd code, without calling Discord', async () => {
    for (const body of [
      undefined,
      '',
      'not json',
      'null',
      '{}',
      '{"code":7}',
      JSON.stringify({ code: 'x'.repeat(201) }),
    ]) {
      const discord = fakeDiscord();
      const r = await signIn(body, deps({ fetch: discord.fetch }));
      expect(r.status).toBe(400);
      expect(discord.calls).toHaveLength(0);
    }
  });

  it('is a 500 without its settings, rather than letting anyone in', async () => {
    const r = await signIn(codeBody, deps({ env: { ...ENV, DISCORD_GUILD_ID: '' } }));
    expect(r.status).toBe(500);
  });
});
