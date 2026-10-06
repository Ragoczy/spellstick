import { describe, expect, it } from 'vitest';
import { createMatch, makeConfig, stepMatch } from '../src/sim';
import { StuckTracker } from './stuck';

describe('StuckTracker', () => {
  const config = makeConfig();
  const roster = [{ team: 0 as const, number: 1, pos: { x: 0, y: 0 } }];

  it('flags a player who stands still for more than 5 s', () => {
    const state = createMatch(config, 1, roster);
    const tracker = new StuckTracker(config);
    for (let i = 0; i < 6 * config.tickHz; i++) {
      stepMatch(state, [], config);
      tracker.observe(state);
    }
    expect(tracker.incidents).toBe(1);
  });

  it('does not flag a player who keeps moving', () => {
    const state = createMatch(config, 1, roster);
    const tracker = new StuckTracker(config);
    for (let i = 0; i < 20 * config.tickHz; i++) {
      // Run back and forth across 8 m.
      const dir = Math.floor(i / 90) % 2 === 0 ? 1 : -1;
      stepMatch(state, [{ move: { x: dir, y: 0 }, aim: { x: 0, y: 0 } }], config);
      tracker.observe(state);
    }
    expect(tracker.incidents).toBe(0);
  });
});
