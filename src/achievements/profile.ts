import { ACHIEVEMENT_IDS, type AchievementId } from '../content/badges';
import { SPELL_POOL, type SimConfig } from '../sim';
import { tierFor, toNextTier, type Career } from './evaluate';

/** A player's saved record (M14): what the server stores, by Discord id. */
export interface StoredPlayer {
  id: string;
  /** Their Discord name and avatar, as of their latest match or sign-in. */
  name: string;
  avatarUrl: string;
  tier: number;
  career: Career;
  /** When each achievement was unlocked (ISO time). */
  unlockedAt: Partial<Record<AchievementId, string>>;
}

/** A profile page's data (GET /api/profile/:id). Spells cast are a count only: picks stay hidden. */
export interface ProfileView {
  id: string;
  name: string;
  avatarUrl: string;
  /** 0 (none yet) to 5. */
  tier: number;
  /** More achievements to the next tier, or null at the top. */
  toNext: number | null;
  /** Unlocked achievements, in ACHIEVEMENT_IDS order. */
  achievements: { id: AchievementId; unlockedAt: string }[];
  matches: number;
  wins: number;
  goals: number;
  spellsCast: number;
  spellsTotal: number;
}

export function profileView(p: StoredPlayer, config: SimConfig): ProfileView {
  const unlocked = ACHIEVEMENT_IDS.filter((id) => p.career.achievements.includes(id));
  return {
    id: p.id,
    name: p.name,
    avatarUrl: p.avatarUrl,
    tier: tierFor(unlocked.length, config),
    toNext: toNextTier(unlocked.length, config),
    achievements: unlocked.map((id) => ({ id, unlockedAt: p.unlockedAt[id] ?? '' })),
    matches: p.career.matches,
    wins: p.career.wins,
    goals: p.career.goals,
    spellsCast: p.career.spellsCast.length,
    spellsTotal: SPELL_POOL.length,
  };
}
