import { createChaser, type Controller } from '../src/ai';
import {
  arenaGeometry,
  createMatch,
  duelRoster,
  stepMatch,
  type InputCommand,
  type SimConfig,
  type TeamIndex,
} from '../src/sim';
import type { MatchStats } from './report';
import { StuckTracker } from './stuck';

/** Plays one headless AI-vs-AI match to the final whistle and returns its stats. */
export function runMatch(config: SimConfig, seed: number): MatchStats {
  const state = createMatch(config, seed, duelRoster());
  const arena = arenaGeometry(config);
  const controllers: Controller[] = state.players.map((p) => createChaser(arena, p.id * 2));
  const stats: MatchStats = {
    ticks: 0,
    score: [0, 0],
    shots: 0,
    possessionChanges: 0,
    scoops: 0,
    scoopMisses: 0,
    spellCasts: {},
    shotClockViolations: 0,
    creaseViolations: 0,
    longestNoShotTicks: 0,
    stuckPlayerIncidents: 0,
  };
  const stuck = new StuckTracker(config);
  let possession: TeamIndex | null = null;

  const inputs: InputCommand[] = [];
  const maxTicks = config.tickHz * 60 * 60; // hard stop: one hour of game time
  while (state.phase !== 'final' && state.tick < maxTicks) {
    for (const p of state.players) inputs[p.id] = controllers[p.id]!.decide(state, p.id);
    stepMatch(state, inputs, config);
    for (const e of state.events) {
      if (e.type === 'pickup') {
        if (possession !== null && possession !== e.team) stats.possessionChanges++;
        possession = e.team;
        stats.scoops++;
      } else if (e.type === 'scoopMiss') {
        stats.scoopMisses++;
      }
    }
    stuck.observe(state);
  }
  stats.ticks = state.tick;
  stats.score = [state.score[0], state.score[1]];
  // No shots exist yet (M2), so the whole match is one drought.
  stats.longestNoShotTicks = state.tick;
  stats.stuckPlayerIncidents = stuck.incidents;
  return stats;
}
