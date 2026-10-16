import { describe, expect, it } from 'vitest';
import { ACHIEVEMENT_IDS } from '../content/badges';
import { makeConfig, SPELL_POOL, type SimEvent, type TeamIndex } from '../sim';
import { CreditTracker, type MatchCredit } from './credit';
import {
  counts,
  emptyCareer,
  evaluate,
  tierFor,
  toNextTier,
  type Career,
  type MatchRecord,
} from './evaluate';

const config = makeConfig();
/** Players 0–4 are home, 5–9 away. Home's person steers 1, away's steers 6, unless a test says otherwise. */
const TEAMS: TeamIndex[] = [0, 0, 0, 0, 0, 1, 1, 1, 1, 1];
const STEER: [number, number] = [1, 6];

function play(ticks: SimEvent[][], steered: (number | null)[] = STEER): MatchCredit {
  const t = new CreditTracker(config, TEAMS);
  for (const events of ticks) t.step(events, steered);
  return t.result();
}

const goal = (team: TeamIndex, scorer: number): SimEvent[] => [
  { type: 'shot', playerId: scorer, team, speed: 20 },
  { type: 'goal', team, scorer },
];
const end = (score: [number, number]): SimEvent[] => [{ type: 'matchEnd', score }];

function unlocked(credit: MatchCredit, side: TeamIndex = 0, career: Career = emptyCareer()) {
  return evaluate(credit, side, career, config).unlocked;
}

describe('match credit (M14)', () => {
  it('credits goals only to shots the person steered', () => {
    const c = play([goal(0, 1), goal(0, 2), goal(1, 6), end([2, 1])]);
    expect(c.seats[0].goals).toBe(1); // 2's goal was the AI's
    expect(c.seats[1].goals).toBe(1);
    expect(c.score).toEqual([2, 1]);
  });

  it('a goal counts for whoever steered the shot, even if control moved on before it went in', () => {
    const t = new CreditTracker(config, TEAMS);
    t.step([{ type: 'shot', playerId: 1, team: 0, speed: 20 }], [1, 6]);
    t.step([{ type: 'goal', team: 0, scorer: 1 }], [2, 6]);
    expect(t.result().seats[0].goals).toBe(1);
  });

  it('counts balls knocked loose by checks, Thunderclap, and Snare', () => {
    const c = play([
      [{ type: 'check', playerId: 1, targetId: 7, team: 0, loosened: true }],
      [{ type: 'check', playerId: 1, targetId: 7, team: 0, loosened: false }],
      [{ type: 'hexShove', playerId: 1, hits: [8], loosened: true }],
      [{ type: 'snare', playerId: 1, targetId: 9, loosened: true }],
      [{ type: 'check', playerId: 2, targetId: 7, team: 0, loosened: true }], // the AI's
    ]);
    expect(c.seats[0].loosens).toBe(3);
  });

  it('credits a board slam to the hit just before it, not one long ago', () => {
    const slam = (id: number): SimEvent[] => [{ type: 'boardSlam', playerId: id, speed: 9 }];
    const wait = Array.from({ length: config.tickHz * 2 }, (): SimEvent[] => []);
    const c = play([
      [{ type: 'check', playerId: 1, targetId: 7, team: 0, loosened: false }],
      slam(7),
      [{ type: 'hexShove', playerId: 1, hits: [8, 9], loosened: false }],
      slam(8),
      slam(9),
      [{ type: 'check', playerId: 1, targetId: 5, team: 0, loosened: false }],
      ...wait,
      slam(5), // too late after the hit
      slam(7), // already counted: no fresh hit
    ]);
    expect(c.seats[0].boardSlams).toBe(3);
  });

  it('collects each runner spell cast once, never the Ward, never the AI', () => {
    const cast = (playerId: number, spell: string): SimEvent[] => [
      { type: 'cast', playerId, team: TEAMS[playerId]!, spell } as SimEvent,
    ];
    const c = play([
      cast(1, 'blink'),
      cast(1, 'blink'),
      cast(1, 'snare'),
      cast(0, 'ward'),
      cast(2, 'iceWall'),
    ]);
    expect(c.seats[0].spells).toEqual(['blink', 'snare']);
  });

  it('tracks overtime and the deepest hole each side was in', () => {
    const c = play([
      goal(1, 6),
      goal(1, 7),
      goal(1, 6),
      goal(0, 1),
      [{ type: 'periodStart', period: 5, overtime: true }],
      end([1, 3]),
    ]);
    expect(c.overtime).toBe(true);
    expect(c.maxDeficit).toEqual([3, 0]);
  });
});

