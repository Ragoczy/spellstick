import { describe, expect, it } from 'vitest';
import { secondsToTicks } from './actions';
import { arenaGeometry } from './arena';
import { makeConfig, type SimConfig } from './config';
import { createMatch, stepMatch } from './match';
import type { InputCommand, MatchState, RosterEntry } from './types';

const cmd = (move = { x: 0, y: 0 }, extra: Partial<InputCommand> = {}): InputCommand => ({
  move,
  aim: { x: 100, y: 0 },
  ...extra,
});

function setup(roster: RosterEntry[], config: SimConfig = makeConfig(), seed = 1) {
  const state = createMatch(config, seed, roster);
  state.ball.pos = { x: 0, y: 12 }; // out of the way
  return { state, config };
}

function run(state: MatchState, config: SimConfig, ticks: number, inputs: InputCommand[] = []) {
  const events: MatchState['events'] = [];
  for (let i = 0; i < ticks; i++) {
    stepMatch(state, inputs, config);
    events.push(...state.events);
  }
  return events;
}

const checker: RosterEntry = { team: 0, number: 7, pos: { x: 0, y: 0 } };
const victim = (x: number, y = 0): RosterEntry => ({ team: 1, number: 9, pos: { x, y } });

describe('body checks (SPEC §4.5)', () => {
  it('a check dashes in the move direction at dash speed', () => {
    const { state, config } = setup([checker]);
    run(state, config, 1, [cmd({ x: 0, y: 1 }, { check: true })]);
    expect(state.players[0]!.vel.y).toBeCloseTo(config.check.dashSpeed, 5);
    expect(state.players[0]!.vel.x).toBeCloseTo(0, 5);
  });

  it('with no move input, the dash goes where the stick points', () => {
    const { state, config } = setup([checker]);
    run(state, config, 1, [{ move: { x: 0, y: 0 }, aim: { x: -10, y: 0 }, check: true }]);
    expect(state.players[0]!.vel.x).toBeCloseTo(-config.check.dashSpeed, 5);
  });

  it('has a cooldown', () => {
    const { state, config } = setup([checker]);
    run(state, config, 1, [cmd({ x: 1, y: 0 }, { check: true })]);
    run(state, config, 30, [cmd()]);
    expect(state.players[0]!.checkCooldown).toBeGreaterThan(0);
    run(state, config, 1, [cmd({ x: 0, y: 1 }, { check: true })]);
    expect(state.players[0]!.dashTicks).toBe(0); // refused
    run(state, config, secondsToTicks(config.check.cooldownSeconds, config), [cmd()]);
    run(state, config, 1, [cmd({ x: 0, y: 1 }, { check: true })]);
    expect(state.players[0]!.vel.y).toBeCloseTo(config.check.dashSpeed, 5);
  });

  it('a hit knocks the target back along the dash and staggers them', () => {
    const { state, config } = setup([checker, victim(1.6)]);
    const events = run(state, config, 10, [cmd({ x: 1, y: 0 }, { check: true }), cmd()]);
    const hit = events.find((e) => e.type === 'check');
    expect(hit).toMatchObject({ playerId: 0, targetId: 1, team: 0 });
    const v = state.players[1]!;
    expect(v.pos.x).toBeGreaterThan(1.8);
    expect(v.staggerTicks).toBeGreaterThan(0);
  });

  it('a staggered player ignores their inputs', () => {
    const { state, config } = setup([checker, victim(1.6)]);
    run(state, config, 4, [cmd({ x: 1, y: 0 }, { check: true }), cmd()]);
    expect(state.players[1]!.staggerTicks).toBeGreaterThan(0);
    const y0 = state.players[1]!.pos.y;
    run(state, config, 10, [cmd(), cmd({ x: 0, y: 1 })]);
    expect(state.players[1]!.pos.y).toBeCloseTo(y0, 5);
  });

  it('hits from behind are legal (canon)', () => {
    const { state, config } = setup([checker, victim(1.6)]);
    state.players[1]!.facing = 0; // facing away from the checker
    const events = run(state, config, 10, [cmd({ x: 1, y: 0 }, { check: true }), cmd({ x: 1, y: 0 })]);
    expect(events.some((e) => e.type === 'check')).toBe(true);
  });

  it('a hit on the carrier can knock the ball loose (config chance)', () => {
    const config = makeConfig({ check: { looseChance: 1 } });
    const { state } = setup([checker, victim(1.6)], config);
    state.ball.carrier = 1;
    const events = run(state, config, 10, [cmd({ x: 1, y: 0 }, { check: true }), cmd()]);
    expect(events.find((e) => e.type === 'check')).toMatchObject({ loosened: true });
    expect(state.ball.carrier).not.toBe(1);
  });

  it('with no loose chance the carrier keeps the ball but is still staggered', () => {
    const config = makeConfig({ check: { looseChance: 0 } });
    const { state } = setup([checker, victim(1.6)], config);
    state.ball.carrier = 1;
    run(state, config, 4, [cmd({ x: 1, y: 0 }, { check: true }), cmd()]);
    expect(state.ball.carrier).toBe(1);
    expect(state.players[1]!.staggerTicks).toBeGreaterThan(0);
  });

  it('a hit cancels a shot being wound up', () => {
    const config = makeConfig({ check: { looseChance: 0 } });
    const { state } = setup([checker, victim(2.2)], config);
    state.ball.carrier = 1;
    run(state, config, 30, [cmd(), cmd({ x: 0, y: 0 }, { primary: true })]);
    expect(state.players[1]!.primaryTicks).toBeGreaterThan(20);
    run(state, config, 12, [cmd({ x: 1, y: 0 }, { check: true }), cmd({ x: 0, y: 0 }, { primary: true })]);
    expect(state.players[1]!.primaryTicks).toBe(0);
  });

  it('teammates are not hit', () => {
    const { state, config } = setup([checker, { team: 0, number: 12, pos: { x: 1.6, y: 0 } }]);
    const events = run(state, config, 10, [cmd({ x: 1, y: 0 }, { check: true }), cmd()]);
    expect(events.some((e) => e.type === 'check')).toBe(false);
  });

  it('a dash that reaches nobody does nothing', () => {
    const { state, config } = setup([checker, victim(8)]);
    const events = run(state, config, 20, [cmd({ x: 1, y: 0 }, { check: true }), cmd()]);
    expect(events.some((e) => e.type === 'check')).toBe(false);
  });

  it('two players who check each other on the same tick both land', () => {
    const { state, config } = setup([checker, victim(2.2)]);
    const events = run(state, config, 10, [
      cmd({ x: 1, y: 0 }, { check: true }),
      cmd({ x: -1, y: 0 }, { check: true }),
    ]);
    expect(events.filter((e) => e.type === 'check')).toHaveLength(2);
  });

  it('slamming someone into the boards staggers them longer', () => {
    const config = makeConfig();
    const half = arenaGeometry(config).halfWidth;
    const { state } = setup([
      { team: 0, number: 7, pos: { x: 0, y: half - 2.6 } },
      { team: 1, number: 9, pos: { x: 0, y: half - 1.0 } },
    ]);
    const events = run(state, config, 20, [cmd({ x: 0, y: 1 }, { check: true }), cmd()]);
    expect(events.some((e) => e.type === 'boardSlam' && e.playerId === 1)).toBe(true);
  });
});

