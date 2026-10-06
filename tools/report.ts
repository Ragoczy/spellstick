import type { SimConfig } from '../src/sim';

/** Per-match counters collected by the headless runner. */
export interface MatchStats {
  ticks: number;
  score: [number, number];
  shots: number;
  saves: number;
  blocks: number;
  posts: number;
  passes: number;
  /** Passes caught by the passing team. */
  completions: number;
  interceptions: number;
  /** Body checks that landed, how many knocked the ball loose, and board slams. */
  checks: number;
  checksLoosened: number;
  boardSlams: number;
  possessionChanges: number;
  /** Faceoffs taken, how many the home team won, and how many were lost to misfires. */
  faceoffs: number;
  homeFaceoffWins: number;
  faceoffMisfires: number;
  /** Goals waved off because an attacker was in the crease (also counted in creaseViolations). */
  goalsDisallowed: number;
  /** 1 if the match went to overtime. */
  overtimeGames: number;
  /** Successful and failed scoops of loose balls. */
  scoops: number;
  scoopMisses: number;
  spellCasts: Record<string, number>;
  shotClockViolations: number;
  creaseViolations: number;
  /** Longest stretch of live play with no shot, in ticks. */
  longestNoShotTicks: number;
  /** Times a player barely moved for more than 5 s of live play. */
  stuckPlayerIncidents: number;
}

/** Counters summed over all matches. */
type Summed = Omit<MatchStats, 'ticks' | 'score' | 'spellCasts' | 'longestNoShotTicks'>;

export interface Report extends Summed {
  games: number;
  totalTicks: number;
  goals: number;
  homeWins: number;
  awayWins: number;
  ties: number;
  spellCasts: Record<string, number>;
  longestNoShotTicks: number;
}

const SUMMED_KEYS = [
  'shots',
  'saves',
  'blocks',
  'posts',
  'passes',
  'completions',
  'interceptions',
  'checks',
  'checksLoosened',
  'boardSlams',
  'possessionChanges',
  'faceoffs',
  'homeFaceoffWins',
  'faceoffMisfires',
  'goalsDisallowed',
  'overtimeGames',
  'scoops',
  'scoopMisses',
  'shotClockViolations',
  'creaseViolations',
  'stuckPlayerIncidents',
] as const satisfies readonly (keyof Summed)[];

export function emptyMatchStats(): MatchStats {
  const stats = { ticks: 0, score: [0, 0], spellCasts: {}, longestNoShotTicks: 0 } as unknown as MatchStats;
  for (const k of SUMMED_KEYS) stats[k] = 0;
  return stats;
}

export function createReport(): Report {
  const report = {
    games: 0,
    totalTicks: 0,
    goals: 0,
    homeWins: 0,
    awayWins: 0,
    ties: 0,
    spellCasts: {},
    longestNoShotTicks: 0,
  } as unknown as Report;
  for (const k of SUMMED_KEYS) report[k] = 0;
  return report;
}

export function recordMatch(report: Report, m: MatchStats): void {
  report.games++;
  report.totalTicks += m.ticks;
  report.goals += m.score[0] + m.score[1];
  if (m.score[0] > m.score[1]) report.homeWins++;
  else if (m.score[1] > m.score[0]) report.awayWins++;
  else report.ties++;
  for (const k of SUMMED_KEYS) report[k] += m[k];
  for (const [spell, n] of Object.entries(m.spellCasts)) {
    report.spellCasts[spell] = (report.spellCasts[spell] ?? 0) + n;
  }
  report.longestNoShotTicks = Math.max(report.longestNoShotTicks, m.longestNoShotTicks);
}

/** Combines two reports (e.g. from worker threads) into a new one. */
export function mergeReports(a: Report, b: Report): Report {
  const out = createReport();
  for (const r of [a, b]) {
    out.games += r.games;
    out.totalTicks += r.totalTicks;
    out.goals += r.goals;
    out.homeWins += r.homeWins;
    out.awayWins += r.awayWins;
    out.ties += r.ties;
    for (const k of SUMMED_KEYS) out[k] += r[k];
    for (const [spell, n] of Object.entries(r.spellCasts)) {
      out.spellCasts[spell] = (out.spellCasts[spell] ?? 0) + n;
    }
    out.longestNoShotTicks = Math.max(out.longestNoShotTicks, r.longestNoShotTicks);
  }
  return out;
}

