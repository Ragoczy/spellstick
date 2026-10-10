/**
 * Discord login (the auth API lives in /api). Logging in is required to play; the title
 * screen shows the login button until /api/auth/me says who you are.
 */

export interface DiscordUser {
  id: string;
  username: string;
  avatarUrl: string;
}

export type AuthState =
  | { status: 'checking' }
  | { status: 'in'; user: DiscordUser }
  | { status: 'out'; message?: string }
  /** `npm run dev` without the auth API: play without logging in. Never in a production build. */
  | { status: 'dev' };

export const LOGIN_URL = '/api/auth/login';
const ME_URL = '/api/auth/me';
const LOGOUT_URL = '/api/auth/logout';

export const LOGIN_MESSAGES: Record<string, string> = {
  failed: "Discord login didn't work. Try again.",
  cancelled: 'Login cancelled.',
  unavailable: "Can't reach the login server right now. Try again in a moment.",
};

/** Reads the /api/auth/me answer. `null` means the auth API isn't there (or is broken). */
export function parseMe(
  status: number,
  contentType: string | null,
  body: unknown,
): DiscordUser | 'out' | null {
  if (status === 401) return 'out';
  if (status !== 200 || !contentType?.includes('application/json')) return null;
  const u = body as Partial<DiscordUser> | null;
  if (!u || typeof u.id !== 'string' || typeof u.username !== 'string' || typeof u.avatarUrl !== 'string') {
    return null;
  }
  return { id: u.id, username: u.username, avatarUrl: u.avatarUrl };
}

export async function checkSession(dev: boolean): Promise<AuthState> {
  let result: DiscordUser | 'out' | null;
  try {
    const res = await fetch(ME_URL, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
    const type = res.headers.get('content-type');
    result = parseMe(res.status, type, type?.includes('application/json') ? await res.json() : null);
  } catch {
    result = null;
  }
  if (result === 'out') return { status: 'out' };
  if (result) return { status: 'in', user: result };
  return dev ? { status: 'dev' } : { status: 'out', message: LOGIN_MESSAGES.unavailable };
}

export async function logOut(): Promise<void> {
  try {
    await fetch(LOGOUT_URL, { method: 'POST', credentials: 'same-origin' });
  } catch {
    // The cookie may outlive this; the next /me check will say so.
  }
}

/** ?login=failed|cancelled from the callback: returns the message and tidies the address bar. */
export function takeLoginMessage(): string | undefined {
  const url = new URL(window.location.href);
  const code = url.searchParams.get('login');
  if (!code) return undefined;
  url.searchParams.delete('login');
  window.history.replaceState(null, '', url.pathname + url.search + url.hash);
  return LOGIN_MESSAGES[code] ?? LOGIN_MESSAGES.failed;
}
