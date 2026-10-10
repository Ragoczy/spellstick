import { createHmac, timingSafeEqual } from 'node:crypto';

/** What the session cookie carries: the Discord user id, username, and avatar hash. */
export interface SessionClaims {
  /** Discord user id. */
  sub: string;
  username: string;
  /** Discord avatar hash, or null for a default avatar. */
  avatar: string | null;
  /** Issued at, seconds since the epoch. */
  iat: number;
  /** Expires at, seconds since the epoch. */
  exp: number;
}

const HEADER = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');

const sign = (data: string, secret: string) => createHmac('sha256', secret).update(data).digest();

/** An HMAC-SHA256 (HS256) JWT. */
export function signJwt(claims: SessionClaims, secret: string): string {
  const body = `${HEADER}.${Buffer.from(JSON.stringify(claims)).toString('base64url')}`;
  return `${body}.${sign(body, secret).toString('base64url')}`;
}

/** The claims of a well-formed, correctly signed, unexpired HS256 JWT; otherwise null. */
export function verifyJwt(token: string, secret: string, nowSeconds: number): SessionClaims | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, payload, signature] = parts as [string, string, string];
  try {
    const h = JSON.parse(Buffer.from(header, 'base64url').toString('utf8')) as { alg?: unknown };
    if (h.alg !== 'HS256') return null;
    const given = Buffer.from(signature, 'base64url');
    const expected = sign(`${header}.${payload}`, secret);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
    const c = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Partial<SessionClaims>;
    if (typeof c.sub !== 'string' || typeof c.username !== 'string') return null;
    if (c.avatar !== null && typeof c.avatar !== 'string') return null;
    if (typeof c.exp !== 'number' || c.exp <= nowSeconds) return null;
    return { sub: c.sub, username: c.username, avatar: c.avatar, iat: Number(c.iat) || 0, exp: c.exp };
  } catch {
    return null;
  }
}
