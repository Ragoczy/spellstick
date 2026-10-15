import type { Controller } from './index';
import { joggerCircle, type Drill, type InputCommand, type MatchState, type SimConfig } from '../sim';
import { createGoalieAI } from './goalie';
import { createRunnerAI } from './runner';
import { seek } from './steering';

/**
 * Controllers for the training ground's drills (M9), one per player by its drill part.
 * Like every AI, they only send input commands. The human's player gets one too, for
 * when control moves to a teammate.
 */
export function createDrillControllers(drill: Drill, config: SimConfig, seed: number): Controller[] {
  const level = config.ai.levels[config.training.opponentLevel];
  return drill.parts.map((part, id) => {
    switch (part) {
      case 'idle':
        return standStill;
      case 'receiver':
        return receiver;
      case 'goalie':
        return createGoalieAI(config, level);
      case 'jogger':
        return createJoggerAI(config);
      case 'taker':
        return createRunnerAI(config, seed * 101 + id, level);
    }
  });
}

const standStill: Controller = {
  decide: (state, id) => ({ move: { x: 0, y: 0 }, aim: aimAtBall(state, id) }),
};

/** Points the stick at the ball (or straight ahead if it's right on top of us). */
function aimAtBall(state: Readonly<MatchState>, id: number) {
  const me = state.players[id]!;
  const b = state.ball.pos;
  return Math.hypot(b.x - me.pos.x, b.y - me.pos.y) > 0.5
    ? { x: b.x, y: b.y }
    : { x: me.pos.x + 1, y: me.pos.y };
}

/**
 * A teammate who holds their spot, stick toward the ball, steps to meet a pass meant for
 * them, and goes for a loose ball when they're the nearest one to it (a fumbled pass).
 */
const receiver: Controller = {
  decide(state, id): InputCommand {
    const me = state.players[id]!;
    const ball = state.ball;
    if (state.phase === 'live' && ball.flight?.kind === 'pass' && ball.flight.target === id) {
      return { move: seek(me.pos, ball.pos, 3), aim: ball.pos };
    }
    if (state.phase === 'live' && ball.carrier === null && ball.flight === null && nearestToBall(state, id)) {
      return { move: seek(me.pos, ball.pos, 0), aim: ball.pos };
    }
    return { move: seek(me.pos, me.home, 0.5), aim: aimAtBall(state, id) };
  },
};

/** True if no teammate is closer to the ball than `id` (ties go to the lower id). */
function nearestToBall(state: Readonly<MatchState>, id: number): boolean {
  const me = state.players[id]!;
  const d = (p: { pos: { x: number; y: number } }) =>
    Math.hypot(p.pos.x - state.ball.pos.x, p.pos.y - state.ball.pos.y);
  return state.players.every(
    (p) => p.id === id || p.team !== me.team || d(p) > d(me) || (d(p) === d(me) && p.id > id),
  );
}

/**
 * An opponent who jogs laps around a circle carrying the ball, slow enough to catch, and
 * goes back for the ball if it's knocked loose. Something to hit.
 */
function createJoggerAI(config: SimConfig): Controller {
  const { center, radius } = joggerCircle(config);
  const speed = config.training.joggerSpeed;
  return {
    decide(state, id): InputCommand {
      const me = state.players[id]!;
      const ball = state.ball;
      if (state.phase !== 'live') return { move: { x: 0, y: 0 }, aim: aimAtBall(state, id) };
      if (ball.carrier === id) {
        // Along the circle, steering back onto it if knocked off.
        const dx = me.pos.x - center.x;
        const dy = me.pos.y - center.y;
        const d = Math.hypot(dx, dy) || 1;
        const pull = Math.max(-1, Math.min(1, (radius - d) / radius)) * 2;
        const mx = -dy / d + (dx / d) * pull;
        const my = dx / d + (dy / d) * pull;
        const m = Math.hypot(mx, my) || 1;
        const move = { x: (mx / m) * speed, y: (my / m) * speed };
        return { move, aim: { x: me.pos.x + move.x * 4, y: me.pos.y + move.y * 4 } };
      }
      if (ball.carrier === null && ball.flight === null) {
        return { move: seek(me.pos, ball.pos, 0), aim: ball.pos };
      }
      return { move: { x: 0, y: 0 }, aim: aimAtBall(state, id) };
    },
  };
}
