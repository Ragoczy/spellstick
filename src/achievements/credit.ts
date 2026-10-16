import {
  SPELL_POOL,
  secondsToTicks,
  type RunnerSpell,
  type SimConfig,
  type SimEvent,
  type TeamIndex,
} from '../sim';

/**
 * What one side's person did in an online match, for achievements (M14, docs/BADGES.md).
 * "You" is the witch you were steering when it happened: your AI teammates' goals and hits
 * aren't yours.
 */
export interface SeatCredit {
  /** Goals from shots you took. */
  goals: number;
  /** Opponents slammed into the boards just after your hit (`config.badges.slamCreditSeconds`). */
  boardSlams: number;
  /** Balls you knocked loose: a check, Thunderclap, or Snare. */
  loosens: number;
  /** The runner spells you cast (each once, in the order first cast). */
  spells: RunnerSpell[];
}

/** A whole match's credit, both sides. JSON-serializable. */
export interface MatchCredit {
  seats: [SeatCredit, SeatCredit];
  score: [number, number];
  /** The most each side trailed by at any point. */
  maxDeficit: [number, number];
  overtime: boolean;
}

const SIDES = [0, 1] as const;
const RUNNER_SPELLS = new Set<string>(SPELL_POOL);

/**
 * Builds a match's credit tick by tick from the sim's events and who each person steered
 * (`stepWorld`'s `steered`). Pure: the online room feeds it, and so can the headless sim.
 */
export class CreditTracker {
  private readonly credit: MatchCredit = {
    seats: [emptySeat(), emptySeat()],
    score: [0, 0],
    maxDeficit: [0, 0],
    overtime: false,
  };
  /** For each player id, the side whose person steered that player's latest shot (null: the AI's). */
  private readonly shotBy = new Map<number, TeamIndex | null>();
  /** For each player id, the last hit on them: the side whose person threw it, and when. */
  private readonly hitBy = new Map<number, { side: TeamIndex; tick: number }>();
  private tick = 0;
  private readonly slamTicks: number;

  /** `teams[id]`: each player's team. */
  constructor(
    config: SimConfig,
    private readonly teams: readonly TeamIndex[],
  ) {
    this.slamTicks = secondsToTicks(config.badges.slamCreditSeconds, config);
  }

  /** One stepped tick of the match. `steered[side]`: that side's person's witch, or null. */
  step(events: readonly SimEvent[], steered: readonly (number | null)[]): void {
    this.tick++;
    const c = this.credit;
    /** The side whose person was steering `id` this tick, or null. */
    const sideOf = (id: number | null): TeamIndex | null => {
      if (id === null) return null;
      for (const s of SIDES) if (steered[s] === id) return s;
      return null;
    };
    for (const e of events) {
      switch (e.type) {
        case 'shot':
          this.shotBy.set(e.playerId, sideOf(e.playerId));
          break;
        case 'goal': {
          c.score[e.team]++;
          for (const s of SIDES) c.maxDeficit[s] = Math.max(c.maxDeficit[s], c.score[1 - s]! - c.score[s]);
          if (e.scorer === null || this.teams[e.scorer] !== e.team) break;
          const side = this.shotBy.has(e.scorer) ? this.shotBy.get(e.scorer)! : sideOf(e.scorer);
          if (side === e.team) c.seats[side].goals++;
          break;
        }
        case 'check': {
          const side = sideOf(e.playerId);
          if (side === null) break;
          if (e.loosened) c.seats[side].loosens++;
          this.hitBy.set(e.targetId, { side, tick: this.tick });
          break;
        }
        case 'hexShove': {
          const side = sideOf(e.playerId);
          if (side === null) break;
          if (e.loosened) c.seats[side].loosens++;
          for (const id of e.hits) this.hitBy.set(id, { side, tick: this.tick });
          break;
        }
        case 'snare': {
          const side = sideOf(e.playerId);
          if (side !== null && e.loosened) c.seats[side].loosens++;
          break;
        }
        case 'boardSlam': {
          const hit = this.hitBy.get(e.playerId);
          if (!hit || this.tick - hit.tick > this.slamTicks) break;
          if (this.teams[e.playerId] === hit.side) break; // your own teammate doesn't count
          c.seats[hit.side].boardSlams++;
          this.hitBy.delete(e.playerId);
          break;
        }
        case 'cast': {
          const side = sideOf(e.playerId);
          if (side === null || !RUNNER_SPELLS.has(e.spell)) break;
          const spells = c.seats[side].spells;
          if (!spells.includes(e.spell as RunnerSpell)) spells.push(e.spell as RunnerSpell);
          break;
        }
        case 'periodStart':
          if (e.overtime) c.overtime = true;
          break;
        case 'matchEnd':
          c.score = [e.score[0], e.score[1]];
          break;
      }
    }
  }

  /** The credit so far (a copy). */
  result(): MatchCredit {
    return structuredClone(this.credit);
  }
}

function emptySeat(): SeatCredit {
  return { goals: 0, boardSlams: 0, loosens: 0, spells: [] };
}