/** Balance-sanity checks from CLAUDE.md. Warnings until M6, then hard failures. */
export function balanceWarnings(report: Report): string[] {
  const warnings: string[] = [];
  const goalsPerGame = report.goals / Math.max(1, report.games);
  if (goalsPerGame < 6 || goalsPerGame > 20) {
    warnings.push(`goals per game ${goalsPerGame.toFixed(2)} is outside 6–20`);
  }
  const totalCasts = Object.values(report.spellCasts).reduce((a, b) => a + b, 0);
  for (const [spell, n] of Object.entries(report.spellCasts)) {
    if (totalCasts > 0 && n / totalCasts > 0.4) {
      warnings.push(`${spell} is ${((100 * n) / totalCasts).toFixed(1)}% of casts (max 40%)`);
    }
  }
  const decided = report.homeWins + report.awayWins;
  const homeRate = decided > 0 ? report.homeWins / decided : 0.5;
  if (homeRate < 0.45 || homeRate > 0.55) {
    warnings.push(`home win rate ${(homeRate * 100).toFixed(1)}% is outside 45–55%`);
  }
  return warnings;
}

const pct = (n: number, d: number) => (d > 0 ? `${((100 * n) / d).toFixed(1)}%` : 'n/a');

export function formatReport(
  report: Report,
  config: SimConfig,
  meta: { games: number; baseSeed: number; elapsedMs: number; setup?: string },
): string {
  const g = Math.max(1, report.games);
  const perGame = (n: number) => (n / g).toFixed(2);
  const secs = (ticks: number) => (ticks / config.tickHz).toFixed(1);
  const totalCasts = Object.values(report.spellCasts).reduce((a, b) => a + b, 0);
  const spellLines = Object.entries(report.spellCasts)
    .sort((a, b) => b[1] - a[1])
    .map(([s, n]) => `    ${s.padEnd(16)} ${String(n).padStart(8)}  (${pct(n, totalCasts)})`);
  const decided = report.homeWins + report.awayWins;
  const warnings = balanceWarnings(report);

  return [
    `Spellstick headless sim — ${meta.games} games, seeds ${meta.baseSeed}..${meta.baseSeed + meta.games - 1}` +
      (meta.setup ? ` (${meta.setup})` : ''),
    `  run time                    ${(meta.elapsedMs / 1000).toFixed(2)} s`,
    `  avg match length            ${secs(report.totalTicks / g)} s game time`,
    `  goals per game              ${perGame(report.goals)}`,
    `  shots per game              ${perGame(report.shots)}`,
    `  shots per goal              ${report.goals > 0 ? (report.shots / report.goals).toFixed(2) : 'n/a'}  (shooting ${pct(report.goals, report.shots)})`,
    `  saves / blocks / posts      ${perGame(report.saves)} / ${perGame(report.blocks)} / ${perGame(report.posts)} per game  (save rate ${pct(report.saves, report.saves + report.goals)})`,
    `  passes per game             ${perGame(report.passes)}  (completed ${pct(report.completions, report.passes)}, intercepted ${pct(report.interceptions, report.passes)})`,
    `  checks per game             ${perGame(report.checks)}  (ball loosened ${pct(report.checksLoosened, report.checks)}, board slams ${perGame(report.boardSlams)})`,
    `  faceoffs / game             ${perGame(report.faceoffs)}  (home wins ${pct(report.homeFaceoffWins, report.faceoffs)}, misfires ${pct(report.faceoffMisfires, report.faceoffs)})`,
    `  overtime games              ${report.overtimeGames}  (${pct(report.overtimeGames, report.games)})`,
    `  possession changes / game   ${perGame(report.possessionChanges)}`,
    `  scoops / game               ${perGame(report.scoops)}  (success ${pct(report.scoops, report.scoops + report.scoopMisses)})`,
    `  home / away / tied          ${report.homeWins} / ${report.awayWins} / ${report.ties}` +
      (decided > 0 ? `  (home win ${pct(report.homeWins, decided)})` : ''),
    `  spell casts                 ${totalCasts}`,
    ...spellLines,
    `  shot-clock violations       ${report.shotClockViolations}  (${perGame(report.shotClockViolations)} / game)`,
    `  crease violations           ${report.creaseViolations}  (${perGame(report.creaseViolations)} / game, ${report.goalsDisallowed} goals waved off)`,
    `  longest stretch w/o a shot  ${secs(report.longestNoShotTicks)} s`,
    `  stuck-player incidents      ${report.stuckPlayerIncidents}`,
    warnings.length > 0
      ? `  BALANCE WARNINGS:\n${warnings.map((w) => `    - ${w}`).join('\n')}`
      : '  balance: OK',
  ].join('\n');
}
