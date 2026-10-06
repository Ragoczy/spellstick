import { describe, expect, it } from 'vitest';
import { arenaGeometry } from './arena';
import { makeConfig } from './config';
import { createMatch, stickHead } from './match';
import { boardContact, boxContact, goalBox } from './physics';
import { input, run, soloMatch, speed } from './testUtil';

/** A match with no players, so the ball is never scooped. */
function ballOnly(pos: { x: number; y: number }, vel: { x: number; y: number }) {
  const config = makeConfig();
  const state = createMatch(config, 1, []);
  state.ball.pos = { ...pos };
  state.ball.vel = { ...vel };
  return { state, config, arena: arenaGeometry(config) };
}

describe('loose ball', () => {
  it('rolls, slows, and stops', () => {
    const { state, config } = ballOnly({ x: 0, y: 0 }, { x: 0, y: 5 });
    run(state, config, 30);
    const mid = speed(state.ball.vel);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(5);
    run(state, config, 600);
    expect(speed(state.ball.vel)).toBe(0);
    expect(state.ball.pos.y).toBeGreaterThan(1);
  });

  it('bounces off a side board, reversing direction and losing some speed', () => {
    const { state, config, arena } = ballOnly({ x: 0, y: arena0().halfWidth - 1 }, { x: 0, y: 10 });
    let bounced = false;
    for (let i = 0; i < 30 && !bounced; i++) {
      run(state, config, 1);
      if (state.ball.vel.y < 0) bounced = true;
    }
    expect(bounced).toBe(true);
    expect(speed(state.ball.vel)).toBeLessThan(10 * config.ball.boardRestitution + 0.5);
    expect(boardContact(state.ball.pos, config.ball.radius - 1e-6, arena)).toBeNull();
  });

  it('keeps tangential speed along the boards (glancing bounce)', () => {
    const { state, config } = ballOnly({ x: 0, y: arena0().halfWidth - 0.5 }, { x: 10, y: 3 });
    run(state, config, 15);
    expect(state.ball.vel.x).toBeGreaterThan(5);
    expect(state.ball.vel.y).toBeLessThan(0);
  });

  it('never escapes the rink, even fast and into corners', () => {
    for (const vel of [
      { x: 30, y: 30 },
      { x: -30, y: 25 },
      { x: 40, y: -5 },
      { x: -3, y: -40 },
    ]) {
      const { state, config, arena } = ballOnly({ x: 0, y: 3 }, vel);
      for (let i = 0; i < 600; i++) {
        run(state, config, 1);
        expect(boardContact(state.ball.pos, config.ball.radius - 1e-6, arena)).toBeNull();
      }
    }
  });

  it('bounces off the goal frame', () => {
    const arena = arena0();
    const goal = arena.goals[1];
    const { state, config } = ballOnly({ x: goal.mouth.x - 3, y: 0 }, { x: 15, y: 0 });
    run(state, config, 30);
    expect(state.ball.vel.x).toBeLessThan(0);
    expect(boxContact(state.ball.pos, config.ball.radius - 1e-6, goalBox(goal))).toBeNull();
  });
});

describe('carrying', () => {
  it('a carried ball sits at the stick head and moves with the carrier', () => {
    const { state, config } = soloMatch({ x: 0, y: 0 });
    state.ball.carrier = 0;
    run(state, config, 30, [input({ x: 1, y: 0 }, { x: 0, y: -10 })]);
    const head = stickHead(state.players[0]!, config);
    expect(state.ball.pos.x).toBeCloseTo(head.x, 6);
    expect(state.ball.pos.y).toBeCloseTo(head.y, 6);
  });

  it('a carried ball does not poke through the boards', () => {
    const config = makeConfig();
    const arena = arenaGeometry(config);
    const { state } = soloMatch({ x: 0, y: 0 }, config);
    state.ball.carrier = 0;
    run(state, config, 300, [input({ x: 0, y: 1 }, { x: 0, y: 100 })]);
    expect(boardContact(state.ball.pos, config.ball.radius - 1e-6, arena)).toBeNull();
  });

  it('debug drop releases the ball near the feet and blocks an instant re-scoop', () => {
    const { state, config } = soloMatch({ x: 0, y: 0 });
    state.ball.carrier = 0;
    run(state, config, 1, [input({ x: 0, y: 0 }, { x: 10, y: 0 }, { debugDrop: true })]);
    expect(state.ball.carrier).toBeNull();
    expect(state.events.some((e) => e.type === 'release' && e.kind === 'drop')).toBe(true);
    run(state, config, 5, [input()]);
    expect(state.ball.carrier).toBeNull();
  });

  it('debug toss throws the ball toward the aim point', () => {
    const { state, config } = soloMatch({ x: 0, y: 0 });
    state.ball.carrier = 0;
    run(state, config, 1, [input({ x: 0, y: 0 }, { x: 0, y: 10 }, { debugToss: true })]);
    expect(state.ball.carrier).toBeNull();
    expect(state.ball.vel.y).toBeGreaterThan(config.debug.tossSpeed * 0.9);
    expect(Math.abs(state.ball.vel.x)).toBeLessThan(0.5);
  });
});

function arena0() {
  return arenaGeometry(makeConfig());
}
