import { randomBytes, timingSafeEqual } from 'node:crypto';
import { ACCESS_ROLES, accessSettings, checkAccess, type AccessRole } from './access.js';
import { signJwt, verifyJwt } from './jwt.js';

/**
 * Discord login (OAuth2 authorization code flow, scopes "identify guilds.members.read"),
 * with the shared Darkspace Games access rule (Darkspace Discord server roles; see access.ts).
 * Also signs players in when the game runs inside Discord as an Activity (activitySignIn).
 * Kept free of HTTP plumbing so it can be unit tested; server/http.ts routes requests here.
 */

export const SESSION_COOKIE = 'dsg_session';
export const STATE_COOKIE = 'dsg_oauth_state';
export const SESSION_DAYS = 30;
const SESSION_SECONDS = SESSION_DAYS * 24 * 60 * 60;
const STATE_SECONDS = 10 * 60;
/** Served from here or a subdomain, the session cookie is shared by all the games. */
export const SHARED_COOKIE_PARENT = 'games.darkspace.press';

const DISCORD_AUTHORIZE = 'https://discord.com/oauth2/authorize';
const DISCORD_API = 'https://discord.com/api/v10';
const DISCORD_TIMEOUT_MS = 10_000;
const DISCORD_SCOPES = 'identify guilds.members.read';

/** The parts of an HTTP request the handlers read. */
export interface AuthRequest {
  /** The full URL as the browser used it (public origin, path, query). */
  url: string;
  headers: { get(name: string): string | null };
  /** The request body, for POSTs that send one (size-capped by server/http.ts). */
  body?: string;
}

/** A Set-Cookie, serialized by server/http.ts. */
export interface ResponseCookie {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  maxAge?: number;
  expires?: Date;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
  /** CHIPS: kept only for this site inside the page that frames it (Discord). */
  partitioned?: boolean;
}

/** What a handler answers; server/http.ts writes it out. */
export interface AuthResponse {
  status: number;
  headers?: Record<string, string>;
  jsonBody?: unknown;
  cookies?: ResponseCookie[];
}

export interface AuthDeps {
  env: Record<string, string | undefined>;
  fetch: typeof fetch;
  nowSeconds: () => number;
  /** For failures and the unlink audit line only. Never pass it secrets, codes, tokens, or Discord IDs. */
  log: (message: string) => void;
  /**
   * Someone was let in, with their Darkspace server roles (M14: their tier role is put right).
   * Called without waiting; it must not throw.
   */
  afterSignIn?: (user: { id: string; name: string; avatarUrl: string }, memberRoles: string[] | null) => void;
  /** Unlinking: delete everything stored about this player first (M14). False if that failed. */
  forgetPlayer?: (id: string) => Promise<boolean>;
}

export interface MeBody {
  id: string;
  username: string;
  avatar: string | null;
  avatarUrl: string;
  role: AccessRole;
}

const NO_STORE = { 'Cache-Control': 'no-store' };

/** The origin the browser used, so one build works on the Azure address, the custom domain, and localhost. */
export function requestOrigin(req: AuthRequest): string {
  return new URL(req.url).origin;
}

/** Inside Discord, the game is served from https://<client id>.discordsays.com through Discord's proxy. */
export function activityOrigin(clientId: string | undefined): string | null {
  return clientId && ID_RE.test(clientId) ? `https://${clientId}.discordsays.com` : null;
}

/** Domain=.games.darkspace.press on that domain; host-only (undefined) everywhere else. */
export function cookieDomainFor(origin: string): string | undefined {
  const host = new URL(origin).hostname.toLowerCase();
  return host === SHARED_COOKIE_PARENT || host.endsWith(`.${SHARED_COOKIE_PARENT}`)
    ? `.${SHARED_COOKIE_PARENT}`
    : undefined;
}

