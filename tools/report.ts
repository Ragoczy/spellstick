import { ACHIEVEMENT_IDS } from '../src/content/badges';
import type { SimConfig } from '../src/sim';

/** Per-team counters (index 0 = home), for comparing playing styles (M9). */
export interface TeamStats {
  goals: number;
  shots: number;
  passes: number;
  /** Passes this team caught. */
  completions: number;
  /** Body checks this team landed. */
  checks: number;
  /** Spells this team cast (the goalie's Ward included). */
  casts: number;
}

const TEAM_KEYS = [
  'goals',
  'shots',
  'passes',
  'completions',
  'checks',
  'casts',
] as const satisfies readonly (keyof TeamStats)[];

export const emptyTeamStats = (): TeamStats => ({
  goals: 0,
  shots: 0,
  passes: 0,
  completions: 0,
  checks: 0,
  casts: 0,
});

function addTeamStats(into: TeamStats, from: TeamStats): void {
  for (const k of TEAM_KEYS) into[k] += from[k];
}

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
  /** Shots stopped by the goalie's Ward. */
  wardBlocks: number;
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
  /** The same kinds of counts split by team: home, away. */
  teams: [TeamStats, TeamStats];
  /**
   * Achievements (M14) a first-time player on each side would unlock in this match, counted
   * once per side: the witch a person would steer is the one control follows (as online).
   */
  achievementUnlocks: Record<string, number>;
}

/** Counters summed over all matches. */
type Summed = Omit<
  MatchStats,
  'ticks' | 'score' | 'spellCasts' | 'longestNoShotTicks' | 'teams' | 'achievementUnlocks'
>;

export interface Report extends Summed {
  achievementUnlocks: Record<string, number>;
  games: number;
  totalTicks: number;
  goals: number;
  homeWins: number;
  awayWins: number;
  ties: number;
  spellCasts: Record<string, number>;
  longestNoShotTicks: number;
  teams: [TeamStats, TeamStats];
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
  'wardBlocks',
  'scoops',
  'scoopMisses',
  'shotClockViolations',
  'creaseViolations',
  'stuckPlayerIncidents',
] as const satisfies readonly (keyof Summed)[];

export function emptyMatchStats(): MatchStats {
  const stats = {
    ticks: 0,
    score: [0, 0],
    spellCasts: {},
    achievementUnlocks: {},
    longestNoShotTicks: 0,
    teams: [emptyTeamStats(), emptyTeamStats()],
  } as unknown as MatchStats;
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
    achievementUnlocks: {},
    longestNoShotTicks: 0,
    teams: [emptyTeamStats(), emptyTeamStats()],
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
  addCounts(report.achievementUnlocks, m.achievementUnlocks);
  report.longestNoShotTicks = Math.max(report.longestNoShotTicks, m.longestNoShotTicks);
  addTeamStats(report.teams[0], m.teams[0]);
  addTeamStats(report.teams[1], m.teams[1]);
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
    addCounts(out.achievementUnlocks, r.achievementUnlocks);
    out.longestNoShotTicks = Math.max(out.longestNoShotTicks, r.longestNoShotTicks);
    addTeamStats(out.teams[0], r.teams[0]);
    addTeamStats(out.teams[1], r.teams[1]);
  }
  return out;
}

function addCounts(into: Record<string, number>, from: Record<string, number>): void {
  for (const [k, n] of Object.entries(from)) into[k] = (into[k] ?? 0) + n;
}

/**
 * Achievements (M14) meant to take skill or luck in one match: a sanity warning (never a
 * failure) if a first-time player would unlock one in more than 60% of matches, or under 1%.
 * First Whistle, Off the Mark, First Win, and the Witch's Hat Trick are early ones by design.
 */
export const SKILL_ACHIEVEMENTS = ['intoTheBoards', 'lightFingers', 'shutout', 'suddenDeath', 'comeback'];

