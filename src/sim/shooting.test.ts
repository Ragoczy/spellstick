import { describe, expect, it } from 'vitest';
import { chargeFraction, shotSpeed, tapTicks } from './actions';
import { arenaGeometry } from './arena';
import { saveChance } from './ball';
import { makeConfig, type SimConfig } from './config';
import { createMatch, stepMatch } from './match';
import type { InputCommand, MatchState, RosterEntry } from './types';

const cmd = (aim: { x: number; y: number }, primary: boolean, move = { x: 0, y: 0 }): InputCommand => ({
  move,
  aim,
  primary,
});

function shooterAt(
  pos: { x: number; y: number },
  extra: RosterEntry[] = [],
  config: SimConfig = makeConfig(),
  seed = 1,
) {
  const state = createMatch(config, seed, [{ team: 0, number: 7, pos }, ...extra]);
  state.ball.carrier = 0;
  return { state, config };
}

/** Holds the button `ticks` ticks, then releases. */
function shoot(
  state: MatchState,
  config: SimConfig,
  aim: { x: number; y: number },
  ticks: number,
  others: InputCommand[] = [],
) {
  for (let i = 0; i < ticks; i++) stepMatch(state, [cmd(aim, true), ...others], config);
  stepMatch(state, [cmd(aim, false), ...others], config);
}

function runFor(state: MatchState, config: SimConfig, ticks: number, inputs: InputCommand[] = []) {
  const events: MatchState['events'] = [];
  for (let i = 0; i < ticks && state.phase === 'live'; i++) {
    stepMatch(state, inputs, config);
    events.push(...state.events);
  }
  return events;
}

const awayGoal = () => arenaGeometry(makeConfig()).goals[1];

describe('shooting', () => {
  it('holding past the tap window fires a shot on release', () => {
    const { state, config } = shooterAt({ x: 10, y: 0 });
    shoot(state, config, awayGoal().mouth, tapTicks(config) + 5);
    expect(state.ball.flight?.kind).toBe('shot');
    expect(state.events.some((e) => e.type === 'shot')).toBe(true);
  });

  it('charge scales from min to max speed', () => {
    const config = makeConfig();
    expect(chargeFraction(tapTicks(config), config)).toBe(0);
    expect(chargeFraction(10_000, config)).toBe(1);
    expect(shotSpeed(0, config)).toBe(config.shot.minSpeed);
    expect(shotSpeed(1, config)).toBe(config.shot.maxSpeed);
    const quick = shooterAt({ x: 10, y: 0 }, [], config);
    shoot(quick.state, config, awayGoal().mouth, tapTicks(config) + 1);
    const full = shooterAt({ x: 10, y: 0 }, [], config);
    shoot(full.state, config, awayGoal().mouth, 120);
    const v = (s: MatchState) => Math.hypot(s.ball.vel.x, s.ball.vel.y);
    expect(v(full.state)).toBeGreaterThan(v(quick.state) + 8);
  });

  it('charging a shot slows the carrier', () => {
    const { state, config } = shooterAt({ x: -10, y: 0 });
    for (let i = 0; i < 50; i++) stepMatch(state, [cmd({ x: 20, y: 0 }, true, { x: 1, y: 0 })], config);
    const max =
      config.player.maxSpeed * config.player.carrySpeedMultiplier * config.shot.chargeMoveMultiplier;
    expect(Math.hypot(state.players[0]!.vel.x, state.players[0]!.vel.y)).toBeCloseTo(max, 3);
  });

  it('a shot into an empty net scores, credits the shooter, and pauses play', () => {
    const { state, config } = shooterAt({ x: 15, y: 0 });
    shoot(state, config, awayGoal().mouth, 40);
    const events = runFor(state, config, 120);
    const goal = events.find((e) => e.type === 'goal');
    expect(goal).toEqual({ type: 'goal', team: 0, scorer: 0 });
    expect(state.score).toEqual([1, 0]);
    expect(state.phase).toBe('goalPause');
  });

  it('after the goal pause, play restarts from the start positions', () => {
    const { state, config } = shooterAt({ x: 15, y: 0 });
    shoot(state, config, awayGoal().mouth, 40);
    runFor(state, config, 120);
    const clock = state.periodTicksLeft;
    const pause = Math.round(config.match.goalPauseSeconds * config.tickHz);
    for (let i = 0; i < pause; i++) stepMatch(state, [], config);
    expect(state.phase).toBe('live');
    expect(state.periodTicksLeft).toBe(clock); // the clock stopped during the pause
    expect(state.players[0]!.pos).toEqual({ x: 15, y: 0 });
    expect(state.ball.carrier).toBeNull();
    expect(state.ball.pos).toEqual({ x: 0, y: 0 });
  });

  it('a shot off the post bounces out, no goal', () => {
    const goal = awayGoal();
    const { state, config } = shooterAt({ x: 15, y: goal.width / 2 });
    // Aim at the post itself: straight along the side bar's line.
    shoot(state, config, { x: goal.mouth.x, y: goal.width / 2 }, 40);
    // Remove aim error for this test.
    state.ball.vel = { x: 25, y: 0 };
    state.ball.pos.y = goal.width / 2;
    const events = runFor(state, config, 60);
    expect(events.some((e) => e.type === 'post')).toBe(true);
    expect(state.score).toEqual([0, 0]);
  });

  it('a ball cannot score from behind the goal', () => {
    const goal = awayGoal();
    const { state, config } = shooterAt({ x: goal.mouth.x + 3, y: 0 });
    state.players[0]!.pos = { x: goal.mouth.x + 3, y: 4 };
    state.ball.carrier = null;
    state.ball.pos = { x: goal.mouth.x + goal.depth + 0.5, y: 0 };
    state.ball.vel = { x: -20, y: 0 };
    runFor(state, config, 30);
    expect(state.score).toEqual([0, 0]);
  });

  it('a runner body can block a shot', () => {
    const config = makeConfig({ shot: { blockChance: 1 } });
    const { state } = shooterAt({ x: 10, y: 0 }, [{ team: 1, number: 9, pos: { x: 15, y: 0 } }], config);
    shoot(state, config, awayGoal().mouth, 30);
    state.ball.vel = { x: 25, y: 0 }; // no aim error
    state.ball.pos.y = 0;
    const events = runFor(state, config, 60);
    expect(events.some((e) => e.type === 'block' && e.playerId === 1)).toBe(true);
    expect(state.score).toEqual([0, 0]);
  });

  it("teammates don't block their own team's shots", () => {
    const config = makeConfig({ shot: { blockChance: 1 } });
    const { state } = shooterAt({ x: 10, y: 0 }, [{ team: 0, number: 12, pos: { x: 15, y: 0 } }], config);
    shoot(state, config, awayGoal().mouth, 30, [cmd({ x: 0, y: 0 }, false)]);
    state.ball.vel = { x: 25, y: 0 };
    state.ball.pos.y = 0;
    const events = runFor(state, config, 60);
    expect(events.some((e) => e.type === 'block')).toBe(false);
    expect(state.score).toEqual([1, 0]);
  });
});

