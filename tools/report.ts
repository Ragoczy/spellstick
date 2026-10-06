import type { SimConfig } from '../src/sim';

/** Per-match counters collected by the headless runner. */
export interface MatchStats {
  ticks: number;
  score: [number, number];
  shots: number;
  possessionChanges: number;
  spellCasts: Record<string, number>;
  shotClockViolations: number;
  creaseViolations: number;
  /** Longest stretch of live play with no shot, in ticks. */
  longestNoShotTicks: number;
  /** Times a player barely moved for more than 5 s of live play. */
  stuckPlayerIncidents: number;
}

export interface Report {
  games: number;
  totalTicks: number;
  goals: number;
  homeWins: number;
  awayWins: number;
  ties: number;
  shots: number;
  possessionChanges: number;
  spellCasts: Record<string, number>;
  shotClockViolations: number;
  creaseViolations: number;
  longestNoShotTicks: number;
  stuckPlayerIncidents: number;
}

export function createReport(): Report {
  return {
    games: 0,
    totalTicks: 0,
    goals: 0,
    homeWins: 0,
    awayWins: 0,
    ties: 0,
    shots: 0,
    possessionChanges: 0,
    spellCasts: {},
    shotClockViolations: 0,
    creaseViolations: 0,
    longestNoShotTicks: 0,
    stuckPlayerIncidents: 0,
  };
}

export function recordMatch(report: Report, m: MatchStats): void {
  report.games++;
  report.totalTicks += m.ticks;
  report.goals += m.score[0] + m.score[1];
  if (m.score[0] > m.score[1]) report.homeWins++;
  else if (m.score[1] > m.score[0]) report.awayWins++;
  else report.ties++;
  report.shots += m.shots;
  report.possessionChanges += m.possessionChanges;
  for (const [spell, n] of Object.entries(m.spellCasts)) {
    report.spellCasts[spell] = (report.spellCasts[spell] ?? 0) + n;
  }
  report.shotClockViolations += m.shotClockViolations;
  report.creaseViolations += m.creaseViolations;
  report.longestNoShotTicks = Math.max(report.longestNoShotTicks, m.longestNoShotTicks);
  report.stuckPlayerIncidents += m.stuckPlayerIncidents;
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

export function formatReport(
  report: Report,
  config: SimConfig,
  meta: { games: number; baseSeed: number; elapsedMs: number },
): string {
  const g = Math.max(1, report.games);
  const secs = (ticks: number) => (ticks / config.tickHz).toFixed(1);
  const totalCasts = Object.values(report.spellCasts).reduce((a, b) => a + b, 0);
  const spellLines = Object.entries(report.spellCasts)
    .sort((a, b) => b[1] - a[1])
    .map(
      ([s, n]) =>
        `    ${s.padEnd(16)} ${String(n).padStart(8)}  (${((100 * n) / Math.max(1, totalCasts)).toFixed(1)}%)`,
    );
  const decided = report.homeWins + report.awayWins;
  const warnings = balanceWarnings(report);

  return [
    `Spellstick headless sim — ${meta.games} games, seeds ${meta.baseSeed}..${meta.baseSeed + meta.games - 1}`,
    `  run time                    ${(meta.elapsedMs / 1000).toFixed(2)} s`,
    `  avg match length            ${secs(report.totalTicks / g)} s game time`,
    `  goals per game              ${(report.goals / g).toFixed(2)}`,
    `  shots per goal              ${report.goals > 0 ? (report.shots / report.goals).toFixed(2) : 'n/a'}`,
    `  possession changes / game   ${(report.possessionChanges / g).toFixed(2)}`,
    `  home / away / tied          ${report.homeWins} / ${report.awayWins} / ${report.ties}` +
      (decided > 0 ? `  (home win ${((100 * report.homeWins) / decided).toFixed(1)}%)` : ''),
    `  spell casts                 ${totalCasts}`,
    ...spellLines,
    `  shot-clock violations       ${report.shotClockViolations}  (${(report.shotClockViolations / g).toFixed(2)} / game)`,
    `  crease violations           ${report.creaseViolations}  (${(report.creaseViolations / g).toFixed(2)} / game)`,
    `  longest stretch w/o a shot  ${secs(report.longestNoShotTicks)} s`,
    `  stuck-player incidents      ${report.stuckPlayerIncidents}`,
    warnings.length > 0
      ? `  BALANCE WARNINGS:\n${warnings.map((w) => `    - ${w}`).join('\n')}`
      : '  balance: OK',
  ].join('\n');
}