export function achievementWarnings(report: Report): string[] {
  const players = Math.max(1, report.games * 2);
  return SKILL_ACHIEVEMENTS.flatMap((id) => {
    const rate = (report.achievementUnlocks[id] ?? 0) / players;
    if (rate > 0.6)
      return [`${id} unlocks in ${(rate * 100).toFixed(1)}% of player-matches (over 60%: too easy)`];
    if (rate < 0.01)
      return [`${id} unlocks in ${(rate * 100).toFixed(1)}% of player-matches (under 1%: nearly impossible)`];
    return [];
  });
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
    `  spell casts                 ${totalCasts}  (${perGame(totalCasts)} / game, ward blocks ${perGame(report.wardBlocks)} / game)`,
    ...spellLines,
    `  shot-clock violations       ${report.shotClockViolations}  (${perGame(report.shotClockViolations)} / game)`,
    `  crease violations           ${report.creaseViolations}  (${perGame(report.creaseViolations)} / game, ${report.goalsDisallowed} goals waved off)`,
    `  longest stretch w/o a shot  ${secs(report.longestNoShotTicks)} s`,
    `  stuck-player incidents      ${report.stuckPlayerIncidents}`,
    `  achievements (M14), share of player-matches where a first-timer unlocks each:`,
    ...ACHIEVEMENT_IDS.filter((id) => id !== 'fullLibrary').map(
      (id) => `    ${id.padEnd(16)} ${pct(report.achievementUnlocks[id] ?? 0, report.games * 2).padStart(7)}`,
    ),
    ...achievementWarnings(report).map((w) => `    note: ${w}`),
    warnings.length > 0
      ? `  BALANCE WARNINGS:\n${warnings.map((w) => `    - ${w}`).join('\n')}`
      : '  balance: OK',
  ].join('\n');
}

/** One playing style's results across a style matrix (M9): its games against every other style. */
export interface StyleRecord {
  games: number;
  wins: number;
  losses: number;
  ties: number;
  goalsAgainst: number;
  /** This style's own team counters, summed. */
  totals: TeamStats;
}

export type StyleTable = Map<string, StyleRecord>;

/** Win rate (of decided games) every style must stay within against the others. */
export const STYLE_WIN_RATE_RANGE = [0.42, 0.58] as const;

/** Adds one matchup's report (home style vs away style) to the table. */
export function recordStyleMatchup(table: StyleTable, home: string, away: string, report: Report): void {
  const entry = (style: string) => {
    let r = table.get(style);
    if (!r) {
      r = { games: 0, wins: 0, losses: 0, ties: 0, goalsAgainst: 0, totals: emptyTeamStats() };
      table.set(style, r);
    }
    return r;
  };
  const h = entry(home);
  const a = entry(away);
  h.games += report.games;
  a.games += report.games;
  h.wins += report.homeWins;
  h.losses += report.awayWins;
  a.wins += report.awayWins;
  a.losses += report.homeWins;
  h.ties += report.ties;
  a.ties += report.ties;
  h.goalsAgainst += report.teams[1].goals;
  a.goalsAgainst += report.teams[0].goals;
  addTeamStats(h.totals, report.teams[0]);
  addTeamStats(a.totals, report.teams[1]);
}

/** Styles whose win rate against the others falls outside STYLE_WIN_RATE_RANGE. */
export function styleWarnings(table: StyleTable): string[] {
  const [lo, hi] = STYLE_WIN_RATE_RANGE;
  const warnings: string[] = [];
  for (const [style, r] of table) {
    const decided = r.wins + r.losses;
    const rate = decided > 0 ? r.wins / decided : 0.5;
    if (rate < lo || rate > hi) {
      warnings.push(
        `${style} wins ${(rate * 100).toFixed(1)}% against the other styles (allowed ${Math.round(lo * 100)}–${Math.round(hi * 100)}%)`,
      );
    }
  }
  return warnings;
}

