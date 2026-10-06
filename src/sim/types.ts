import type { TeamIndex } from './arena';
import type { RngState } from './rng';
import type { Vec2 } from './vec';

export type { TeamIndex } from './arena';

/**
 * What one controller (human or AI) asks one player to do this tick. The AI produces
 * exactly these commands too; it never edits sim state directly.
 */
export interface InputCommand {
  /** Desired move direction; length is clamped to 1. */
  move: Vec2;
  /** World-space point the player is aiming at (passes, shots, directional spells). */
  aim: Vec2;
  /**
   * The pass/shoot button is held this tick. The sim turns presses into actions:
   * a short press is a pass on release; a longer hold charges a shot, fired on release.
   */
  primary?: boolean;
  /** Debug, edge-triggered: drop the ball at your feet. */
  debugDrop?: boolean;
}

export const NO_INPUT: Readonly<InputCommand> = Object.freeze({
  move: Object.freeze({ x: 0, y: 0 }),
  aim: Object.freeze({ x: 0, y: 0 }),
});

/** A pass or shot in the air. Cleared when it is caught, saved, blocked, hits something, or lands. */
export interface Flight {
  kind: 'pass' | 'shot';
  /** Id of the player who released it. */
  by: number;
  team: TeamIndex;
  /** Assist-magnetism receiver for a pass, if any. */
  target: number | null;
  /** Ticks in the air so far, and the tick it lands. */
  ticks: number;
  maxTicks: number;
  /** Where it was released (goalie reaction time scales with distance). */
  from: Vec2;
}

export interface Ball {
  pos: Vec2;
  vel: Vec2;
  /** Id of the player carrying the ball, or null when loose. */
  carrier: number | null;
  flight: Flight | null;
  /** Id of the last player to hold or release the ball (for goal credit). */
  lastTouch: number | null;
}

export type Role = 'runner' | 'goalie';

export interface Player {
  id: number;
  team: TeamIndex;
  role: Role;
  /** Jersey number, for display. */
  number: number;
  /** Start position; play resets here after a goal. */
  home: Vec2;
  pos: Vec2;
  vel: Vec2;
  /** Stick direction in radians (0 = +x). Follows the aim point. */
  facing: number;
  /** Ticks until this player may try to scoop or catch the ball again. */
  stickCooldown: number;
  /** Ticks the pass/shoot button has been held while carrying (0 = not pressed). */
  primaryTicks: number;
  /** Whether the button was down last tick (to detect fresh presses). */
  primaryDown: boolean;
}

/** Where a player starts. Player ids are their index in the roster. */
export interface RosterEntry {
  team: TeamIndex;
  number: number;
  pos: Vec2;
  role?: Role;
}

/** `goalPause`: dead ball after a goal; the clock and players are frozen. */
export type MatchPhase = 'live' | 'goalPause' | 'final';

/** Things that happened during a tick, for stats, audio, and announcer callouts. */
export type SimEvent =
  | { type: 'periodEnd'; period: number }
  | { type: 'matchEnd'; score: [number, number] }
  | { type: 'pickup'; playerId: number; team: TeamIndex }
  | { type: 'scoopMiss'; playerId: number }
  | { type: 'release'; playerId: number; kind: 'drop' }
  | { type: 'pass'; playerId: number; team: TeamIndex; target: number | null }
  | { type: 'shot'; playerId: number; team: TeamIndex; speed: number }
  | { type: 'catch'; playerId: number; team: TeamIndex; intercepted: boolean }
  | { type: 'dropPass'; playerId: number }
  | { type: 'save'; playerId: number; team: TeamIndex; caught: boolean }
  | { type: 'block'; playerId: number; team: TeamIndex }
  | { type: 'post'; team: TeamIndex }
  | { type: 'goal'; team: TeamIndex; scorer: number | null }
  | { type: 'restart' }
  | { type: 'ballBoards'; speed: number };

/** The full, JSON-serializable state of a match. */
export interface MatchState {
  tick: number;
  rng: RngState;
  phase: MatchPhase;
  /** Ticks left in the current dead-ball pause. */
  pauseTicks: number;
  /** 1-based period number. */
  period: number;
  /** Game-clock ticks left in the current period. Integers avoid float drift. */
  periodTicksLeft: number;
  score: [number, number];
  ball: Ball;
  players: Player[];
  /** Events emitted during the most recent tick only. */
  events: SimEvent[];
}
