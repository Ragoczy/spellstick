import type { InputCommand, MatchState } from '../sim';

/**
 * An AI controller reads match state and returns the same commands a human would give.
 * Controllers may keep private memory, but never edit sim state.
 */
export interface Controller {
  decide(state: Readonly<MatchState>, playerId: number): InputCommand;
}

export const idleController: Controller = {
  decide: (_state, _playerId) => ({ move: { x: 0, y: 0 }, aim: { x: 0, y: 0 } }),
};

export { createGoalieAI, DEFAULT_GOALIE_SKILL, type GoalieSkill } from './goalie';
export { createRunnerAI, DEFAULT_RUNNER_SKILL, type RunnerSkill } from './runner';
export { createTeamControllers } from './team';
