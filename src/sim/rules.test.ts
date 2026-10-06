import { describe, expect, it } from 'vitest';
import { secondsToTicks } from './actions';
import { arenaGeometry } from './arena';
import { makeConfig, type SimConfig } from './config';
import { createMatch, stepMatch } from './match';
import { matchRoster } from './roster';
import { faceoffTaker, setupFaceoff } from './rules';
import type { InputCommand, MatchState, RosterEntry, SimEvent } from './types';

const idle = (): InputCommand => ({ move: { x: 0, y: 0 }, aim: { x: 0, y: 0 } });
const press = (): InputCommand => ({ ...idle(), primary: true });

function run(state: MatchState, config: SimConfig, ticks: number, inputs: (InputCommand | undefined)[] = []) {
  const events: SimEvent[] = [];
  for (let i = 0; i < ticks; i++) {
    stepMatch(state, inputs, config);
    events.push(...state.events);
  }
  return events;
}

/** Runs until `pred` or `max` ticks; returns the events seen. */
function runUntil(state: MatchState, config: SimConfig, pred: (s: MatchState) => boolean, max = 100_000) {
  const events: SimEvent[] = [];
  for (let i = 0; i < max && !pred(state); i++) {
    stepMatch(state, [], config);
    events.push(...state.events);
  }
  return events;
}

const fullMatch = (config: SimConfig, seed = 1) =>
  createMatch(config, seed, matchRoster(config), { start: 'faceoff' });

/** Inputs where only player `id` presses. */
function pressBy(state: MatchState, id: number): InputCommand[] {
  return state.players.map((p) => (p.id === id ? press() : idle()));
}

describe('faceoffs (SPEC §4.1)', () => {
  it('a match opens with the two takers locked at center and everyone else in their half', () => {
    const config = makeConfig();
    const state = fullMatch(config);
    expect(state.phase).toBe('faceoff');
    const [home, away] = state.faceoff!.takers;
    expect(state.players[home]!.pos).toEqual({ x: -config.faceoff.takerOffset, y: 0 });
    expect(state.players[away]!.pos).toEqual({ x: config.faceoff.takerOffset, y: 0 });
    expect(state.ball.pos).toEqual({ x: 0, y: 0 });
    for (const p of state.players) {
      if (p.id === home || p.id === away) continue;
      expect(Math.sign(p.pos.x)).toBe(p.team === 0 ? -1 : 1);
    }
  });

  it('the whistle blows at a random moment inside the configured window', () => {
    const config = makeConfig();
    const whistles = new Set<number>();
    for (let seed = 1; seed <= 20; seed++) {
      const state = fullMatch(config, seed);
      const at = state.faceoff!.whistleAt;
      expect(at).toBeGreaterThanOrEqual(secondsToTicks(config.faceoff.minDelaySeconds, config));
      expect(at).toBeLessThanOrEqual(secondsToTicks(config.faceoff.maxDelaySeconds, config));
      whistles.add(at);
      const events = runUntil(state, config, (s) => s.faceoff?.whistled === true);
      expect(events.some((e) => e.type === 'whistle')).toBe(true);
      expect(state.faceoff!.ticks).toBe(at);
    }
    expect(whistles.size).toBeGreaterThan(5);
  });

  it('nobody moves during a faceoff', () => {
    const config = makeConfig();
    const state = fullMatch(config);
    const before = state.players.map((p) => ({ ...p.pos }));
    run(
      state,
      config,
      30,
      state.players.map(() => ({ move: { x: 1, y: 1 }, aim: { x: 0, y: 0 } })),
    );
    expect(state.players.map((p) => p.pos)).toEqual(before);
  });

  it('after the whistle, the first taker to press wins the ball', () => {
    const config = makeConfig();
    const state = fullMatch(config);
    const away = state.faceoff!.takers[1];
    runUntil(state, config, (s) => s.faceoff?.whistled === true);
    const events = run(state, config, 1, pressBy(state, away));
    expect(events.find((e) => e.type === 'faceoffWin')).toMatchObject({
      team: 1,
      playerId: away,
      reason: 'faster',
    });
    expect(state.phase).toBe('live');
    expect(state.ball.carrier).toBe(away);
    expect(state.shotClock.team).toBe(1);
  });

  it('pressing before the whistle is a misfire and loses', () => {
    const config = makeConfig();
    const state = fullMatch(config);
    const home = state.faceoff!.takers[0];
    const away = state.faceoff!.takers[1];
    run(state, config, 5);
    const events = run(state, config, 1, pressBy(state, home));
    expect(events.find((e) => e.type === 'faceoffWin')).toMatchObject({
      team: 1,
      playerId: away,
      reason: 'misfire',
    });
    expect(state.ball.carrier).toBe(away);
  });

  it('a button held from before the faceoff does not count as a press', () => {
    const config = makeConfig();
    const state = fullMatch(config);
    const home = state.faceoff!.takers[0];
    state.players[home]!.primaryDown = true; // was already holding it
    const events = run(state, config, 10, pressBy(state, home));
    expect(events.some((e) => e.type === 'faceoffWin')).toBe(false);
  });

  it('non-takers pressing does nothing', () => {
    const config = makeConfig();
    const state = fullMatch(config);
    const bystander = state.players.find(
      (p) => p.role === 'runner' && !state.faceoff!.takers.includes(p.id),
    )!;
    const events = run(state, config, 5, pressBy(state, bystander.id));
    expect(events.some((e) => e.type === 'faceoffWin')).toBe(false);
  });

  it('simultaneous presses split fairly between the teams', () => {
    const config = makeConfig();
    const wins = [0, 0];
    for (let seed = 1; seed <= 200; seed++) {
      const state = fullMatch(config, seed);
      runUntil(state, config, (s) => s.faceoff?.whistled === true);
      const [h, a] = state.faceoff!.takers;
      const inputs = state.players.map((p) => (p.id === h || p.id === a ? press() : idle()));
      const e = run(state, config, 1, inputs).find((x) => x.type === 'faceoffWin');
      if (e?.type === 'faceoffWin' && e.team !== null) wins[e.team]!++;
    }
    expect(wins[0]! + wins[1]!).toBe(200);
    expect(wins[0]).toBeGreaterThan(70);
    expect(wins[1]).toBeGreaterThan(70);
  });

  it('if nobody presses, the ball is dropped loose and play goes on', () => {
    const config = makeConfig();
    const state = fullMatch(config);
    const events = runUntil(state, config, (s) => s.phase === 'live');
    expect(events.find((e) => e.type === 'faceoffWin')).toMatchObject({ team: null, reason: 'timeout' });
    expect(state.ball.carrier).toBeNull();
  });

  it('the faceoff taker is an attack-leaning runner', () => {
    const config = makeConfig();
    const state = fullMatch(config);
    expect(faceoffTaker(state, 0)).toMatchObject({ role: 'runner', lean: 'attack', team: 0 });
  });
});

