import { secondsToTicks, type SimConfig } from './config';
import { createMatch } from './match';
import { gainPossession, giveBall } from './possession';
import { duelRoster, goaliePos } from './roster';
import type { MatchState, RosterEntry } from './types';
import type { Vec2 } from './vec';

/**
 * The training ground (M9): one small drill per lesson, each teaching one thing. A drill is
 * an ordinary match state with a custom roster, plus a judge that scores what the human does.
 * Pure sim code: the AI module turns `parts` into controllers, and the renderer just plays it.
 */
export type DrillId = 'scoop' | 'pass' | 'shoot' | 'bentShot' | 'check' | 'hexShove' | 'faceoff';

/** Lesson order. */
export const DRILLS: readonly DrillId[] = [
  'scoop',
  'pass',
  'shoot',
  'bentShot',
  'check',
  'hexShove',
  'faceoff',
];

/** Points needed to finish each drill. */
export const DRILL_TARGET: Readonly<Record<DrillId, number>> = {
  scoop: 2,
  pass: 3,
  shoot: 2,
  bentShot: 1,
  check: 2,
  hexShove: 1,
  faceoff: 2,
};

/**
 * How each player in a drill behaves when the human isn't controlling them:
 * stand still, stand and catch passes, keep goal, jog laps carrying the ball, or take faceoffs.
 */
export type DrillPart = 'idle' | 'receiver' | 'goalie' | 'jogger' | 'taker';

export interface Drill {
  id: DrillId;
  state: MatchState;
  /** The player the human controls at the start. */
  humanId: number;
  /** Behavior for every player id (including the human's, for when control moves on). */
  parts: DrillPart[];
}

export type DrillMiss =
  /** The goalie stopped it. */
  | 'saved'
  /** Wide, or off the post. */
  | 'missed'
  /** In the crease: carried in, or scored with a foot in it. */
  | 'crease'
  /** Scored, but without Bent Shot armed (the Bent Shot drill). */
  | 'notBent'
  /** Hex Shove reached nobody. */
  | 'tooFar'
  /** Jumped the faceoff whistle. */
  | 'early'
  /** Beaten to the faceoff. */
  | 'slow';

export type DrillVerdict = { kind: 'point'; reset: boolean } | { kind: 'miss'; reason: DrillMiss };

/** The match rules with the shot clock and period clock pushed out of the way, and a softer goalie. */
export function drillConfig(config: SimConfig): SimConfig {
  const long = config.training.clockSeconds;
  return {
    ...config,
    shotClock: { ...config.shotClock, seconds: long },
    match: { ...config.match, periodSeconds: long, overtimeSeconds: long },
    goalie: { ...config.goalie, saveBase: config.training.goalieSaveBase },
  };
}

/** The away goal's attackers come at it from the left; spots are in meters from center ice. */
const at = (x: number, y: number): Vec2 => ({ x, y });

/**
 * Sets up a drill. `rep` is how many points the player already has, so repeats can vary
 * (the second ball to scoop lies somewhere else). Pass a config from `drillConfig`.
 */
export function createDrill(config: SimConfig, id: DrillId, rep: number, seed: number): Drill {
  const runner = (team: 0 | 1, number: number, pos: Vec2): RosterEntry => ({
    team,
    number,
    pos,
    lean: 'attack',
  });
  const awayGoalie: RosterEntry = { team: 1, number: 1, pos: goaliePos(config, 1), role: 'goalie' };
  const second = rep % 2 === 1;

  let roster: RosterEntry[];
  let parts: DrillPart[];
  switch (id) {
    case 'scoop':
      roster = [runner(0, 7, at(-14, 0))];
      parts = ['idle'];
      break;
    case 'pass':
      roster = [runner(0, 7, at(-8, 2)), runner(0, 12, at(2, -7)), runner(0, 18, at(4, 7))];
      parts = ['receiver', 'receiver', 'receiver'];
      break;
    case 'shoot':
      roster = [runner(0, 7, second ? at(16, -4) : at(16, 4)), awayGoalie];
      parts = ['idle', 'goalie'];
      break;
    case 'bentShot':
      roster = [runner(0, 7, second ? at(15, -5) : at(15, 5)), awayGoalie];
      parts = ['idle', 'goalie'];
      break;
    case 'check':
    case 'hexShove':
      roster = [runner(0, 7, at(id === 'check' ? -10 : -7, 0)), runner(1, 9, joggerStart(config))];
      parts = ['idle', 'jogger'];
      break;
    case 'faceoff':
      roster = duelRoster().map((r) => ({ ...r, lean: 'attack' }));
      parts = ['idle', 'taker'];
      break;
  }

  const state = createMatch(config, seed, roster, { start: id === 'faceoff' ? 'faceoff' : 'live' });
  const human = state.players[0]!;
  switch (id) {
    case 'scoop':
      state.ball.pos = second ? at(8, -8) : at(-5, 6);
      break;
    case 'pass':
    case 'shoot':
    case 'bentShot':
      giveBall(state, human, config);
      gainPossession(state, 0, config);
      break;
    case 'check':
    case 'hexShove': {
      const jogger = state.players[1]!;
      giveBall(state, jogger, config);
      gainPossession(state, 1, config);
      break;
    }
    case 'faceoff':
      break;
  }
  // A drill is one attempt: the goalie's Ward would otherwise be fresh for every shot.
  for (const p of state.players) {
    if (p.role === 'goalie') p.spellCooldowns.ward = secondsToTicks(config.training.clockSeconds, config);
  }
  state.events = [];
  return { id, state, humanId: human.id, parts };
}

