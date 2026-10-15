import { describe, expect, it } from 'vitest';
import { BYE_MESSAGES, discordRoom, roomFromAddress, roomLink } from './online';

describe('online rooms in the address', () => {
  it('reads a browser room code from ?room=, and nothing else', () => {
    expect(roomFromAddress('?room=ab12cd')).toBe('ab12cd');
    expect(roomFromAddress('?room=AB12CD')).toBeNull();
    expect(roomFromAddress('?room=d-123')).toBeNull(); // Discord rooms come from Discord, not links
    expect(roomFromAddress('?login=failed')).toBeNull();
  });

  it('makes the link to share, and the Discord room', () => {
    expect(roomLink('https://spellstick.games.darkspace.press', 'ab12cd')).toBe(
      'https://spellstick.games.darkspace.press/?room=ab12cd',
    );
    expect(discordRoom('i-123-gc-456')).toBe('d-i-123-gc-456');
  });

  it('explains every way online play can end', () => {
    for (const text of Object.values(BYE_MESSAGES)) expect(text.length).toBeGreaterThan(10);
  });
});
