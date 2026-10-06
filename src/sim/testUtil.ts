/** Helpers shared by sim unit tests. Not imported by game code. */
import { makeConfig, type SimConfig } from './config';
import { createMatch, stepMatch } from './match';
import type { InputCommand, MatchState, RosterEntry } from './types';
import type { Vec2 } from './vec';

export function input(
  move: Vec2 = { x: 0, y: 0 },
  aim: Vec2 = { x: 100, y: 0 },
  extra: Partial<InputCommand> = {},
) {
  return { move, aim, ...extra };
}

export function soloMatch(pos: Vec2 = { x: 0, y: 0 }, config: SimConfig = makeConfig(), seed = 1) {
  const roster: RosterEntry[] = [{ team: 0, number: 1, pos }];
  const state = createMatch(config, seed, roster);
  // Park the ball far away unless a test places it.
  state.ball.pos = { x: 20, y: 10 };
  return { state, config };
}

/** Runs `ticks` steps with the same inputs every tick. */
export function run(state: MatchState, config: SimConfig, ticks: number, inputs: InputCommand[] = []): void {
  for (let i = 0; i < ticks; i++) stepMatch(state, inputs, config);
}

export const speed = (v: Vec2) => Math.hypot(v.x, v.y);
