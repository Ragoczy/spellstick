import { describe, expect, it } from 'vitest';
import { DEFAULT_AWAY, DEFAULT_HOME, TEAMS } from '../content/teams';
import {
  IN_DISCORD,
  isDiscordLaunch,
  matchPresence,
  MENU_PRESENCE,
  resultPresence,
  setDiscordPresence,
  trainingPresence,
} from './discord';

describe('Discord Activity: when the game counts as launched by Discord', () => {
  it('needs both the Activity address and a frame_id', () => {
    expect(isDiscordLaunch('1234.discordsays.com', '?frame_id=f&instance_id=i&platform=desktop')).toBe(true);
    expect(isDiscordLaunch('1234.discordsays.com', '')).toBe(false);
    // Someone adding ?frame_id to the normal site still gets the normal login.
    expect(isDiscordLaunch('spellstick.games.darkspace.press', '?frame_id=f')).toBe(false);
    expect(isDiscordLaunch('evil.example', '?frame_id=f')).toBe(false);
    expect(isDiscordLaunch('discordsays.com.evil.example', '?frame_id=f')).toBe(false);
  });

  it('is off outside a browser, and then presence does nothing', () => {
    expect(IN_DISCORD).toBe(false);
    expect(() => setDiscordPresence(MENU_PRESENCE)).not.toThrow();
  });
});

describe('Discord Activity: what the profile shows', () => {
  const home = TEAMS[DEFAULT_HOME].name;
  const away = TEAMS[DEFAULT_AWAY].name;
  const teams = { home: DEFAULT_HOME, away: DEFAULT_AWAY };

  it('menus and training', () => {
    expect(MENU_PRESENCE).toEqual({ details: 'In the menu' });
    expect(trainingPresence('Pass')).toEqual({ details: 'Training', state: 'Pass' });
  });

  it('a match in progress: the teams, the period (or overtime), the score, and the start time', () => {
    expect(matchPresence({ ...teams, score: [3, 2], period: 2, periods: 4 }, 1000)).toEqual({
      details: `${home} vs ${away}`,
      state: 'Period 2 · 3–2',
      startedAt: 1000,
    });
    expect(matchPresence({ ...teams, score: [5, 5], period: 5, periods: 4 }, 1000).state).toBe(
      'Overtime · 5–5',
    );
  });

  it("a finished match, from the player's (home) side", () => {
    expect(resultPresence({ ...teams, score: [6, 4] })).toEqual({
      details: `${home} vs ${away}`,
      state: 'Won 6–4',
    });
    expect(resultPresence({ ...teams, score: [2, 3] }).state).toBe('Lost 2–3');
  });
});
