import {
  counts,
  emptyCareer,
  evaluate,
  profileView,
  tierFor,
  type MatchRecord,
  type ProfileView,
  type StoredPlayer,
} from '../../src/achievements/index.js';
import type { AchievementId } from '../../src/content/badges.js';
import type { SimConfig, TeamIndex } from '../../src/sim/index.js';
import type { RoleSync } from './roles.js';
import type { AchievementStore } from './store.js';

/** What a player hears after a counting match (the `badges` message). */
export interface BadgeNews {
  userId: string;
  unlocked: AchievementId[];
  tier: number;
  promoted: boolean;
}

/**
 * Achievements and tier roles on the server (M14, docs/BADGES.md): records finished online
 * matches, serves profiles, deletes records, and keeps Discord tier roles in step. Updates to
 * one player run one at a time, so two matches ending together can't lose either.
 */
export class Badges {
  private readonly queues = new Map<string, Promise<unknown>>();

  constructor(
    private readonly store: AchievementStore,
    private readonly roles: RoleSync | null,
    private readonly config: SimConfig,
    /** Never passed Discord ids. */
    private readonly log: (message: string) => void,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** A finished online match: updates each player it counts for and says what they earned. */
  async record(match: MatchRecord): Promise<BadgeNews[]> {
    const news: BadgeNews[] = [];
    for (const side of [0, 1] as const) {
      if (!counts(match, side)) continue;
      try {
        news.push(await this.one(match, side));
      } catch (e) {
        this.log(`badges: saving a match failed (${(e as Error).message})`);
      }
    }
    return news;
  }

  private one(match: MatchRecord, side: TeamIndex): Promise<BadgeNews> {
    const seat = match.seats[side]!;
    return this.serially(seat.id, async () => {
      const before = await this.store.get(seat.id);
      const { career, unlocked } = evaluate(match.credit, side, before?.career ?? emptyCareer(), this.config);
      const at = this.now().toISOString();
      const tier = tierFor(career.achievements.length, this.config);
      const previousTier = before?.tier ?? 0;
      const player: StoredPlayer = {
        id: seat.id,
        name: seat.name,
        avatarUrl: seat.avatarUrl,
        tier,
        career,
        unlockedAt: { ...before?.unlockedAt, ...Object.fromEntries(unlocked.map((id) => [id, at])) },
      };
      await this.store.put(player);
      if (this.roles && tier !== previousTier) await this.roles.setTier(seat.id, tier, { previousTier });
      return { userId: seat.id, unlocked, tier, promoted: tier > previousTier };
    });
  }

  /** A profile page, or null if they've no record. */
  async profile(id: string): Promise<ProfileView | null> {
    const p = await this.store.get(id);
    return p ? profileView(p, this.config) : null;
  }

  /** Deletes a player's record and takes their tier role away. */
  deleteRecord(id: string): Promise<boolean> {
    return this.serially(id, async () => {
      const p = await this.store.get(id);
      if (!p) return false;
      await this.store.remove(id);
      if (this.roles && p.tier > 0) await this.roles.setTier(id, 0, { previousTier: p.tier });
      return true;
    });
  }

  /**
   * At sign-in: puts their tier role right (someone may have removed it, or the roles were set
   * up after they earned it) and refreshes their name and avatar. Nobody without a record gets one.
   */
  signedIn(
    user: { id: string; name: string; avatarUrl: string },
    memberRoles: readonly string[] | null,
  ): Promise<void> {
    return this.serially(user.id, async () => {
      const p = await this.store.get(user.id);
      if (!p) return;
      if (p.name !== user.name || p.avatarUrl !== user.avatarUrl) {
        await this.store.put({ ...p, name: user.name, avatarUrl: user.avatarUrl });
      }
      const tier = tierFor(p.career.achievements.length, this.config);
      if (this.roles && memberRoles) await this.roles.setTier(user.id, tier, { current: memberRoles });
    });
  }

  private serially<T>(id: string, run: () => Promise<T>): Promise<T> {
    const prev = this.queues.get(id) ?? Promise.resolve();
    const next = prev.catch(() => {}).then(run);
    this.queues.set(id, next);
    void next
      .finally(() => {
        if (this.queues.get(id) === next) this.queues.delete(id);
      })
      .catch(() => {});
    return next;
  }
}