export function parseCookies(header: string | null): Map<string, string> {
  const out = new Map<string, string>();
  for (const part of (header ?? '').split(';')) {
    const eq = part.indexOf('=');
    if (eq < 1) continue;
    const name = part.slice(0, eq).trim();
    if (!out.has(name)) out.set(name, part.slice(eq + 1).trim());
  }
  return out;
}

export function avatarUrl(id: string, avatar: string | null): string {
  if (avatar) {
    const ext = avatar.startsWith('a_') ? 'gif' : 'png';
    return `https://cdn.discordapp.com/avatars/${id}/${avatar}.${ext}?size=64`;
  }
  // Discord's default avatar for accounts on the new username system.
  const index = Number((BigInt(id) >> 22n) % 6n);
  return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
}

function sessionCookie(origin: string, value: string, maxAge: number): ResponseCookie {
  const domain = cookieDomainFor(origin);
  return {
    name: SESSION_COOKIE,
    value,
    path: '/',
    ...(domain ? { domain } : {}),
    maxAge,
    ...(maxAge === 0 ? { expires: new Date(0) } : {}),
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
  };
}

function stateCookie(value: string, maxAge: number): ResponseCookie {
  return {
    name: STATE_COOKIE,
    value,
    path: '/api/auth',
    maxAge,
    ...(maxAge === 0 ? { expires: new Date(0) } : {}),
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
  };
}

/**
 * The session cookie inside Discord. The game is a frame there, so the browser treats it as a
 * third-party cookie: SameSite=None and Partitioned, as Discord's networking guide asks. No
 * Domain: it belongs to <client id>.discordsays.com only, apart from the browser's own cookie.
 */
function activitySessionCookie(value: string, maxAge: number): ResponseCookie {
  return {
    name: SESSION_COOKIE,
    value,
    path: '/',
    maxAge,
    ...(maxAge === 0 ? { expires: new Date(0) } : {}),
    httpOnly: true,
    secure: true,
    sameSite: 'None',
    partitioned: true,
  };
}

const redirect = (location: string, cookies: ResponseCookie[] = []): AuthResponse => ({
  status: 302,
  headers: { Location: location, ...NO_STORE },
  cookies,
});

const notConfigured = (deps: AuthDeps, missing: string): AuthResponse => {
  deps.log(`auth: app setting ${missing} is not set`);
  return { status: 500, headers: NO_STORE, jsonBody: { error: 'auth_not_configured' } };
};

const callbackUrl = (origin: string) => `${origin}/api/auth/callback`;

/** GET /api/auth/login: a fresh state in a short-lived cookie, then off to Discord. */
export function login(req: AuthRequest, deps: AuthDeps): AuthResponse {
  const clientId = deps.env.DISCORD_CLIENT_ID;
  if (!clientId) return notConfigured(deps, 'DISCORD_CLIENT_ID');
  const state = randomBytes(32).toString('base64url');
  const url = new URL(DISCORD_AUTHORIZE);
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    scope: DISCORD_SCOPES,
    state,
    redirect_uri: callbackUrl(requestOrigin(req)),
    // Skips Discord's approval screen for people who already approved the app.
    prompt: 'none',
  }).toString();
  return redirect(url.toString(), [stateCookie(state, STATE_SECONDS)]);
}

const ID_RE = /^\d{1,25}$/;
const AVATAR_RE = /^(a_)?[0-9a-f]{1,64}$/;

/**
 * GET /api/auth/callback: check state, trade the code for a token, look up the user and their
 * Darkspace server roles, apply the access rule, set the session. Discord's token is discarded.
 */
