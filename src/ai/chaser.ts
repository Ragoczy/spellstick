import type { Controller } from './index';
import type { ArenaGeometry, InputCommand, MatchState, Vec2 } from '../sim';

/** Laps the carrier runs, as fractions of the rink half-length / half-width. */
const WAYPOINTS: readonly Vec2[] = [
  { x: 0.6, y: -0.6 },
  { x: 0.6, y: 0.6 },
  { x: -0.2, y: 0.5 },
  { x: -0.6, y: -0.5 },
  { x: 0.1, y: 0 },
];
const ARRIVE_RADIUS = 2;
const SLOW_RADIUS = 1.5;
const LEAD_SECONDS = 0.3;
/** Gap a defender keeps from the carrier, on the goal side. */
const MARK_GAP = 2.5;
/** A carrier slower than this while trying to move is blocked... */
const BLOCKED_SPEED = 0.5;
/** ...and picks a new waypoint after this many ticks of it. */
const BLOCKED_TICKS = 30;

/**
 * M1 placeholder AI for the headless sim: chase the loose ball, mark the carrier from
 * the goal side, and when carrying, run laps between waypoints. Real team AI is M3.
 */
export function createChaser(arena: ArenaGeometry, startIndex = 0): Controller {
  let waypoint = startIndex % WAYPOINTS.length;
  let blockedTicks = 0;
  return {
    decide(state: Readonly<MatchState>, playerId: number): InputCommand {
      const p = state.players[playerId]!;
      const ball = state.ball;

      if (ball.carrier === playerId) {
        const w = WAYPOINTS[waypoint]!;
        const target = { x: w.x * arena.halfLength, y: w.y * arena.halfWidth };
        blockedTicks = Math.hypot(p.vel.x, p.vel.y) < BLOCKED_SPEED ? blockedTicks + 1 : 0;
        if (
          Math.hypot(target.x - p.pos.x, target.y - p.pos.y) < ARRIVE_RADIUS ||
          blockedTicks > BLOCKED_TICKS
        ) {
          waypoint = (waypoint + 1) % WAYPOINTS.length;
          blockedTicks = 0;
        }
        return { move: seek(p.pos, target, 0), aim: target };
      }
      blockedTicks = 0;

      if (ball.carrier === null) {
        const target = {
          x: ball.pos.x + ball.vel.x * LEAD_SECONDS,
          y: ball.pos.y + ball.vel.y * LEAD_SECONDS,
        };
        return { move: seek(p.pos, target, SLOW_RADIUS), aim: ball.pos };
      }

      // Someone else has it: mark them from between them and our goal.
      const carrier = state.players[ball.carrier]!;
      const goal = arena.goals[p.team].mouth;
      const dx = goal.x - carrier.pos.x;
      const dy = goal.y - carrier.pos.y;
      const d = Math.hypot(dx, dy) || 1;
      const gap = Math.min(MARK_GAP, d);
      const target = { x: carrier.pos.x + (dx / d) * gap, y: carrier.pos.y + (dy / d) * gap };
      return { move: seek(p.pos, target, SLOW_RADIUS), aim: carrier.pos };
    },
  };
}

/** Unit-ish direction toward `target`, easing off inside `slowRadius`. */
function seek(from: Vec2, target: Vec2, slowRadius: number): Vec2 {
  const dx = target.x - from.x;
  const dy = target.y - from.y;
  const d = Math.hypot(dx, dy);
  if (d < 1e-6) return { x: 0, y: 0 };
  const s = slowRadius > 0 ? Math.min(1, d / slowRadius) : 1;
  return { x: (dx / d) * s, y: (dy / d) * s };
}
