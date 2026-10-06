import { describe, expect, it } from 'vitest';
import { makeConfig } from './config';
import { hashState } from './hash';
import { createMatch, stepMatch } from './match';
import { duelRoster } from './roster';
import type { InputCommand } from './types';

/** Scripted inputs that steer, aim, drop, and toss, so every system gets exercised. */
function scriptedInputs(tick: number, playerId: number): InputCommand {
  const t = tick / 60 + playerId * 1.7;
  return {
    move: { x: Math.cos(t * 0.9), y: Math.sin(t * 1.3) },
    aim: { x: 10 * Math.cos(t * 0.5), y: 6 * Math.sin(t * 0.7) },
    debugDrop: tick % 97 === playerId * 13,
    debugToss: tick % 151 === playerId * 7,
  };
}

function runTicks(seed: number, ticks: number): string {
  const config = makeConfig();
  const state = createMatch(config, seed, duelRoster());
  for (let i = 0; i < ticks; i++) {
    stepMatch(state, [scriptedInputs(i, 0), scriptedInputs(i, 1)], config);
  }
  return hashState(state);
}

describe('determinism', () => {
  it('same seed and inputs give the same state', () => {
    expect(runTicks(42, 5000)).toBe(runTicks(42, 5000));
  });

  it('different seeds give different states', () => {
    expect(runTicks(1, 3000)).not.toBe(runTicks(2, 3000));
  });

  it('match state survives a JSON round trip', () => {
    const config = makeConfig();
    const state = createMatch(config, 7, duelRoster());
    for (let i = 0; i < 300; i++) stepMatch(state, [scriptedInputs(i, 0), scriptedInputs(i, 1)], config);
    const copy = JSON.parse(JSON.stringify(state)) as typeof state;
    for (let i = 300; i < 900; i++) {
      const inputs = [scriptedInputs(i, 0), scriptedInputs(i, 1)];
      stepMatch(state, inputs, config);
      stepMatch(copy, inputs, config);
    }
    expect(hashState(copy)).toBe(hashState(state));
  });
});
