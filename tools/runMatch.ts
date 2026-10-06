import { createTeamControllers } from '../src/ai';
import {
  createMatch,
  scrimmageRoster,
  stepMatch,
  type InputCommand,
  type SimConfig,
  type TeamIndex,
} from '../src/sim';
import { emptyMatchStats, type MatchStats } from './report';
import { StuckTracker } from './stuck';

/** Runners per side in the headless scrimmage until full teams arrive in M3. */
export const SIM_RUNNERS_PER_SIDE = 2;

/** Plays one headless AI-vs-AI match to the final whistle and returns its stats. */
export function runMatch(config: SimConfig, seed: number): MatchStats {
  const state = createMatch(config, seed, scrimmageRoster(config, SIM_RUNNERS_PER_SIDE));
  const controllers = createTeamControllers(state, config, seed);
  const stats = emptyMatchStats();

  const stuck = new StuckTracker(config);
  let possession: TeamIndex | null = null;
  const gain = (team: TeamIndex) => {
    if (possession !== null && possession !== team) stats.possessionChanges++;
    possession = team;
  };
  let liveTicksSinceShot = 0;

  const inputs: InputCommand[] = [];
  const maxTicks = config.tickHz * 60 * 60; // hard stop: one hour of game time
  while (state.phase !== 'final' && state.tick < maxTicks) {
    for (const p of state.players) inputs[p.id] = controllers[p.id]!.decide(state, p.id);
    stepMatch(state, inputs, config);
    if (state.phase === 'live') liveTicksSinceShot++;
    for (const e of state.events) {
      switch (e.type) {
        case 'pickup':
          stats.scoops++;
          gain(e.team);
          break;
        case 'scoopMiss':
          stats.scoopMisses++;
          break;
        case 'pass':
          stats.passes++;
          break;
        case 'catch':
          if (e.intercepted) stats.interceptions++;
          else stats.completions++;
          gain(e.team);
          break;
        case 'shot':
          stats.shots++;
          stats.longestNoShotTicks = Math.max(stats.longestNoShotTicks, liveTicksSinceShot);
          liveTicksSinceShot = 0;
          break;
        case 'save':
          stats.saves++;
          if (e.caught) gain(e.team);
          break;
        case 'block':
          stats.blocks++;
          break;
        case 'post':
          stats.posts++;
          break;
        case 'goal':
          possession = null;
          break;
      }
    }
    stuck.observe(state);
  }
  stats.longestNoShotTicks = Math.max(stats.longestNoShotTicks, liveTicksSinceShot);
  stats.ticks = state.tick;
  stats.score = [state.score[0], state.score[1]];
  stats.stuckPlayerIncidents = stuck.incidents;
  return stats;
}
