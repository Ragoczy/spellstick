import { describe, expect, it } from 'vitest';
import { arenaGeometry } from './arena';
import { DEFAULT_CONFIG, makeConfig } from './config';
import { createMatch } from './match';

describe('new match', () => {
  it('starts live in period 1 with a full clock', () => {
    const config = makeConfig();
    const state = createMatch(config, 1);
    expect(state.phase).toBe('live');
    expect(state.period).toBe(1);
    expect(state.periodTicksLeft).toBe(150 * 60);
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