describe('periods and overtime (SPEC §3, §4.8)', () => {
  const short = makeConfig({
    match: { periods: 4, periodSeconds: 2, periodBreakSeconds: 1, overtimeSeconds: 2 },
  });

  it('four periods with a faceoff and a break between each; the clock only runs in live play', () => {
    const state = fullMatch(short);
    state.score = [1, 0]; // not tied, so no overtime
    const events = runUntil(state, short, (s) => s.phase === 'final');
    expect(events.filter((e) => e.type === 'periodEnd').map((e) => (e as { period: number }).period)).toEqual(
      [1, 2, 3, 4],
    );
    expect(
      events.filter((e) => e.type === 'periodStart').map((e) => (e as { period: number }).period),
    ).toEqual([2, 3, 4]);
    expect(events.filter((e) => e.type === 'faceoffSet')).toHaveLength(3); // the opener was set at creation
    expect(events.some((e) => e.type === 'matchEnd')).toBe(true);
    // 4 periods of play + 3 breaks + 4 faceoffs (each waiting out its timeout) is longer than play alone.
    expect(state.tick).toBeGreaterThan(4 * secondsToTicks(2, short) + 3 * secondsToTicks(1, short));
  });

  it('the period break freezes both clocks', () => {
    const state = fullMatch(short);
    runUntil(state, short, (s) => s.phase === 'periodBreak');
    const clock = state.periodTicksLeft;
    run(state, short, 10);
    expect(state.phase).toBe('periodBreak');
    expect(state.periodTicksLeft).toBe(clock);
  });

  it('tied after regulation: sudden-death overtime with a faceoff', () => {
    const state = fullMatch(short);
    const events = runUntil(state, short, (s) => s.period === 5 && s.phase === 'faceoff');
    expect(events.find((e) => e.type === 'periodStart' && e.period === 5)).toMatchObject({ overtime: true });
    expect(state.phase).toBe('faceoff');
  });

  it('an overtime period that ends tied is followed by another one', () => {
    const state = fullMatch(short);
    runUntil(state, short, (s) => s.period === 6);
    expect(state.period).toBe(6);
    expect(state.phase).not.toBe('final');
  });

  it('the first goal in overtime wins it', () => {
    const config = short;
    const state = fullMatch(config);
    runUntil(state, config, (s) => s.period === 5 && s.phase === 'live');
    // Put the ball in the away net.
    const goal = arenaGeometry(config).goals[1];
    state.ball = {
      pos: { x: goal.mouth.x - 0.5, y: 0 },
      vel: { x: 10, y: 0 },
      carrier: null,
      flight: null,
      lastTouch: null,
    };
    for (const p of state.players) if (p.role === 'goalie') p.pos.y = 5; // out of the way
    const events = runUntil(state, config, (s) => s.phase === 'final', 600);
    expect(events.some((e) => e.type === 'goal' && e.team === 0)).toBe(true);
    expect(state.phase).toBe('final');
    expect(state.score).toEqual([1, 0]);
  });

  it('a regulation goal is followed by a faceoff', () => {
    const config = makeConfig();
    const state = fullMatch(config);
    runUntil(state, config, (s) => s.phase === 'live');
    const goal = arenaGeometry(config).goals[1];
    state.ball = {
      pos: { x: goal.mouth.x - 0.5, y: 0 },
      vel: { x: 10, y: 0 },
      carrier: null,
      flight: null,
      lastTouch: null,
    };
    for (const p of state.players) if (p.role === 'goalie') p.pos.y = 5;
    runUntil(state, config, (s) => s.phase === 'goalPause', 60);
    const events = runUntil(state, config, (s) => s.phase === 'faceoff', 1000);
    expect(events.some((e) => e.type === 'faceoffSet')).toBe(true);
  });
});