export async function callback(req: AuthRequest, deps: AuthDeps): Promise<AuthResponse> {
  const {
    DISCORD_CLIENT_ID: clientId,
    DISCORD_CLIENT_SECRET: clientSecret,
    SESSION_SECRET: secret,
  } = deps.env;
  if (!clientId) return notConfigured(deps, 'DISCORD_CLIENT_ID');
  if (!clientSecret) return notConfigured(deps, 'DISCORD_CLIENT_SECRET');
  if (!secret) return notConfigured(deps, 'SESSION_SECRET');
  const settings = accessSettings(deps.env);
  if (!settings) return notConfigured(deps, 'DISCORD_GUILD_ID');

  const clearState = stateCookie('', 0);
  const fail = (why: string) => {
    deps.log(`auth: login failed (${why})`);
    return redirect('/?login=failed', [clearState]);
  };

  const query = new URL(req.url).searchParams;
  if (query.get('error')) return redirect('/?login=cancelled', [clearState]);
  const code = query.get('code');
  const state = query.get('state');
  const expected = parseCookies(req.headers.get('cookie')).get(STATE_COOKIE);
  if (!code || !state || !expected) return fail('missing code or state');
  const a = Buffer.from(state);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return fail('state mismatch');

  const origin = requestOrigin(req);
  let accessToken: string;
  try {
    accessToken = await exchangeCode(deps, clientId, clientSecret, {
      grant_type: 'authorization_code',
      code,
      redirect_uri: callbackUrl(origin),
    });
  } catch (e) {
    return fail((e as Error).message);
  }

  const result = await admit(deps, accessToken, settings);
  if (result.kind === 'failed') return fail(result.why);
  if (result.kind === 'refused') return redirect(`/?login=${result.reason}`, [clearState]);
  return redirect('/', [
    clearState,
    sessionCookie(origin, sessionToken(result, secret, deps), SESSION_SECONDS),
  ]);
}

