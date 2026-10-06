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
}

export const NO_INPUT: Readonly<InputCommand> = Object.freeze({
  move: Object.freeze({ x: 0, y: 0 }),
  aim: Object.freeze({ x: 0, y: 0 }),
});

export interface Ball {
  pos: Vec2;
  vel: Vec2;
}

export interface Player {
  id: number;
  team: TeamIndex;
  pos: Vec2;
  vel: Vec2;
}

export type MatchPhase = 'live' | 'final';

/** Things that happened during a tick, for stats, audio, and announcer callouts. */
export type SimEvent = { type: 'periodEnd'; period: number } | { type: 'matchEnd'; score: [number, number] };

/** The full, JSON-serializable state of a match. */
export interface MatchState {
  tick: number;
  rng: RngState;
  phase: MatchPhase;
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