describe('shot clock (SPEC §4.3)', () => {
  const config = makeConfig({ shotClock: { seconds: 2 } });
  const roster: RosterEntry[] = [
    { team: 0, number: 7, pos: { x: 0, y: 0 } },
    { team: 1, number: 9, pos: { x: 6, y: 6 } },
    { team: 1, number: 1, pos: { x: 23.5, y: 0 }, role: 'goalie' },
  ];
  const setup = () => {
    const state = createMatch(config, 1, roster);
    return state;
  };

  it('starts when a team gains possession', () => {
    const state = setup();
    state.ball.pos = { x: 0.5, y: 0 };
    run(state, config, 5, [idle()]);
    expect(state.ball.carrier).toBe(0);
    expect(state.shotClock.team).toBe(0);
    expect(state.shotClock.ticksLeft).toBeLessThan(secondsToTicks(2, config));
  });

  it('on expiry, possession turns over at the spot', () => {
    const state = setup();
    state.ball.pos = { x: 0.5, y: 0 };
    const events = run(state, config, secondsToTicks(2, config) + 5, [idle(), idle(), idle()]);
    expect(events.find((e) => e.type === 'shotClockViolation')).toMatchObject({ team: 0 });
    expect(state.ball.carrier).toBe(1); // the nearest opposing runner
    expect(state.shotClock.team).toBe(1);
  });

  it('a regained loose ball by the same team does not reset it; a change of possession does', () => {
    const state = setup();
    state.ball.pos = { x: 0.5, y: 0 };
    run(state, config, 30, [idle()]);
    const left = state.shotClock.ticksLeft;
    run(state, config, 1, [{ ...idle(), debugDrop: true }]);
    run(state, config, 60, [{ move: { x: 1, y: 0 }, aim: { x: 10, y: 0 } }]);
    expect(state.shotClock.team).toBe(0);
    expect(state.shotClock.ticksLeft).toBeLessThan(left);
  });

  it('a shot off the goalie resets it', () => {
    const cfg = makeConfig({ shotClock: { seconds: 2 }, goalie: { saveBase: 5, catchFraction: 0 } });
    const state = createMatch(cfg, 1, [
      { team: 0, number: 7, pos: { x: 14, y: 0 } },
      { team: 1, number: 1, pos: { x: 23.5, y: 0 }, role: 'goalie' },
    ]);
    state.ball.carrier = 0;
    state.shotClock = { team: 0, ticksLeft: 50 };
    const aim = { x: 25, y: 0 };
    run(state, cfg, 30, [{ move: { x: 0, y: 0 }, aim, primary: true }]);
    const events = run(state, cfg, 40, [{ move: { x: 0, y: 0 }, aim }]);
    expect(events.some((e) => e.type === 'save')).toBe(true);
    expect(state.shotClock.ticksLeft).toBeGreaterThan(secondsToTicks(2, cfg) - 40);
  });

  it('a shot already in the air when it hits zero gets to finish', () => {
    const state = setup();
    const goal = arenaGeometry(config).goals[1];
    state.players[2]!.pos.y = 6; // goalie out of the way
    state.ball = {
      pos: { x: goal.mouth.x - 8, y: 0 },
      vel: { x: 25, y: 0 },
      carrier: null,
      lastTouch: 0,
      flight: {
        kind: 'shot',
        by: 0,
        team: 0,
        target: null,
        ticks: 0,
        maxTicks: 80,
        from: { x: goal.mouth.x - 8, y: 0 },
      },
    };
    state.shotClock = { team: 0, ticksLeft: 1 };
    const events = run(state, config, 30, [idle(), idle(), idle()]);
    expect(events.some((e) => e.type === 'shotClockViolation')).toBe(false);
    expect(events.some((e) => e.type === 'goal')).toBe(true);
  });
});

