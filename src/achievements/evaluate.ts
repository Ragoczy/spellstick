import { ACHIEVEMENT_IDS, type AchievementId } from '../content/badges';
import { SPELL_POOL, type RunnerSpell, type SimConfig, type TeamIndex } from '../sim';
import type { MatchCredit } from './credit';

/** What's kept for a player between matches (M14). JSON-serializable. */
export interface Career {
  matches: number;
  wins: number;
  goals: number;
  /** The runner spells they've cast online, ever. */
  spellsCast: RunnerSpell[];
  /** What they've unlocked, oldest first. */
  achievements: AchievementId[];
}

export function emptyCareer(): Career {
  return { matches: 0, wins: 0, goals: 0, spellsCast: [], achievements: [] };
}

/** How a match ended and who played it, as the online room saw it. */
export interface MatchRecord {
  /** Reached the final whistle (not abandoned). */
  final: boolean;
  /** Who sat in each seat at the opening faceoff (user ids), and whether they were guests. */
  seats: [SeatRecord | null, SeatRecord | null];
  credit: MatchCredit;
}

export interface SeatRecord {
  id: string;
  /** Their name and avatar as the room had them, for the profile page. */
  name: string;
  avatarUrl: string;
  guest: boolean;
  /** Connected at the final whistle. */
  connectedAtEnd: boolean;
}

/**
 * Whether the match counts for `side`'s player (docs/BADGES.md): two different signed-in
 * people at the faceoff, played to the final whistle, and this one still there at the end.
 */
export function counts(record: MatchRecord, side: TeamIndex): boolean {
  const [a, b] = record.seats;
  if (!record.final || !a || !b || a.guest || b.guest || a.id === b.id) return false;
  return record.seats[side]!.connectedAtEnd;
}

/**
 * One counting match for one player: their career after it, and what they newly unlocked
 * (in ACHIEVEMENT_IDS order).
 */
export function evaluate(
  credit: MatchCredit,
  side: TeamIndex,
  before: Readonly<Career>,
  config: SimConfig,
): { career: Career; unlocked: AchievementId[] } {
  const b = config.badges;
  const mine = credit.seats[side];
  const ours = credit.score[side];
  const theirs = credit.score[1 - side]!;
  const won = ours > theirs;
  const spellsCast = [...before.spellsCast];
  for (const s of mine.spells) if (!spellsCast.includes(s)) spellsCast.push(s);

  const met: Record<AchievementId, boolean> = {
    firstWhistle: true,
    offTheMark: mine.goals >= 1,
    firstWin: won,
    hatTrick: mine.goals >= b.hatTrickGoals,
    intoTheBoards: mine.boardSlams >= b.boardSlams,
    lightFingers: mine.loosens >= b.loosens,
    shutout: won && theirs === 0,
    suddenDeath: won && credit.overtime,
    comeback: won && credit.maxDeficit[side] >= b.comebackDeficit,
    fullLibrary: SPELL_POOL.every((s) => spellsCast.includes(s)),
  };
  const unlocked = ACHIEVEMENT_IDS.filter((id) => met[id] && !before.achievements.includes(id));
  return {
    unlocked,
    career: {
      matches: before.matches + 1,
      wins: before.wins + (won ? 1 : 0),
      goals: before.goals + mine.goals,
      spellsCast,
      achievements: [...before.achievements, ...unlocked],
    },
  };
}

/** The tier (1–5) for this many achievements, or 0 for none yet. */
export function tierFor(achievements: number, config: SimConfig): number {
  let tier = 0;
  config.badges.tierThresholds.forEach((need, i) => {
    if (achievements >= need) tier = i + 1;
  });
  return tier;
}

/** How many more achievements to the next tier, or null at the top. */
export function toNextTier(achievements: number, config: SimConfig): number | null {
  const next = config.badges.tierThresholds.find((need) => need > achievements);
  return next === undefined ? null : next - achievements;
}
