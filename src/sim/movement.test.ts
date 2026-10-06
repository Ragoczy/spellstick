import { describe, expect, it } from 'vitest';
import { arenaGeometry } from './arena';
import { makeConfig } from './config';
import { createMatch } from './match';
import { boardContact, boxContact, goalBox } from './physics';
import { input, run, soloMatch, speed } from './testUtil';

describe('player movement', () => {
  it('accelerates to top speed, not instantly', () => {
    const { state, config } = soloMatch();
    run(state, config, 1, [input({ x: 1, y: 0 })]);
    const v1 = speed(state.players[0]!.vel);
    expect(v1).toBeGreaterThan(0);
    expect(v1).toBeLessThan(config.player.maxSpeed);
    run(state, config, 60, [input({ x: 1, y: 0 })]);
    expect(speed(state.players[0]!.vel)).toBeCloseTo(config.player.maxSpeed, 5);
  });

  it('diagonal input is not faster than straight input', () => {
    const { state, config } = soloMatch();
    run(state, config, 60, [input({ x: 1, y: 1 })]);
    expect(speed(state.players[0]!.vel)).toBeCloseTo(config.player.maxSpeed, 5);
  });

  it('friction brings a player to a stop with no input', () => {
    const { state, config } = soloMatch();
    run(state, config, 60, [input({ x: 1, y: 0 })]);
    const xAtRelease = state.players[0]!.pos.x;
    run(state, config, 60, [input()]);
    const p = state.players[0]!;
    expect(speed(p.vel)).toBe(0);
    // It glides a little before stopping (top speed² / 2·friction ≈ 1.2 m).
    expect(p.pos.x - xAtRelease).toBeGreaterThan(0.5);
    expect(p.pos.x - xAtRelease).toBeLessThan(2);
  });

  it('carrying the ball slows the player slightly', () => {
    const { state, config } = soloMatch();
    state.ball.carrier = 0;
    run(state, config, 60, [input({ x: 1, y: 0 })]);
    expect(speed(state.players[0]!.vel)).toBeCloseTo(
      config.player.maxSpeed * config.player.carrySpeedMultiplier,
      5,
    );
  });

  it('the stick follows the aim point', () => {
    const { state, config } = soloMatch();
    run(state, config, 1, [input({ x: 0, y: 0 }, { x: 0, y: 5 })]);
    expect(state.players[0]!.facing).toBeCloseTo(Math.PI / 2, 5);
  });

  it.each([
    ['right', { x: 1, y: 0 }],
    ['left', { x: -1, y: 0 }],
    ['top', { x: 0, y: -1 }],
    ['bottom', { x: 0, y: 1 }],
    ['corner', { x: 1, y: 1 }],
    ['other corner', { x: -1, y: -1 }],
  ])('a player running into the %s boards stays inside', (_name, dir) => {
    const config = makeConfig();
    const arena = arenaGeometry(config);
    // Start off the center line so we don't run straight into a goal.
    const { state } = soloMatch({ x: 0, y: dir.y === 0 ? 5 : 0 }, config);
    run(state, config, 600, [input(dir)]);
    const p = state.players[0]!;
    expect(boardContact(p.pos, config.player.radius - 1e-6, arena)).toBeNull();
  });

  it('a player cannot run through a goal', () => {
    const config = makeConfig();
    const arena = arenaGeometry(config);
    const goal = arena.goals[1];
    const { state } = soloMatch({ x: goal.mouth.x - 4, y: 0 }, config);
    run(state, config, 300, [input({ x: 1, y: 0 })]);
    const p = state.players[0]!;
    expect(boxContact(p.pos, config.player.radius - 1e-6, goalBox(goal))).toBeNull();
    expect(p.pos.x).toBeLessThan(goal.mouth.x);
  });

  it('players do not overlap', () => {
    const config = makeConfig();
    const state = createMatch(config, 1, [
      { team: 0, number: 1, pos: { x: -3, y: 0 } },
      { team: 1, number: 2, pos: { x: 3, y: 0 } },
    ]);
    state.ball.pos = { x: 20, y: 10 };
    run(state, config, 120, [input({ x: 1, y: 0 }), input({ x: -1, y: 0 })]);
    const [a, b] = state.players;
    expect(Math.hypot(a!.pos.x - b!.pos.x, a!.pos.y - b!.pos.y)).toBeGreaterThanOrEqual(
      config.player.radius * 2 - 1e-6,
    );
  });

  it('works with 3, 4, or 5 runners per side in config', () => {
    for (const n of [3, 4, 5]) {
      const config = makeConfig({ teams: { runnersPerSide: n } });
      const { state } = soloMatch({ x: 0, y: 0 }, config);
      run(state, config, 10, [input({ x: 1, y: 0 })]);
      expect(state.players[0]!.pos.x).toBeGreaterThan(0);
    }
  });
});
