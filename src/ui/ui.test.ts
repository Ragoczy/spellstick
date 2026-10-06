import { describe, expect, it } from 'vitest';
import { ANNOUNCER, CANON_EXCLAMATIONS } from '../content/announcer';
import { createMatch, makeConfig, matchRoster, type SimEvent } from '../sim';
import { Announcer } from './announcer';
import { emptyTally, tallyEvents } from './matchStats';

const config = makeConfig();
const state = () => createMatch(config, 1, matchRoster(config));

describe('announcer (SPEC §8)', () => {
  it('uses every canon exclamation somewhere in its lines', () => {
    const all = Object.values(ANNOUNCER).flat().join(' ');
    for (const phrase of CANON_EXCLAMATIONS) expect(all).toContain(phrase.replace(/!$/, ''));
  });

  it('calls goals, saves, big hits, and turnovers', () => {
    const s = state();
    expect(Announcer.classify([{ type: 'goal', team: 0, scorer: 1 }], s, config)).toBe('goal');
    expect(Announcer.classify([{ type: 'save', playerId: 0, team: 0, caught: true }], s, config)).toBe(
      'save',
    );
    expect(Announcer.classify([{ type: 'boardSlam', playerId: 1, speed: 3 }], s, config)).toBe('bigHit');
    expect(Announcer.classify([{ type: 'catch', playerId: 1, team: 0, intercepted: true }], s, config)).toBe(
      'turnover',
    );
    expect(Announcer.classify([{ type: 'shotClockViolation', team: 0 }], s, config)).toBe('shotClock');
    expect(Announcer.classify([{ type: 'pass', playerId: 1, team: 0, target: null }], s, config)).toBeNull();
  });

  it('a goal outranks anything else on the same tick, and an overtime goal gets its own call', () => {
    const s = state();
    const events: SimEvent[] = [
      { type: 'boardSlam', playerId: 1, speed: 3 },
      { type: 'goal', team: 1, scorer: 6 },
    ];
    expect(Announcer.classify(events, s, config)).toBe('goal');
    s.period = config.match.periods + 1;
    expect(Announcer.classify(events, s, config)).toBe('overtimeWinner');
  });

  it('a hit in a crowd is "third-witch in" (canon)', () => {
    const s = state();
    const runners = s.players.filter((p) => p.role === 'runner');
    runners.slice(0, 4).forEach((p, i) => (p.pos = { x: i * 0.8, y: 0 }));
    const kind = Announcer.classify(
      [{ type: 'check', playerId: runners[1]!.id, targetId: runners[0]!.id, team: 0, loosened: false }],
      s,
      config,
    );
    expect(kind).toBe('pileup');
    expect(ANNOUNCER.pileup.some((l) => l.startsWith('Third-witch in'))).toBe(true);
  });
});

describe('results tally (SPEC §9)', () => {
  it('counts shots, saves (incl. Ward), hits, and spells per team', () => {
    const t = emptyTally();
    tallyEvents(t, [
      { type: 'shot', playerId: 1, team: 0, speed: 20 },
      { type: 'shot', playerId: 6, team: 1, speed: 20 },
      { type: 'save', playerId: 5, team: 1, caught: false },
      { type: 'wardBlock', goalieId: 0, team: 0 },
      { type: 'check', playerId: 2, targetId: 7, team: 0, loosened: true },
      { type: 'cast', playerId: 2, team: 0, spell: 'quickstep' },
    ]);
    expect(t[0]).toEqual({ shots: 1, saves: 1, hits: 1, spells: 1 });
    expect(t[1]).toEqual({ shots: 1, saves: 1, hits: 0, spells: 0 });
  });
});