describe('achievements (M14)', () => {
  it('First Whistle: any counting match', () => {
    expect(unlocked(play([end([0, 2])]))).toEqual(['firstWhistle']);
  });

  it('Off the Mark: a goal of your own, not a teammate’s', () => {
    expect(unlocked(play([goal(0, 1), end([1, 3])]))).toContain('offTheMark');
    expect(unlocked(play([goal(0, 2), end([1, 3])]))).not.toContain('offTheMark');
  });

  it('First Win: winning, not a loss', () => {
    expect(unlocked(play([goal(0, 2), end([1, 0])]))).toContain('firstWin');
    expect(unlocked(play([goal(0, 2), end([1, 0])]), 1)).not.toContain('firstWin');
  });

  it("Witch's Hat Trick: three goals of your own in one match", () => {
    expect(unlocked(play([goal(0, 1), goal(0, 1), goal(0, 1), end([3, 0])]))).toContain('hatTrick');
    expect(unlocked(play([goal(0, 1), goal(0, 1), goal(0, 2), end([3, 0])]))).not.toContain('hatTrick');
  });

  it('Into the Boards: three slams in one match', () => {
    const hitAndSlam = (id: number): SimEvent[][] => [
      [{ type: 'check', playerId: 1, targetId: id, team: 0, loosened: false }],
      [{ type: 'boardSlam', playerId: id, speed: 9 }],
    ];
    expect(unlocked(play([...hitAndSlam(5), ...hitAndSlam(6), ...hitAndSlam(7), end([0, 0])]))).toContain(
      'intoTheBoards',
    );
    expect(unlocked(play([...hitAndSlam(5), ...hitAndSlam(6), end([0, 0])]))).not.toContain('intoTheBoards');
  });

  it('Light Fingers: enough balls knocked loose in one match', () => {
    const n = config.badges.loosens;
    const loose: SimEvent[] = [{ type: 'check', playerId: 1, targetId: 7, team: 0, loosened: true }];
    expect(unlocked(play([...Array<SimEvent[]>(n).fill(loose), end([0, 0])]))).toContain('lightFingers');
    expect(unlocked(play([...Array<SimEvent[]>(n - 1).fill(loose), end([0, 0])]))).not.toContain(
      'lightFingers',
    );
  });

  it('Shutout: a win with nothing conceded', () => {
    expect(unlocked(play([goal(0, 2), end([1, 0])]))).toContain('shutout');
    expect(unlocked(play([goal(0, 2), goal(0, 2), goal(1, 7), end([2, 1])]))).not.toContain('shutout');
    expect(unlocked(play([end([0, 0])]))).not.toContain('shutout'); // a draw isn't a win
  });

  it('Sudden Death: a win in overtime', () => {
    const ot: SimEvent[] = [{ type: 'periodStart', period: 5, overtime: true }];
    expect(unlocked(play([ot, goal(0, 2), end([1, 0])]))).toContain('suddenDeath');
    expect(unlocked(play([goal(0, 2), end([1, 0])]))).not.toContain('suddenDeath');
    expect(unlocked(play([ot, goal(1, 7), end([0, 1])]))).not.toContain('suddenDeath');
  });

  it('Comeback: a win after trailing by enough goals', () => {
    const n = config.badges.comebackDeficit;
    const behind = Array.from({ length: n }, () => goal(1, 7));
    const ahead = Array.from({ length: n + 1 }, () => goal(0, 2));
    expect(unlocked(play([...behind, ...ahead, end([n + 1, n])]))).toContain('comeback');
    expect(unlocked(play([...behind.slice(1), ...ahead, end([n + 1, n - 1])]))).not.toContain('comeback');
    expect(unlocked(play([...behind, end([0, n])]))).not.toContain('comeback');
  });

  it('Full Library: all ten spells across matches, not all in one', () => {
    const casts = (spells: readonly string[]): SimEvent[][] =>
      spells.map((spell) => [{ type: 'cast', playerId: 1, team: 0, spell } as SimEvent]);
    const first = evaluate(play([...casts(SPELL_POOL.slice(0, 6)), end([0, 0])]), 0, emptyCareer(), config);
    expect(first.unlocked).not.toContain('fullLibrary');
    expect(first.career.spellsCast).toHaveLength(6);
    const second = evaluate(play([...casts(SPELL_POOL.slice(5)), end([0, 0])]), 0, first.career, config);
    expect(second.unlocked).toContain('fullLibrary');
    expect(second.career.spellsCast).toHaveLength(10);
  });

  it('unlocks each achievement once and keeps a career', () => {
    const win = play([goal(0, 1), end([1, 0])]);
    const a = evaluate(win, 0, emptyCareer(), config);
    expect(a.unlocked).toEqual(['firstWhistle', 'offTheMark', 'firstWin', 'shutout']);
    const b = evaluate(win, 0, a.career, config);
    expect(b.unlocked).toEqual([]);
    expect(b.career).toMatchObject({ matches: 2, wins: 2, goals: 2 });
    expect(b.career.achievements).toEqual(a.career.achievements);
  });

  it('there are ten', () => {
    expect(ACHIEVEMENT_IDS).toHaveLength(10);
  });
});

describe('tiers (M14)', () => {
  it('rise at 1, 3, 5, 7, and 9 achievements', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => tierFor(n, config))).toEqual([
      0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5,
    ]);
    expect(toNextTier(0, config)).toBe(1);
    expect(toNextTier(4, config)).toBe(1);
    expect(toNextTier(5, config)).toBe(2);
    expect(toNextTier(9, config)).toBeNull();
  });
});

describe('which matches count (M14)', () => {
  const seat = (id: string, more: Partial<{ guest: boolean; connectedAtEnd: boolean }> = {}) => ({
    id,
    name: id,
    avatarUrl: '',
    guest: false,
    connectedAtEnd: true,
    ...more,
  });
  const record = (r: Partial<MatchRecord>): MatchRecord => ({
    final: true,
    seats: [seat('ann'), seat('bea')],
    credit: play([end([0, 0])]),
    ...r,
  });

  it('two different signed-in people, to the final whistle', () => {
    expect(counts(record({}), 0)).toBe(true);
    expect(counts(record({}), 1)).toBe(true);
  });

  it('not abandoned, not against yourself, not with a guest or an empty seat', () => {
    expect(counts(record({ final: false }), 0)).toBe(false);
    expect(counts(record({ seats: [seat('ann'), seat('ann')] }), 0)).toBe(false);
    expect(counts(record({ seats: [seat('ann'), seat('g', { guest: true })] }), 0)).toBe(false);
    expect(counts(record({ seats: [seat('ann'), null] }), 0)).toBe(false);
  });

  it('a player who quit gets nothing; the one who stayed still counts', () => {
    const r = record({ seats: [seat('ann'), seat('bea', { connectedAtEnd: false })] });
    expect(counts(r, 0)).toBe(true);
    expect(counts(r, 1)).toBe(false);
  });
});
