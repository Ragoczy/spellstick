import type { Controller } from './index';
import type { AiLevel, AiStyle, Difficulty, MatchState, SimConfig } from '../sim';
import { createGoalieAI } from './goalie';
import { createRunnerAI } from './runner';

/**
 * One AI controller per player in the match, by role. `levels` gives each team's
 * difficulty and `styles` each team's playing style (M9); `seed` makes AI choices reproducible.
 */
export function createTeamControllers(
  state: Readonly<MatchState>,
  config: SimConfig,
  seed: number,
  levels: [Difficulty, Difficulty] = ['normal', 'normal'],
  styles: [AiStyle, AiStyle] = ['balanced', 'balanced'],
): Controller[] {
  const styled = ([0, 1] as const).map((team) => styledAi(config, levels[team], styles[team]));
  return state.players.map((p) => {
    const { config: teamConfig, level } = styled[p.team]!;
    return p.role === 'goalie'
      ? createGoalieAI(teamConfig, level)
      : createRunnerAI(teamConfig, seed * 101 + p.id, level);
  });
}

/**
 * A difficulty level and runner tuning with a playing style applied. Only the AI's own
 * numbers change (`config.ai`); the returned config is a copy, so the sim's rules are untouched.
 */
export function styledAi(
  config: SimConfig,
  difficulty: Difficulty,
  style: AiStyle,
): { config: SimConfig; level: AiLevel } {
  const s = config.ai.styles[style];
  const base = config.ai.levels[difficulty];
  const level: AiLevel = {
    ...base,
    checkChancePerTick: base.checkChancePerTick * s.checkChance,
    spellEagerness: base.spellEagerness * s.spellEagerness,
    shootRange: base.shootRange + s.shootRange,
  };
  const rc = config.ai.runner;
  const runner = {
    ...rc,
    minHoldSeconds: rc.minHoldSeconds * s.holdSeconds,
    passAdvance: rc.passAdvance * s.passAdvance,
    forceShotChancePerTick: rc.forceShotChancePerTick * s.forceShot,
  };
  return { config: { ...config, ai: { ...config.ai, runner } }, level };
}
