import { secondsToTicks } from './actions';
import type { ArenaGeometry, TeamIndex } from './arena';
import type { SimConfig } from './config';
import { stickHead } from './players';
import type { MatchState, Player } from './types';

export const otherTeam = (t: TeamIndex): TeamIndex => (t === 0 ? 1 : 0);

/** Puts the ball in `p`'s stick. */
export function giveBall(state: MatchState, p: Player, config: SimConfig): void {
  const ball = state.ball;
  ball.carrier = p.id;
  ball.flight = null;
  ball.lastTouch = p.id;
  ball.pos = stickHead(p, config);
  ball.vel = { x: p.vel.x, y: p.vel.y };
  p.primaryTicks = 0;
}

/** Starts the shot clock fresh for `team` if possession changed (SPEC §4.3). */
export function gainPossession(state: MatchState, team: TeamIndex, config: SimConfig): void {
  if (state.shotClock.team !== team) {
    state.shotClock = { team, ticksLeft: secondsToTicks(config.shotClock.seconds, config) };
  }
}

/** Shot hit the frame or the goalie: the shot clock starts over (SPEC §4.3). */
export function resetShotClock(state: MatchState, config: SimConfig): void {
  state.shotClock.ticksLeft = secondsToTicks(config.shotClock.seconds, config);
}

/**
 * Turnover: `team` gets the ball. It goes to their goalie if `toGoalie` and they have one,
 * otherwise to their player nearest the ball (runners before goalies).
 */
export function turnOver(
  state: MatchState,
  team: TeamIndex,
  toGoalie: boolean,
  config: SimConfig,
): Player | null {
  const ball = state.ball;
  const loser = ball.carrier !== null ? state.players[ball.carrier] : undefined;
  if (loser) loser.stickCooldown = secondsToTicks(config.scoop.releaseCooldownSeconds, config);
  const theirs = state.players.filter((p) => p.team === team);
  const goalie = theirs.find((p) => p.role === 'goalie');
  let taker: Player | null = toGoalie && goalie ? goalie : null;
  if (!taker) {
    const d = (p: Player) => Math.hypot(p.pos.x - ball.pos.x, p.pos.y - ball.pos.y);
    const pool = theirs.some((p) => p.role === 'runner') ? theirs.filter((p) => p.role === 'runner') : theirs;
    for (const p of pool) if (!taker || d(p) < d(taker) || (d(p) === d(taker) && p.id < taker.id)) taker = p;
  }
  if (!taker) {
    ball.carrier = null;
    ball.flight = null;
    return null;
  }
  giveBall(state, taker, config);
  state.shotClock = { team, ticksLeft: secondsToTicks(config.shotClock.seconds, config) };
  return taker;
}

/** True if `p`'s center is inside the crease of the goal they attack (SPEC §4.4). */
export function inOpponentCrease(p: Player, arena: ArenaGeometry): boolean {
  const goal = arena.goals[otherTeam(p.team)];
  return Math.hypot(p.pos.x - goal.mouth.x, p.pos.y - goal.mouth.y) < goal.creaseRadius;
}

/** The first player of `team` standing in the opponent's crease, if any. */
export function attackerInCrease(state: MatchState, team: TeamIndex, arena: ArenaGeometry): Player | null {
  return state.players.find((p) => p.team === team && inOpponentCrease(p, arena)) ?? null;
}
