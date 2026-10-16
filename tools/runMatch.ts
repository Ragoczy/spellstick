import { CreditTracker, emptyCareer, evaluate } from '../src/achievements';
import { createTeamControllers } from '../src/ai';
import {
  createMatch,
  followPlay,
  startingControl,
  matchRoster,
  stepMatch,
  type AiStyle,
  type Difficulty,
  type InputCommand,
  type RunnerSpell,
  type SimConfig,
  type TeamIndex,
} from '../src/sim';
import { emptyMatchStats, type MatchStats } from './report';
import { StuckTracker } from './stuck';

/** Plays one headless AI-vs-AI match to the final whistle and returns its stats. */
export function runMatch(
  config: SimConfig,
  seed: number,
  levels: [Difficulty, Difficulty] = ['normal', 'normal'],
  styles: [AiStyle, AiStyle] = ['balanced', 'balanced'],
  loadouts?: [RunnerSpell[], RunnerSpell[]],
): MatchStats {
  const state = createMatch(config, seed, matchRoster(config), { start: 'faceoff', loadouts });
  const controllers = createTeamControllers(state, config, seed, levels, styles);
  const stats = emptyMatchStats();

  const stuck = new StuckTracker(config);
  let possession: TeamIndex | null = null;
  const gain = (team: TeamIndex) => {
    if (possession !== null && possession !== team) stats.possessionChanges++;
    possession = team;
  };
  let liveTicksSinceShot = 0;

  // Achievements (M14): who a person would be steering on each side, as online (control follows play).
  const credit = new CreditTracker(
    config,
    state.players.map((p) => p.team),
  );
  const control: [number, number] = [startingControl(state, 0), startingControl(state, 1)];

  const inputs: InputCommand[] = [];
  const maxTicks = config.tickHz * 60 * 60; // hard stop: one hour of game time
  while (state.phase !== 'final' && state.tick < maxTicks) {
    for (const p of state.players) inputs[p.id] = controllers[p.id]!.decide(state, p.id);
    const steered: [number, number] = [control[0], control[1]];
    stepMatch(state, inputs, config);
    credit.step(state.events, steered);
    control[0] = followPlay(state, 0, control[0]);
    control[1] = followPlay(state, 1, control[1]);
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
          stats.teams[e.team].passes++;
          break;
        case 'catch':
          if (e.intercepted) stats.interceptions++;
          else {
            stats.completions++;
            stats.teams[e.team].completions++;
          }
          gain(e.team);
          break;
        case 'shot':
          stats.shots++;
          stats.teams[e.team].shots++;
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
        case 'check':
          stats.checks++;
          stats.teams[e.team].checks++;
          if (e.loosened) stats.checksLoosened++;
          break;
        case 'boardSlam':
          stats.boardSlams++;
          break;
        case 'faceoffWin':
          stats.faceoffs++;
          if (e.team === 0) stats.homeFaceoffWins++;
          if (e.reason === 'misfire') stats.faceoffMisfires++;
          if (e.team !== null) gain(e.team);
          break;
        case 'shotClockViolation':
          stats.shotClockViolations++;
          gain(e.team === 0 ? 1 : 0);
          break;
        case 'creaseViolation':
          stats.creaseViolations++;
          gain(e.team === 0 ? 1 : 0);
          break;
        case 'goalDisallowed':
          stats.creaseViolations++;
          stats.goalsDisallowed++;
          gain(e.team === 0 ? 1 : 0);
          break;
        case 'cast':
          stats.spellCasts[e.spell] = (stats.spellCasts[e.spell] ?? 0) + 1;
          stats.teams[e.team].casts++;
          break;
        case 'wardBlock':
          stats.wardBlocks++;
          break;
        case 'periodStart':
          if (e.overtime) stats.overtimeGames = 1;
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
  stats.teams[0].goals = state.score[0];
  stats.teams[1].goals = state.score[1];
  stats.stuckPlayerIncidents = stuck.incidents;
  const result = credit.result();
  for (const side of [0, 1] as const) {
    for (const id of evaluate(result, side, emptyCareer(), config).unlocked) {
      stats.achievementUnlocks[id] = (stats.achievementUnlocks[id] ?? 0) + 1;
    }
  }
  return stats;
}
