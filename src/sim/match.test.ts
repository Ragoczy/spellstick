import { describe, expect, it } from 'vitest';
import { arenaGeometry } from './arena';
import { DEFAULT_CONFIG, makeConfig } from './config';
import { createMatch, periodTicks, stepMatch } from './match';

describe('match clock (M0 skeleton)', () => {
  it('starts live in period 1 with a full clock', () => {
    const config = makeConfig();
    const state = createMatch(config, 1);
    expect(state.phase).toBe('live');
    expect(state.period).toBe(1);
    expect(state.periodTicksLeft).toBe(150 * 60);
  });

  it('advances through every period and ends', () => {
    const config = makeConfig({ match: { periods: 4, periodSeconds: 2 } });
    const state = createMatch(config, 1);
    const periodEnds: number[] = [];
    let ticks = 0;
    while (state.phase !== 'final' && ticks < 10_000) {
      stepMatch(state, [], config);
      ticks++;
      for (const e of state.events) if (e.type === 'periodEnd') periodEnds.push(e.period);
    }
    expect(state.phase).toBe('final');
    expect(periodEnds).toEqual([1, 2, 3, 4]);
    expect(ticks).toBe(4 * periodTicks(config));
  });

  it('does nothing once final', () => {
    const config = makeConfig({ match: { periods: 1, periodSeconds: 1 } });
    const state = createMatch(config, 1);
    for (let i = 0; i < 100; i++) stepMatch(state, [], config);
    const tick = state.tick;
    stepMatch(state, [], config);
    expect(state.tick).toBe(tick);
    expect(state.events).toEqual([]);
  });
});

describe('config', () => {
  it('makeConfig overrides without mutating the defaults', () => {
    const config = makeConfig({ teams: { runnersPerSide: 3 } });
    expect(config.teams.runnersPerSide).toBe(3);
    expect(DEFAULT_CONFIG.teams.runnersPerSide).toBe(4);
    expect(config.rink.length).toBe(DEFAULT_CONFIG.rink.length);
  });
});

describe('arena geometry', () => {
  it('puts goals symmetrically, each inside its crease and inside the boards', () => {
    const arena = arenaGeometry(makeConfig());
    const [home, away] = arena.goals;
    expect(home.mouth.x).toBe(-away.mouth.x);
    expect(home.defendedBy).toBe(0);
    expect(home.backDir).toBe(-1);
    expect(away.backDir).toBe(1);
    for (const goal of arena.goals) {
      expect(goal.width / 2).toBeLessThan(goal.creaseRadius);
      expect(Math.abs(goal.mouth.x) + goal.depth).toBeLessThan(arena.halfLength);
    }
  });
});
