import { describe, expect, it } from 'vitest';
import { ANNOUNCER, CANON_EXCLAMATIONS, clipId } from '../content/announcer';
import { createMatch, makeConfig, matchRoster, type SimEvent } from '../sim';
import { Announcer } from './announcer';
import { emptyTally, tallyEvents } from './matchStats';

const config = makeConfig();
const state = () => createMatch(config, 1, matchRoster(config));
const kindOf = (events: SimEvent[], s = state()) => Announcer.classify(events, s, config, 0)?.kind ?? null;
const sideOf = (events: SimEvent[], s = state()) => Announcer.classify(events, s, config, 0)?.side ?? null;

describe('announcer (SPEC §8)', () => {
  it('uses every canon exclamation somewhere in its lines', () => {
    const all = Object.values(ANNOUNCER)
      .flat()
      .map((l) => l.text)
      .join(' ');
    for (const phrase of CANON_EXCLAMATIONS) expect(all).toContain(phrase.replace(/!$/, ''));
  });

  it('calls goals, saves, big hits, and turnovers', () => {
    expect(kindOf([{ type: 'goal', team: 0, scorer: 1 }])).toBe('goal');
    expect(kindOf([{ type: 'save', playerId: 0, team: 0, caught: true }])).toBe('save');
    expect(kindOf([{ type: 'boardSlam', playerId: 1, speed: 3 }])).toBe('bigHit');
    expect(kindOf([{ type: 'catch', playerId: 1, team: 0, intercepted: true }])).toBe('turnover');
    expect(kindOf([{ type: 'shotClockViolation', team: 0 }])).toBe('shotClock');
    expect(kindOf([{ type: 'pass', playerId: 1, team: 0, target: null }])).toBeNull();
  });

  it('a goal outranks anything else on the same tick, and an overtime goal gets its own call', () => {
    const s = state();
    const events: SimEvent[] = [
      { type: 'boardSlam', playerId: 1, speed: 3 },
      { type: 'goal', team: 1, scorer: 6 },
    ];
    expect(kindOf(events, s)).toBe('goal');
    s.period = config.match.periods + 1;
    expect(kindOf(events, s)).toBe('overtimeWinner');
  });

  it('a hit in a crowd is "third-witch in" (canon)', () => {
    const s = state();
    const runners = s.players.filter((p) => p.role === 'runner');
    runners.slice(0, 4).forEach((p, i) => (p.pos = { x: i * 0.8, y: 0 }));
    const events: SimEvent[] = [
      { type: 'check', playerId: runners[1]!.id, targetId: runners[0]!.id, team: 0, loosened: false },
    ];
    expect(kindOf(events, s)).toBe('pileup');
    expect(ANNOUNCER.pileup.some((l) => l.text.startsWith('Third-witch in'))).toBe(true);
  });
});

describe('announcer takes sides: angry when the moment favors the opponent (Paul, 2026-10-10)', () => {
  const s = state();
  const home = s.players.find((p) => p.team === 0 && p.role === 'runner')!;
  const away = s.players.find((p) => p.team === 1 && p.role === 'runner')!;

  it('goals and overtime winners: for when we score, against when they do', () => {
    expect(sideOf([{ type: 'goal', team: 0, scorer: home.id }], s)).toBe('for');
    expect(sideOf([{ type: 'goal', team: 1, scorer: away.id }], s)).toBe('against');
  });

  it('saves and Ward blocks: for our goalie, against when theirs robs us', () => {
    expect(sideOf([{ type: 'save', playerId: 0, team: 0, caught: true }], s)).toBe('for');
    expect(sideOf([{ type: 'save', playerId: 5, team: 1, caught: false }], s)).toBe('against');
    expect(sideOf([{ type: 'wardBlock', goalieId: 5, team: 1 }], s)).toBe('against');
  });

  it('hits: for when we land them, against when one of ours gets flattened', () => {
    expect(
      sideOf([{ type: 'check', playerId: home.id, targetId: away.id, team: 0, loosened: true }], s),
    ).toBe('for');
    expect(
      sideOf([{ type: 'check', playerId: away.id, targetId: home.id, team: 1, loosened: true }], s),
    ).toBe('against');
    expect(sideOf([{ type: 'boardSlam', playerId: home.id, speed: 3 }], s)).toBe('against');
    expect(sideOf([{ type: 'boardSlam', playerId: away.id, speed: 3 }], s)).toBe('for');
  });

  it('turnovers and violations: against when we lose the ball or break the rule', () => {
    expect(sideOf([{ type: 'catch', playerId: away.id, team: 1, intercepted: true }], s)).toBe('against');
    expect(sideOf([{ type: 'hexShove', playerId: home.id, hits: [away.id], loosened: true }], s)).toBe('for');
    expect(sideOf([{ type: 'shotClockViolation', team: 0 }], s)).toBe('against');
    expect(sideOf([{ type: 'shotClockViolation', team: 1 }], s)).toBe('for');
    expect(sideOf([{ type: 'creaseViolation', playerId: home.id, team: 0 }], s)).toBe('against');
    expect(sideOf([{ type: 'goalDisallowed', team: 1, attackerId: away.id }], s)).toBe('for');
  });

  it('the angry take is <id>-against', () => {
    expect(clipId('goal-01', 'against')).toBe('goal-01-against');
    expect(clipId('goal-01', 'for')).toBe('goal-01');
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
