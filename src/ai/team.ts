import type { Controller } from './index';
import type { MatchState, SimConfig } from '../sim';
import { createGoalieAI } from './goalie';
import { createRunnerAI } from './runner';

/** One AI controller per player in the match, by role. `seed` makes AI choices reproducible. */
export function createTeamControllers(
  state: Readonly<MatchState>,
  config: SimConfig,
  seed: number,
): Controller[] {
  return state.players.map((p) =>
    p.role === 'goalie' ? createGoalieAI(config) : createRunnerAI(config, seed * 101 + p.id),
  );
}