export function formatStyleTable(
  table: StyleTable,
  meta: { gamesPerPairing: number; elapsedMs: number },
): string {
  const per = (n: number, g: number) => (n / Math.max(1, g)).toFixed(1).padStart(7);
  const rows = [...table].map(([style, r]) => {
    const t = r.totals;
    const decided = r.wins + r.losses;
    return (
      `  ${style.padEnd(12)}${String(r.games).padStart(6)}  ${pct(r.wins, decided).padStart(6)}` +
      `${per(t.goals, r.games)}${per(r.goalsAgainst, r.games)}${per(t.shots, r.games)}` +
      `${per(t.passes, r.games)}  ${pct(t.completions, t.passes).padStart(6)}${per(t.checks, r.games)}${per(t.casts, r.games)}`
    );
  });
  const warnings = styleWarnings(table);
  return [
    `Style matrix — every pairing of different styles, ${meta.gamesPerPairing} games each way (${(meta.elapsedMs / 1000).toFixed(1)} s)`,
    `  style        games    win%    GF/g    GA/g  shots/g passes/g  compl%  hits/g  casts/g`,
    ...rows,
    warnings.length > 0
      ? `  STYLE WARNINGS:\n${warnings.map((w) => `    - ${w}`).join('\n')}`
      : '  styles: OK',
  ].join('\n');
}

/** One spell's record in a `--spell-edges` run (M10): matches where its team always carried it. */
export interface SpellEdge {
  spell: string;
  games: number;
  /** Games the team carrying it won and lost. */
  wins: number;
  losses: number;
  /** Times it was cast. */
  casts: number;
  goals: number;
}

/**
 * Win rate (of decided games) every spell's team must stay within: no obvious pick, no dead pick.
 * The design target is 42–58% over 400 games per spell; CI's quicker 300-game run carries about
 * ±3% of noise per spell, so the strict check allows 40–60% (see the decisions log).
 */
export const SPELL_WIN_RATE_RANGE = [0.4, 0.6] as const;

export function spellEdgeWarnings(edges: readonly SpellEdge[]): string[] {
  const [lo, hi] = SPELL_WIN_RATE_RANGE;
  const warnings: string[] = [];
  for (const e of edges) {
    const decided = e.wins + e.losses;
    const rate = decided > 0 ? e.wins / decided : 0.5;
    if (rate < lo || rate > hi) {
      warnings.push(
        `${e.spell}: its team wins ${(rate * 100).toFixed(1)}% (allowed ${Math.round(lo * 100)}–${Math.round(hi * 100)}%)`,
      );
    }
    if (e.casts === 0) warnings.push(`${e.spell} was never cast`);
  }
  return warnings;
}

export function formatSpellEdges(
  edges: readonly SpellEdge[],
  meta: { gamesPerSpell: number; elapsedMs: number },
): string {
  const rows = [...edges]
    .sort((a, b) => b.wins / Math.max(1, b.wins + b.losses) - a.wins / Math.max(1, a.wins + a.losses))
    .map((e) => {
      const g = Math.max(1, e.games);
      return (
        `  ${e.spell.padEnd(14)}${String(e.games).padStart(6)}  ${pct(e.wins, e.wins + e.losses).padStart(6)}` +
        `${(e.casts / g).toFixed(1).padStart(9)}${(e.goals / g).toFixed(2).padStart(9)}`
      );
    });
  const warnings = spellEdgeWarnings(edges);
  return [
    `Spell edges — ${meta.gamesPerSpell} games per spell, its team against a team without it, sides alternating (${(meta.elapsedMs / 1000).toFixed(1)} s)`,
    `  spell          games    win%  casts/g  goals/g`,
    ...rows,
    warnings.length > 0
      ? `  SPELL WARNINGS:\n${warnings.map((w) => `    - ${w}`).join('\n')}`
      : '  spells: OK',
  ].join('\n');
}
