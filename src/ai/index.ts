import type { InputCommand, MatchState } from '../sim';

/**
 * An AI controller reads match state and returns the same commands a human would give.
 * M0 stub: stand still. Real decision-making arrives in M3.
 */
export interface Controller {
  decide(state: Readonly<MatchState>, playerId: number): InputCommand;
}

export const idleController: Controller = {
  decide: (_state, _playerId) => ({ move: { x: 0, y: 0 }, aim: { x: 0, y: 0 } }),
};