describe('goalie saves', () => {
  const goalie = (): RosterEntry => ({
    team: 1,
    number: 1,
    pos: { x: awayGoal().mouth.x - 1, y: 0 },
    role: 'goalie',
  });

  it('save chance falls with shot speed, offset from the goalie, and closeness', () => {
    const config = makeConfig();
    const state = createMatch(config, 1, [goalie()]);
    const g = state.players[0]!;
    const far = { x: g.pos.x - 10, y: 0 };
    const near = { x: g.pos.x - 2, y: 0 };
    expect(saveChance(g, 0, 18, far, config)).toBeGreaterThan(saveChance(g, 0, 32, far, config));
    expect(saveChance(g, 0, 25, far, config)).toBeGreaterThan(saveChance(g, 1, 25, far, config));
    expect(saveChance(g, 0, 25, far, config)).toBeGreaterThan(saveChance(g, 0, 25, near, config));
  });

  it('a certain save is caught or rebounds, and never scores', () => {
    for (const catchFraction of [0, 1]) {
      const config = makeConfig({ goalie: { saveBase: 5, catchFraction } });
      const { state } = shooterAt({ x: 12, y: 0 }, [goalie()], config);
      shoot(state, config, awayGoal().mouth, 30, [cmd({ x: 0, y: 0 }, false)]);
      state.ball.vel = { x: 25, y: 0 };
      state.ball.pos.y = 0;
      const events = runFor(state, config, 60, [cmd({ x: 0, y: 0 }, false), cmd({ x: 0, y: 0 }, false)]);
      const save = events.find((e) => e.type === 'save');
      expect(save).toBeDefined();
      expect(save?.type === 'save' && save.caught).toBe(catchFraction === 1);
      if (catchFraction === 1) expect(state.ball.carrier).toBe(1);
      else expect(state.ball.vel.x).toBeLessThan(0); // rebound comes back out
      expect(state.score).toEqual([0, 0]);
    }
  });

  it('a shot out of the goalie reach goes in', () => {
    const goal = awayGoal();
    const config = makeConfig({ goalie: { saveBase: 5 } });
    const { state } = shooterAt(
      { x: 12, y: 0 },
      [{ ...goalie(), pos: { x: goal.mouth.x - 1, y: 4 } }],
      config,
    );
    shoot(state, config, goal.mouth, 30, [cmd({ x: 0, y: 0 }, false)]);
    state.ball.vel = { x: 25, y: 0 };
    state.ball.pos.y = 0;
    runFor(state, config, 60, [cmd({ x: 0, y: 0 }, false), cmd({ x: 0, y: 0 }, false)]);
    expect(state.score).toEqual([1, 0]);
  });
});
