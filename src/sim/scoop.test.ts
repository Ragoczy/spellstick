import { describe, expect, it } from 'vitest';
import { makeConfig } from './config';
import { createMatch, scoopChance } from './match';
import { input, run, soloMatch } from './testUtil';

describe('auto-scoop (SPEC §4.2)', () => {
  it('a player who moves over a loose ball picks it up', () => {
    const { state, config } = soloMatch({ x: -3, y: 0 });
    state.ball.pos = { x: 0, y: 0 };
    run(state, config, 60, [input({ x: 1, y: 0 })]);
    expect(state.ball.carrier).toBe(0);
  });

  it('a ball out of reach is not scooped', () => {
    const { state, config } = soloMatch({ x: 0, y: 0 });
    state.ball.pos = { x: config.scoop.radius + 0.5, y: 0 };
    run(state, config, 30, [input()]);
    expect(state.ball.carrier).toBeNull();
  });

  it('scoop chance is higher moving slowly than fast', () => {
    const config = makeConfig();
    expect(scoopChance(0, config)).toBe(config.scoop.chanceSlow);
    expect(scoopChance(1, config)).toBe(config.scoop.chanceFast);
    expect(scoopChance(0, config)).toBeGreaterThan(scoopChance(1, config));
  });

  it('first-attempt success rate tracks relative speed, over many seeds', () => {
    const config = makeConfig();
    const firstTry = (ballSpeed: number) => {
      let hits = 0;
      const trials = 400;
      for (let seed = 1; seed <= trials; seed++) {
        const state = createMatch(config, seed, [{ team: 0, number: 1, pos: { x: 0, y: 0 } }]);
        // Ball rolls straight into a standing player.
        state.ball.pos = { x: -config.scoop.radius - 0.3, y: 0 };
        state.ball.vel = { x: ballSpeed, y: 0 };
        for (let i = 0; i < 30; i++) {
          run(state, config, 1, [input()]);
          const e = state.events.find((ev) => ev.type === 'pickup' || ev.type === 'scoopMiss');
          if (e) {
            if (e.type === 'pickup') hits++;
            break;
          }
        }
      }
      return hits / trials;
    };
    const slow = firstTry(1.5);
    const fast = firstTry(15);
    expect(slow).toBeGreaterThan(0.85);
    expect(fast).toBeLessThan(0.7);
    expect(fast).toBeGreaterThan(0.4);
  });

  it('a failed scoop knocks the ball away and makes the player wait', () => {
    const config = makeConfig({ scoop: { chanceSlow: 0, chanceFast: 0 } });
    const { state } = soloMatch({ x: 0, y: 0 }, config);
    state.ball.pos = { x: 0.5, y: 0 };
    run(state, config, 1, [input()]);
    expect(state.events.some((e) => e.type === 'scoopMiss')).toBe(true);
    expect(state.ball.vel.x).toBeGreaterThan(0);
    expect(state.players[0]!.scoopCooldown).toBeGreaterThan(0);
  });

  it('the nearest player gets the ball', () => {
    const config = makeConfig({ scoop: { chanceSlow: 1, chanceFast: 1 } });
    const state = createMatch(config, 1, [
      { team: 0, number: 1, pos: { x: -0.8, y: 0 } },
      { team: 1, number: 2, pos: { x: 0.5, y: 0 } },
    ]);
    state.ball.pos = { x: 0, y: 0 };
    run(state, config, 1, [input(), input()]);
    expect(state.ball.carrier).toBe(1);
  });

  it('drop, then scoop again (the M1 loop)', () => {
    const { state, config } = soloMatch({ x: 0, y: 0 });
    state.ball.carrier = 0;
    run(state, config, 1, [input({ x: 0, y: 0 }, { x: 10, y: 0 }, { debugDrop: true })]);
    expect(state.ball.carrier).toBeNull();
    // Wait out the release cooldown, then walk onto the ball.
    run(state, config, 60, [input()]);
    run(state, config, 60, [input({ x: 1, y: 0 })]);
    expect(state.ball.carrier).toBe(0);
  });
});
