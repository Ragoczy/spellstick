import type { Controller } from './index';
import {
  arenaFor,
  distToSegment,
  type InputCommand,
  type MatchState,
  type SimConfig,
  type Vec2,
} from '../sim';
import { seek } from './steering';

export interface GoalieSkill {
  /** Ticks after a shot is released before the goalie starts moving to its line. */
  reactionTicks: number;
  /** Ticks the goalie holds a caught ball before clearing it. */
  holdTicks: number;
}

export const DEFAULT_GOALIE_SKILL: GoalieSkill = { reactionTicks: 8, holdTicks: 50 };

/** Distance in front of the goal line the goalie patrols. */
const ARC_RADIUS = 1.6;
/** Widest angle off straight-out the goalie will follow the ball (radians). */
const MAX_ARC_ANGLE = 1.25;
/** Goalie leaves the crease for loose balls this close to the goal mouth. */
const CHASE_LOOSE_RANGE = 4.5;

/**
 * AI goalie: shadow the ball along an arc in front of the goal, jump to a shot's line
 * after a reaction delay, scoop loose balls near the crease, and clear the ball after
 * holding it briefly. Emits the same commands as a human.
 */
export function createGoalieAI(config: SimConfig, skill: GoalieSkill = DEFAULT_GOALIE_SKILL): Controller {
  let heldTicks = 0;
  let releaseNext = false;
  let clearAim: Vec2 = { x: 0, y: 0 };

  return {
    decide(state: Readonly<MatchState>, id: number): InputCommand {
      const me = state.players[id]!;
      const goal = arenaFor(config).goals[me.team];
      const out = -goal.backDir; // +x for the left goal
      const ball = state.ball;

      if (ball.carrier === id) {
        if (releaseNext) {
          releaseNext = false;
          heldTicks = 0;
          return { move: { x: 0, y: 0 }, aim: clearAim, primary: false };
        }
        heldTicks++;
        if (heldTicks >= skill.holdTicks) {
          clearAim = chooseClearTarget(state, id, out);
          releaseNext = true;
          return { move: { x: 0, y: 0 }, aim: clearAim, primary: true };
        }
        const home = { x: goal.mouth.x + out * ARC_RADIUS, y: goal.mouth.y };
        return { move: seek(me.pos, home, 1), aim: { x: me.pos.x + out * 10, y: me.pos.y } };
      }
      heldTicks = 0;
      releaseNext = false;

      const flight = ball.flight;
      // Shot coming at our goal: get on its line once we've reacted.
      if (
        flight &&
        flight.kind === 'shot' &&
        flight.team !== me.team &&
        flight.ticks >= skill.reactionTicks
      ) {
        const vx = ball.vel.x;
        if (vx * goal.backDir > 0) {
          const t = (goal.mouth.x - ball.pos.x) / vx;
          const yCross = ball.pos.y + ball.vel.y * t;
          const y = Math.max(-goal.width / 2 - 0.3, Math.min(goal.width / 2 + 0.3, yCross - goal.mouth.y));
          const spot = { x: goal.mouth.x + out * 0.8, y: goal.mouth.y + y };
          return { move: seek(me.pos, spot, 0.3), aim: ball.pos };
        }
      }

      // Loose ground ball near our goal: go get it if we're the closest.
      if (ball.carrier === null && !flight) {
        const dGoal = Math.hypot(ball.pos.x - goal.mouth.x, ball.pos.y - goal.mouth.y);
        const dMe = Math.hypot(ball.pos.x - me.pos.x, ball.pos.y - me.pos.y);
        const closest = state.players.every(
          (p) => p.id === id || Math.hypot(ball.pos.x - p.pos.x, ball.pos.y - p.pos.y) > dMe,
        );
        if (dGoal < CHASE_LOOSE_RANGE && closest) return { move: seek(me.pos, ball.pos, 0.5), aim: ball.pos };
      }

      // Shadow the ball on an arc in front of the goal.
      const angle = Math.max(
        -MAX_ARC_ANGLE,
        Math.min(MAX_ARC_ANGLE, Math.atan2(ball.pos.y - goal.mouth.y, (ball.pos.x - goal.mouth.x) * out)),
      );
      const spot = {
        x: goal.mouth.x + out * Math.cos(angle) * ARC_RADIUS,
        y: goal.mouth.y + Math.sin(angle) * ARC_RADIUS,
      };
      return { move: seek(me.pos, spot, 0.5), aim: ball.pos };
    },
  };
}

/** Outlet to the most open teammate upfield, or a long clear down the middle if nobody's open. */
function chooseClearTarget(state: Readonly<MatchState>, id: number, out: number): Vec2 {
  const me = state.players[id]!;
  let best: Vec2 | null = null;
  let bestScore = -Infinity;
  for (const q of state.players) {
    if (q.team !== me.team || q.id === id) continue;
    // Open = no opponent near the passing lane.
    const lane = Math.min(
      ...state.players.filter((o) => o.team !== me.team).map((o) => distToSegment(o.pos, me.pos, q.pos)),
      Infinity,
    );
    if (lane < 1.5) continue;
    const score = (q.pos.x - me.pos.x) * out + lane;
    if (score > bestScore) {
      bestScore = score;
      best = q.pos;
    }
  }
  return best ?? { x: me.pos.x + out * 20, y: me.pos.y * 0.3 };
}
