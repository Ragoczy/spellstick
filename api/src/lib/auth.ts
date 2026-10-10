import { randomBytes, timingSafeEqual } from 'node:crypto';
import { signJwt, verifyJwt } from './jwt';

/**
 * Discord login (OAuth2 authorization code flow, scope "identify"), shared by every
 * Darkspace game. Kept free of the Functions runtime so it can be unit tested; the
 * registrations live in src/functions/auth.ts.
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

/** The parts of an HTTP request the handlers read (a subset of @azure/functions' HttpRequest). */
export interface AuthRequest {
  url: string;
  headers: { get(name: string): string | null };
}

/** Matches @azure/functions' Cookie. */
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
}

/** Matches @azure/functions' HttpResponseInit. */
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
  /** For failures only. Never pass it secrets, codes, or tokens. */
  log: (message: string) => void;
}

export interface MeBody {
  id: string;
  username: string;
  avatar: string | null;
  avatarUrl: string;
}

const NO_STORE = { 'Cache-Control': 'no-store' };

/** The origin the browser used. SWA forwards it in x-ms-original-url; the function itself sees an internal URL. */
export function requestOrigin(req: AuthRequest): string {
  const original = req.headers.get('x-ms-original-url');
  if (original) {
    try {
      return new URL(original).origin;
    } catch {
      // fall through
    }
  }
  const host = req.headers.get('x-forwarded-host');
  if (host) {
    const proto = req.headers.get('x-forwarded-proto') ?? 'https';
    return `${proto.split(',')[0]!.trim()}://${host.split(',')[0]!.trim()}`;
  }
  return new URL(req.url).origin;
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
    scope: 'identify',
    state,
    redirect_uri: callbackUrl(requestOrigin(req)),
  }).toString();
  return redirect(url.toString(), [stateCookie(state, STATE_SECONDS)]);
}

const ID_RE = /^\d{1,25}$/;
const AVATAR_RE = /^(a_)?[0-9a-f]{1,64}$/;

/** GET /api/auth/callback: check state, trade the code for a token, look up the user, set the session. */
export async function callback(req: AuthRequest, deps: AuthDeps): Promise<AuthResponse> {
  const {
    DISCORD_CLIENT_ID: clientId,
    DISCORD_CLIENT_SECRET: clientSecret,
    SESSION_SECRET: secret,
  } = deps.env;
  if (!clientId) return notConfigured(deps, 'DISCORD_CLIENT_ID');
  if (!clientSecret) return notConfigured(deps, 'DISCORD_CLIENT_SECRET');
  if (!secret) return notConfigured(deps, 'SESSION_SECRET');

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
    const res = await deps.fetch(`${DISCORD_API}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: callbackUrl(origin),
        client_id: clientId,
        client_secret: clientSecret,
      }),
      signal: AbortSignal.timeout(DISCORD_TIMEOUT_MS),
    });
    if (!res.ok) return fail(`token exchange returned ${res.status}`);
    const body = (await res.json()) as { access_token?: unknown };
    if (typeof body.access_token !== 'string') return fail('token exchange returned no access token');
    accessToken = body.access_token;
  } catch (e) {
    return fail(`token exchange error: ${(e as Error).name}`);
  }

  let user: { id: string; username: string; avatar: string | null };
  try {
    const res = await deps.fetch(`${DISCORD_API}/users/@me`, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(DISCORD_TIMEOUT_MS),
    });
    if (!res.ok) return fail(`users/@me returned ${res.status}`);
    const u = (await res.json()) as { id?: unknown; username?: unknown; avatar?: unknown };
    if (typeof u.id !== 'string' || !ID_RE.test(u.id) || typeof u.username !== 'string') {
      return fail('users/@me returned an unexpected shape');
    }
    const avatar = typeof u.avatar === 'string' && AVATAR_RE.test(u.avatar) ? u.avatar : null;
    user = { id: u.id, username: u.username, avatar };
  } catch (e) {
    return fail(`users/@me error: ${(e as Error).name}`);
  }

  const now = deps.nowSeconds();
  const token = signJwt(
    { sub: user.id, username: user.username, avatar: user.avatar, iat: now, exp: now + SESSION_SECONDS },
    secret,
  );
  return redirect('/', [clearState, sessionCookie(origin, token, SESSION_SECONDS)]);
}

/** GET /api/auth/me: the user from a valid session, or 401. */
export function me(req: AuthRequest, deps: AuthDeps): AuthResponse {
  const secret = deps.env.SESSION_SECRET;
  if (!secret) return notConfigured(deps, 'SESSION_SECRET');
  const token = parseCookies(req.headers.get('cookie')).get(SESSION_COOKIE);
  const claims = token ? verifyJwt(token, secret, deps.nowSeconds()) : null;
  if (!claims || !ID_RE.test(claims.sub)) {
    return { status: 401, headers: NO_STORE, jsonBody: { error: 'unauthenticated' } };
  }
  const avatar = claims.avatar && AVATAR_RE.test(claims.avatar) ? claims.avatar : null;
  const body: MeBody = {
    id: claims.sub,
    username: claims.username,
    avatar,
    avatarUrl: avatarUrl(claims.sub, avatar),
  };
  return { status: 200, headers: NO_STORE, jsonBody: body };
}

/** POST /api/auth/logout: clear the session cookie. */
export function logout(req: AuthRequest): AuthResponse {
  return { status: 204, headers: NO_STORE, cookies: [sessionCookie(requestOrigin(req), '', 0)] };
}
