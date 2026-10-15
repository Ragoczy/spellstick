import type { TeamIndex } from './arena';
import type { MatchState } from './types';

/**
 * Which witch a person controls (SPEC §5): they take every faceoff, control follows the ball
 * when their team gets it, and Space switches on defense. Single-player runs this on the
 * screen; online (SPEC §11) the server and the screens both run it, so they agree.
 */

/** The witch a person controls when play starts or restarts: their faceoff taker, or their first runner. */
export function startingControl(state: Readonly<MatchState>, team: TeamIndex): number {
  if (state.faceoff) return state.faceoff.takers[team];
  return state.players.findIndex((p) => p.team === team && p.role === 'runner');
}

/**
 * After a sim tick: a faceoff just set up hands you your taker, and your team picking up the
 * ball hands you the carrier. Otherwise control stays where it was.
 */
export function followPlay(state: Readonly<MatchState>, team: TeamIndex, current: number): number {
  let id = current;
  for (const e of state.events) if (e.type === 'faceoffSet') id = e.takers[team];
  const carrier = state.ball.carrier !== null ? state.players[state.ball.carrier] : undefined;
  if (carrier && carrier.team === team && carrier.role === 'runner') id = carrier.id;
  return id;
}

/**
 * Space (SPEC §5): on defense, take over the teammate nearest the ball; if that's already
 * you, the next nearest. Not during a faceoff, and not while your team has the ball.
 */
export function switchControl(state: Readonly<MatchState>, team: TeamIndex, current: number): number {
  if (state.phase === 'faceoff') return current;
  const carrier = state.ball.carrier !== null ? state.players[state.ball.carrier] : undefined;
  if (carrier && carrier.team === team) return current;
  const ball = state.ball.pos;
  const mates = state.players
    .filter((p) => p.team === team && p.role === 'runner')
    .sort(
      (a, b) =>
        Math.hypot(a.pos.x - ball.x, a.pos.y - ball.y) - Math.hypot(b.pos.x - ball.x, b.pos.y - ball.y) ||
        a.id - b.id,
    );
  const next = mates[0]?.id === current ? mates[1] : mates[0];
  return next ? next.id : current;
}
