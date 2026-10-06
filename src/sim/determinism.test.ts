import { describe, expect, it } from 'vitest';
import { makeConfig } from './config';
import { hashState } from './hash';
import { createMatch, stepMatch } from './match';
import { nextFloat } from './rng';

function runTicks(seed: number, ticks: number): string {
  const config = makeConfig();
  const state = createMatch(config, seed);
  for (let i = 0; i < ticks; i++) stepMatch(state, [], config);
  // Burn some RNG too, so the RNG state is part of what we compare.
  nextFloat(state.rng);
  return hashState(state);
}

describe('determinism', () => {
  it('same seed and inputs give the same state', () => {
    expect(runTicks(42, 5000)).toBe(runTicks(42, 5000));
  });

  it('different seeds give different states', () => {
    expect(runTicks(1, 100)).not.toBe(runTicks(2, 100));
  });

  it('match state survives a JSON round trip', () => {
    const config = makeConfig();
    const state = createMatch(config, 7);
    for (let i = 0; i < 100; i++) stepMatch(state, [], config);
    const copy = JSON.parse(JSON.stringify(state)) as typeof state;
    for (let i = 0; i < 100; i++) {
      stepMatch(state, [], config);
      stepMatch(copy, [], config);
    }
    expect(hashState(copy)).toBe(hashState(state));
  });
});
