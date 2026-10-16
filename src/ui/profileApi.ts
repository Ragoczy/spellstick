import type { ProfileView } from '../achievements';

/** A profile from the server (M14): found, no record yet, or profiles are off (no database, dev server). */
export type ProfileResult = { kind: 'ok'; view: ProfileView } | { kind: 'none' } | { kind: 'unavailable' };

/** Profiles exist for Discord ids only (guests have none). */
export const hasProfile = (id: string | null | undefined): id is string => !!id && /^\d{5,25}$/.test(id);

/** GET /api/profile/<id> (or `me`). */
export async function fetchProfile(id: string): Promise<ProfileResult> {
  try {
    const res = await fetch(`/api/profile/${encodeURIComponent(id)}`, { credentials: 'same-origin' });
    if (res.status === 404) return { kind: 'none' };
    if (!res.ok) return { kind: 'unavailable' };
    return { kind: 'ok', view: (await res.json()) as ProfileView };
  } catch {
    return { kind: 'unavailable' };
  }
}

/** DELETE /api/profile/me: true when there's no record left (deleted, or there never was one). */
export async function deleteProfile(): Promise<boolean> {
  try {
    const res = await fetch('/api/profile/me', { method: 'DELETE', credentials: 'same-origin' });
    // 503: no database here, so there's nothing stored to delete.
    return res.ok || res.status === 503;
  } catch {
    return false;
  }
}

/** The profile an address asks for: `/profile/me` or `/profile/<discord id>`; null otherwise. */
export function profileFromPath(pathname: string): string | null {
  const m = /^\/profile\/(me|\d{5,25})\/?$/.exec(pathname);
  return m ? m[1]! : null;
}