describe('crease (SPEC §4.4)', () => {
  const config = makeConfig();
  const goal = arenaGeometry(config).goals[1];
  const roster: RosterEntry[] = [
    { team: 0, number: 7, pos: { x: goal.mouth.x - 4, y: 0 } },
    { team: 1, number: 1, pos: { x: goal.mouth.x - 1, y: 0 }, role: 'goalie' },
    { team: 1, number: 9, pos: { x: 0, y: 5 } },
  ];

  it('a carrier who steps into the opponent crease turns it over to the goalie', () => {
    const state = createMatch(config, 1, roster);
    state.ball.carrier = 0;
    const events = run(state, config, 40, [{ move: { x: 1, y: 0.3 }, aim: { x: 30, y: 0 } }, idle(), idle()]);
    expect(events.find((e) => e.type === 'creaseViolation')).toMatchObject({ playerId: 0, team: 0 });
    expect(state.ball.carrier).toBe(1);
  });

  it('a defender may stand in their own crease with the ball', () => {
    const state = createMatch(config, 1, [
      { team: 1, number: 9, pos: { x: goal.mouth.x - 1.5, y: 1.5 } },
      { team: 0, number: 7, pos: { x: 0, y: 0 } },
    ]);
    state.ball.carrier = 0;
    const events = run(state, config, 30, [idle(), idle()]);
    expect(events.some((e) => e.type === 'creaseViolation')).toBe(false);
    expect(state.ball.carrier).toBe(0);
  });

  it('a goal scored with an attacker in the crease is disallowed and turned over', () => {
    const state = createMatch(config, 1, [
      { team: 0, number: 7, pos: { x: goal.mouth.x - 2, y: 2 } }, // inside the crease, no ball
      { team: 0, number: 12, pos: { x: goal.mouth.x - 10, y: 0 } },
      { team: 1, number: 1, pos: { x: goal.mouth.x - 1, y: 6 }, role: 'goalie' },
    ]);
    state.ball = {
      pos: { x: goal.mouth.x - 0.5, y: 0 },
      vel: { x: 10, y: 0 },
      carrier: null,
      flight: null,
      lastTouch: 1,
    };
    const events = run(state, config, 10, [idle(), idle(), idle()]);
    expect(events.find((e) => e.type === 'goalDisallowed')).toMatchObject({ team: 0, attackerId: 0 });
    expect(state.score).toEqual([0, 0]);
    expect(state.ball.carrier).toBe(2);
    expect(state.phase).toBe('live');
  });

  it('the same goal with the crease clear counts', () => {
    const state = createMatch(config, 1, [
      { team: 0, number: 7, pos: { x: goal.mouth.x - 5, y: 2 } },
      { team: 1, number: 1, pos: { x: goal.mouth.x - 1, y: 6 }, role: 'goalie' },
    ]);
    state.ball = {
      pos: { x: goal.mouth.x - 0.5, y: 0 },
      vel: { x: 10, y: 0 },
      carrier: null,
      flight: null,
      lastTouch: 0,
    };
    run(state, config, 10, [idle(), idle()]);
    expect(state.score).toEqual([1, 0]);
  });
});

describe('scoring (SPEC §4.8)', () => {
  it('a goal is worth one and the higher score wins', () => {
    const config = makeConfig({ match: { periods: 1, periodSeconds: 1 } });
    const state = createMatch(config, 1, matchRoster(config), { start: 'faceoff' });
    state.score = [3, 2];
    const events = runUntil(state, config, (s) => s.phase === 'final');
    expect(events.find((e) => e.type === 'matchEnd')).toMatchObject({ score: [3, 2] });
  });

  it('setupFaceoff in a drill with no opponent runners just restarts live', () => {
    const config = makeConfig();
    const state = createMatch(config, 1, [{ team: 0, number: 7, pos: { x: -4, y: 0 } }]);
    setupFaceoff(state, config);
    expect(state.phase).toBe('live');
    expect(state.faceoff).toBeNull();
  });
});
