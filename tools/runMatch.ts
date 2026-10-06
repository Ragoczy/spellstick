import { createMatch, stepMatch, type SimConfig } from '../src/sim';
import type { MatchStats } from './report';

/** Plays one headless match to the final whistle and returns its stats. */
export function runMatch(config: SimConfig, seed: number): MatchStats {
  const state = createMatch(config, seed);
  const stats: MatchStats = {
    ticks: 0,
    score: [0, 0],
    shots: 0,
    possessionChanges: 0,
    spellCasts: {},
    shotClockViolations: 0,
    creaseViolations: 0,
    longestNoShotTicks: 0,
    stuckPlayerIncidents: 0,
  };
  const maxTicks = config.tickHz * 60 * 60; // hard stop: one hour of game time
  while (state.phase !== 'final' && state.tick < maxTicks) {
    stepMatch(state, [], config);
  }
  stats.ticks = state.tick;
  stats.score = [state.score[0], state.score[1]];
  // No players or shots yet (M0), so the whole match is one long drought.
  stats.longestNoShotTicks = state.tick;
  return stats;
}
