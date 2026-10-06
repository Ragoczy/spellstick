import type { Controller } from './index';
import type { Difficulty, MatchState, SimConfig } from '../sim';
import { createGoalieAI } from './goalie';
import { createRunnerAI } from './runner';

/**
 * One AI controller per player in the match, by role. `levels` gives each team's
 * difficulty; `seed` makes AI choices reproducible.
 */
export function createTeamControllers(
  state: Readonly<MatchState>,
  config: SimConfig,
  seed: number,
  levels: [Difficulty, Difficulty] = ['normal', 'normal'],
): Controller[] {
  return state.players.map((p) => {
    const level = config.ai.levels[levels[p.team]];
    return p.role === 'goalie'
      ? createGoalieAI(config, level)
      : createRunnerAI(config, seed * 101 + p.id, level);
  });
}