/** Where the jogger starts: on their lap circle, nearest our side. */
function joggerStart(config: SimConfig): Vec2 {
  const t = config.training;
  return { x: t.joggerOffset - t.joggerRadius, y: 0 };
}

/** The jogger's lap: a circle on their own half of center ice. */
export function joggerCircle(config: SimConfig): { center: Vec2; radius: number } {
  const t = config.training;
  return { center: { x: t.joggerOffset, y: 0 }, radius: t.joggerRadius };
}

/**
 * Scores a drill tick by tick from the sim's events. The human always plays the home side
 * (team 0); `humanId` is whoever they control right now.
 */
export class DrillJudge {
  /** A shot by our side is in the air: how it ends decides the point. */
  private shot: { bent: boolean } | null = null;
  /** Who last passed for our side, until someone else gets the ball. */
  private passer: number | null = null;

  constructor(readonly id: DrillId) {}

  observe(state: Readonly<MatchState>, humanId: number): DrillVerdict | null {
    const events = state.events;
    switch (this.id) {
      case 'scoop':
        return events.some((e) => e.type === 'pickup' && e.playerId === humanId)
          ? { kind: 'point', reset: true }
          : null;
      case 'pass':
        return this.passing(state);
      case 'shoot':
      case 'bentShot':
        return this.shooting(state);
      case 'check':
        return events.some((e) => e.type === 'check' && e.playerId === humanId)
          ? { kind: 'point', reset: true }
          : null;
      case 'hexShove':
        for (const e of events) {
          if (e.type !== 'hexShove' || e.playerId !== humanId) continue;
          if (e.loosened) return { kind: 'point', reset: true };
          if (e.hits.length === 0) return { kind: 'miss', reason: 'tooFar' };
        }
        return null;
      case 'faceoff':
        for (const e of events) {
          if (e.type !== 'faceoffWin' || e.team === null) continue;
          if (e.team === 0) return { kind: 'point', reset: true };
          return { kind: 'miss', reason: e.reason === 'misfire' ? 'early' : 'slow' };
        }
        return null;
    }
  }

  /**
   * A pass counts once a teammate gets the ball, caught clean or fumbled and scooped up: the
   * pass did its job either way. Running down your own pass doesn't count.
   */
  private passing(state: Readonly<MatchState>): DrillVerdict | null {
    for (const e of state.events) {
      if (e.type === 'pass' && e.team === 0) this.passer = e.playerId;
      const got = (e.type === 'catch' && !e.intercepted) || e.type === 'pickup';
      if (!got || e.team !== 0 || this.passer === null) continue;
      const scored = e.playerId !== this.passer;
      this.passer = null;
      if (scored) return { kind: 'point', reset: false };
    }
    return null;
  }

  private shooting(state: Readonly<MatchState>): DrillVerdict | null {
    for (const e of state.events) {
      switch (e.type) {
        case 'shot':
          if (e.team === 0) this.shot = { bent: (state.ball.flight?.spin ?? 0) !== 0 };
          break;
        case 'goal':
          if (e.team !== 0) break;
          if (this.id === 'bentShot' && !this.shot?.bent) return this.miss('notBent');
          this.shot = null;
          return { kind: 'point', reset: true };
        case 'goalDisallowed':
        case 'creaseViolation':
          return this.miss('crease');
        case 'save':
        case 'wardBlock':
          if (this.shot) return this.miss('saved');
          break;
        case 'post':
          if (this.shot) return this.miss('missed');
          break;
      }
    }
    // The shot came down (or was stopped) without going in.
    if (this.shot && state.phase === 'live' && state.ball.flight === null) return this.miss('missed');
    return null;
  }

  private miss(reason: DrillMiss): DrillVerdict {
    this.shot = null;
    return { kind: 'miss', reason };
  }
}