/** Trades a one-time code at Discord's token endpoint. Throws with a reason fit for the log (no secrets). */
async function exchangeCode(
  deps: AuthDeps,
  clientId: string,
  clientSecret: string,
  form: Record<string, string>,
): Promise<string> {
  let body: { access_token?: unknown };
  try {
    const res = await deps.fetch(`${DISCORD_API}/oauth2/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams(form),
      signal: AbortSignal.timeout(DISCORD_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`token exchange returned ${res.status}`);
    body = (await res.json()) as { access_token?: unknown };
  } catch (e) {
    throw (e as Error).message.startsWith('token exchange')
      ? e
      : new Error(`token exchange error: ${(e as Error).name}`);
  }
  if (typeof body.access_token !== 'string') throw new Error('token exchange returned no access token');
  return body.access_token;
}

interface DiscordProfile {
  id: string;
  username: string;
  avatar: string | null;
}

type Admission =
  | { kind: 'allowed'; user: DiscordProfile; role: AccessRole }
  | { kind: 'refused'; reason: 'not-member' | 'no-role' }
  /** Discord had trouble; `why` is for the log. */
  | { kind: 'failed'; why: string };

/** With a player's Discord token: who they are, their Darkspace server roles, then the access rule. */
async function admit(
  deps: AuthDeps,
  accessToken: string,
  settings: NonNullable<ReturnType<typeof accessSettings>>,
): Promise<Admission> {
  const failed = (why: string): Admission => ({ kind: 'failed', why });
  let user: DiscordProfile;
  try {
    const res = await deps.fetch(`${DISCORD_API}/users/@me`, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(DISCORD_TIMEOUT_MS),
    });
    if (!res.ok) return failed(`users/@me returned ${res.status}`);
    const u = (await res.json()) as { id?: unknown; username?: unknown; avatar?: unknown };
    if (typeof u.id !== 'string' || !ID_RE.test(u.id) || typeof u.username !== 'string') {
      return failed('users/@me returned an unexpected shape');
    }
    const avatar = typeof u.avatar === 'string' && AVATAR_RE.test(u.avatar) ? u.avatar : null;
    user = { id: u.id, username: u.username, avatar };
  } catch (e) {
    return failed(`users/@me error: ${(e as Error).name}`);
  }

  // Roles in the Darkspace server; a 404 means "not in the server".
  let memberRoles: string[] | null;
  try {
    const res = await deps.fetch(`${DISCORD_API}/users/@me/guilds/${settings.guildId}/member`, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(DISCORD_TIMEOUT_MS),
    });
    if (res.status === 404) memberRoles = null;
    else if (!res.ok) return failed(`guild member lookup returned ${res.status}`);
    else {
      const m = (await res.json()) as { roles?: unknown };
      if (!Array.isArray(m.roles)) return failed('guild member lookup returned an unexpected shape');
      memberRoles = m.roles.filter((r): r is string => typeof r === 'string');
    }
  } catch (e) {
    return failed(`guild member lookup error: ${(e as Error).name}`);
  }

  const access = checkAccess(user.id, memberRoles, settings);
  if (!access.allowed) return { kind: 'refused', reason: access.reason };
  deps.afterSignIn?.(
    { id: user.id, name: user.username, avatarUrl: avatarUrl(user.id, user.avatar) },
    memberRoles,
  );
  return { kind: 'allowed', user, role: access.role };
}

function sessionToken(a: { user: DiscordProfile; role: AccessRole }, secret: string, deps: AuthDeps): string {
  const now = deps.nowSeconds();
  return signJwt(
    {
      sub: a.user.id,
      username: a.user.username,
      avatar: a.user.avatar,
      role: a.role,
      iat: now,
      exp: now + SESSION_SECONDS,
    },
    secret,
  );
}

/** What POST /api/discord/signin answers with a 200. */
export type ActivitySignInBody =
  | { access_token: string; signedIn: true }
  | { access_token: string; signedIn: false; reason: 'not-member' | 'no-role' | 'failed' };

/**
 * POST /api/discord/signin { code }: the game running inside Discord (an Activity). At launch
 * the page asks Discord for a one-time code (scopes identify, guilds.members.read, and
 * rpc.activities.write); only the server knows the app secret, so it trades the code here.
 * Then the same checks as browser sign-in, and if they pass, a session cookie that works in
 * Discord's frame. Every launch signs in afresh, so roles are checked each time, and a refused
 * player's earlier session there ends. The access token goes back to the page (even when
 * refused) for the "Playing Spellstick" profile details; it is never stored or logged.
 */
export async function activitySignIn(req: AuthRequest, deps: AuthDeps): Promise<AuthResponse> {
  const {
    DISCORD_CLIENT_ID: clientId,
    DISCORD_CLIENT_SECRET: clientSecret,
    SESSION_SECRET: secret,
  } = deps.env;
  if (!clientId) return notConfigured(deps, 'DISCORD_CLIENT_ID');
  if (!clientSecret) return notConfigured(deps, 'DISCORD_CLIENT_SECRET');
  if (!secret) return notConfigured(deps, 'SESSION_SECRET');
  const settings = accessSettings(deps.env);
  if (!settings) return notConfigured(deps, 'DISCORD_GUILD_ID');
  // Only the game's own page inside Discord may send this.
  if (req.headers.get('origin') !== activityOrigin(clientId)) {
    return { status: 403, headers: NO_STORE, jsonBody: { error: 'bad_origin' } };
  }

  let code: unknown;
  try {
    code = (JSON.parse(req.body ?? '') as { code?: unknown } | null)?.code;
  } catch {
    code = undefined;
  }
  // Discord's codes are short; anything else isn't worth sending on.
  if (typeof code !== 'string' || code.length === 0 || code.length > 200) {
    return { status: 400, headers: NO_STORE, jsonBody: { error: 'missing_code' } };
  }

  let accessToken: string;
  try {
    // The SDK hands the page this code directly, not through a redirect, so there's no redirect_uri.
    accessToken = await exchangeCode(deps, clientId, clientSecret, {
      grant_type: 'authorization_code',
      code,
    });
  } catch (e) {
    deps.log(`auth: Discord Activity sign-in failed (${(e as Error).message})`);
    return { status: 502, headers: NO_STORE, jsonBody: { error: 'code_refused' } };
  }

  const result = await admit(deps, accessToken, settings);
  let body: ActivitySignInBody;
  let cookies: ResponseCookie[] = [];
  if (result.kind === 'failed') {
    // Discord had trouble, not the player: keep any earlier session.
    deps.log(`auth: Discord Activity sign-in failed (${result.why})`);
    body = { access_token: accessToken, signedIn: false, reason: 'failed' };
  } else if (result.kind === 'refused') {
    body = { access_token: accessToken, signedIn: false, reason: result.reason };
    cookies = [activitySessionCookie('', 0)];
  } else {
    body = { access_token: accessToken, signedIn: true };
    cookies = [activitySessionCookie(sessionToken(result, secret, deps), SESSION_SECONDS)];
  }
  return { status: 200, headers: NO_STORE, jsonBody: body, cookies };
}

/** GET /api/auth/me: the user from a valid session, or 401. */
export function me(req: AuthRequest, deps: AuthDeps): AuthResponse {
  const secret = deps.env.SESSION_SECRET;
  if (!secret) return notConfigured(deps, 'SESSION_SECRET');
  const token = parseCookies(req.headers.get('cookie')).get(SESSION_COOKIE);
  const claims = token ? verifyJwt(token, secret, deps.nowSeconds()) : null;
  if (!claims || !ID_RE.test(claims.sub) || !ACCESS_ROLES.includes(claims.role as AccessRole)) {
    return { status: 401, headers: NO_STORE, jsonBody: { error: 'unauthenticated' } };
  }
  const avatar = claims.avatar && AVATAR_RE.test(claims.avatar) ? claims.avatar : null;
  const body: MeBody = {
    id: claims.sub,
    username: claims.username,
    avatar,
    avatarUrl: avatarUrl(claims.sub, avatar),
    role: claims.role as AccessRole,
  };
  return { status: 200, headers: NO_STORE, jsonBody: body };
}

/** Non-GET requests must come from this site's own pages (the browser's Origin header). */
export function sameOrigin(req: AuthRequest): boolean {
  return req.headers.get('origin') === requestOrigin(req);
}

/** POST /api/auth/logout: clear the session cookie. */
export function logout(req: AuthRequest): AuthResponse {
  if (!sameOrigin(req)) return { status: 403, headers: NO_STORE, jsonBody: { error: 'bad_origin' } };
  return { status: 204, headers: NO_STORE, cookies: [sessionCookie(requestOrigin(req), '', 0)] };
}

/** The whole audit entry for an unlink: the time and what happened, and no identifier of any kind. */
export const unlinkAuditLine = (nowSeconds: number) =>
  `audit: ${new Date(nowSeconds * 1000).toISOString()} account unlinked`;

/**
 * POST /api/auth/unlink ("Unlink my Discord account"): deletes the player's online record
 * (achievements, M14) and their tier role, then ends the session and writes a time-only audit
 * line. If the record can't be deleted, nothing changes. Discord's token was never kept. The
 * browser clears its own saved settings. Discord's token revocation is not called (yet): the game
 * used to share the card game's Discord app, where revoking would have ended that game's sign-in too.
 */
export async function unlink(req: AuthRequest, deps: AuthDeps): Promise<AuthResponse> {
  if (!sameOrigin(req)) return { status: 403, headers: NO_STORE, jsonBody: { error: 'bad_origin' } };
  const secret = deps.env.SESSION_SECRET;
  if (!secret) return notConfigured(deps, 'SESSION_SECRET');
  const token = parseCookies(req.headers.get('cookie')).get(SESSION_COOKIE);
  const claims = token ? verifyJwt(token, secret, deps.nowSeconds()) : null;
  if (!claims) {
    return { status: 401, headers: NO_STORE, jsonBody: { error: 'unauthenticated' } };
  }
  if (deps.forgetPlayer && !(await deps.forgetPlayer(claims.sub))) {
    return { status: 503, headers: NO_STORE, jsonBody: { error: 'unavailable' } };
  }
  deps.log(unlinkAuditLine(deps.nowSeconds()));
  return {
    status: 200,
    headers: NO_STORE,
    jsonBody: { unlinked: true },
    cookies: [sessionCookie(requestOrigin(req), '', 0)],
  };
}
