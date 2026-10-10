import { describe, expect, it } from 'vitest';
import { LOGIN_MESSAGES, clearLocalGameData, parseMe } from './auth';

describe('Discord login: reading /api/auth/me', () => {
  const user = {
    id: '80351110224678912',
    username: 'nelly',
    avatarUrl: 'https://cdn.discordapp.com/x.png',
    role: 'player',
  };

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

describe('Unlink my Discord account: what the browser forgets', () => {
  /** A minimal Storage, as localStorage behaves. */
  function memoryStorage(entries: Record<string, string>): Storage {
    const m = new Map(Object.entries(entries));
    return {
      get length() {
        return m.size;
      },
      key: (i) => [...m.keys()][i] ?? null,
      getItem: (k) => m.get(k) ?? null,
      setItem: (k, v) => void m.set(k, v),
      removeItem: (k) => void m.delete(k),
      clear: () => m.clear(),
    };
  }

  it("removes every key the game saved, and leaves other sites' keys alone", () => {
    const storage = memoryStorage({
      'spellstick.selection': '{"home":"a","away":"b","difficulty":"hard"}',
      'spellstick.muted': '1',
      'spellstick.anythingAddedLater': 'x',
      'someone-else': 'keep',
    });
    clearLocalGameData(storage);
    expect(storage.length).toBe(1);
    expect(storage.getItem('someone-else')).toBe('keep');
  });

  it('afterwards, the title says exactly what happened', () => {
    expect(LOGIN_MESSAGES.unlinked).toBe(
      'Your Spellstick data has been deleted and the game is disconnected from Discord. Your Discord account was not affected.',
    );
  });
});
