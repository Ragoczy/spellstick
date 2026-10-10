import { describe, expect, it } from 'vitest';
import { parseMe } from './auth';

describe('Discord login: reading /api/auth/me', () => {
  const user = { id: '80351110224678912', username: 'nelly', avatarUrl: 'https://cdn.discordapp.com/x.png' };

  it('a 200 with a user is logged in; a 401 is logged out', () => {
    expect(parseMe(200, 'application/json; charset=utf-8', { ...user, avatar: null })).toEqual(user);
    expect(parseMe(401, 'application/json', { error: 'unauthenticated' })).toBe('out');
  });

  it("anything else means the auth API isn't there: an HTML fallback, a 404, a 500, or junk", () => {
    expect(parseMe(200, 'text/html', null)).toBeNull();
    expect(parseMe(404, null, null)).toBeNull();
    expect(parseMe(500, 'application/json', { error: 'auth_not_configured' })).toBeNull();
    expect(parseMe(200, 'application/json', { id: 1 })).toBeNull();
    expect(parseMe(200, 'application/json', null)).toBeNull();
  });
});