describe('goalie protection (SPEC §4.6)', () => {
  const config = makeConfig();
  const goal = arenaGeometry(config).goals[1];

  it('a goalie in their crease cannot be checked: the checker bounces off', () => {
    const { state } = setup([
      { team: 0, number: 7, pos: { x: goal.mouth.x - 3.5, y: 0 } },
      { team: 1, number: 1, pos: { x: goal.mouth.x - 1.5, y: 0 }, role: 'goalie' },
    ]);
    const events = run(state, config, 10, [cmd({ x: 1, y: 0 }, { check: true }), cmd()]);
    expect(events.some((e) => e.type === 'checkBounce' && e.playerId === 0 && e.goalieId === 1)).toBe(true);
    expect(events.some((e) => e.type === 'check')).toBe(false);
    expect(state.players[1]!.staggerTicks).toBe(0);
    expect(state.players[0]!.staggerTicks).toBeGreaterThan(0);
    expect(state.players[0]!.vel.x).toBeLessThan(0);
  });

  it('a goalie who wanders out of the crease can be hit', () => {
    const { state } = setup([
      { team: 0, number: 7, pos: { x: goal.mouth.x - 8, y: 0 } },
      { team: 1, number: 1, pos: { x: goal.mouth.x - 6, y: 0 }, role: 'goalie' },
    ]);
    const events = run(state, config, 10, [cmd({ x: 1, y: 0 }, { check: true }), cmd()]);
    expect(events.some((e) => e.type === 'check' && e.targetId === 1)).toBe(true);
  });
});
