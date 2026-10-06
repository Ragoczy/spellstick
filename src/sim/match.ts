import type { SimConfig } from './config';
import { createRng } from './rng';
import type { InputCommand, MatchState } from './types';

/** Creates a fresh match. Same seed + same config + same inputs ⇒ same match. */
export function createMatch(config: SimConfig, seed: number): MatchState {
  return {
    tick: 0,
    rng: createRng(seed),
    phase: 'live',
    period: 1,
    periodTicksLeft: periodTicks(config),
    score: [0, 0],
    ball: { pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 } },
    players: [],
    events: [],
  };
}

export function periodTicks(config: SimConfig): number {
  return Math.round(config.match.periodSeconds * config.tickHz);
}

/**
 * Advances the match by exactly one fixed tick, mutating `state` in place.
 * `inputs` is indexed by player id; missing entries mean "no input".
 */
export function stepMatch(
  state: MatchState,
  _inputs: ReadonlyArray<InputCommand | undefined>,
  config: SimConfig,
): void {
  state.events = [];
  if (state.phase === 'final') return;

  state.tick++;
  state.periodTicksLeft--;
  if (state.periodTicksLeft <= 0) {
    state.events.push({ type: 'periodEnd', period: state.period });
    if (state.period >= config.match.periods) {
      state.phase = 'final';
      state.periodTicksLeft = 0;
      state.events.push({ type: 'matchEnd', score: [state.score[0], state.score[1]] });
    } else {
      state.period++;
      state.periodTicksLeft = periodTicks(config);
    }
  }
}

/** Game-clock seconds left in the current period. */
export function periodSecondsLeft(state: MatchState, config: SimConfig): number {
  return state.periodTicksLeft / config.tickHz;
}
