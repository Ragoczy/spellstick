import { handleActions, isCharging, secondsToTicks } from './actions';
import { arenaFor } from './arena';
import { tryScoop, updateBall } from './ball';
import type { SimConfig } from './config';
import { movePlayer, separatePlayers, steer, updateFacing } from './players';
import { createRng } from './rng';
import { NO_INPUT, type InputCommand, type MatchState, type Player, type RosterEntry } from './types';

export { facingDir, stickHead } from './players';
export { scoopChance } from './ball';

/** Creates a fresh match. Same seed + config + roster + inputs ⇒ same match. */
export function createMatch(
  config: SimConfig,
  seed: number,
  roster: readonly RosterEntry[] = [],
): MatchState {
  const state: MatchState = {
    tick: 0,
    rng: createRng(seed),
    phase: 'live',
    pauseTicks: 0,
    period: 1,
    periodTicksLeft: periodTicks(config),
    score: [0, 0],
    ball: { pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 }, carrier: null, flight: null, lastTouch: null },
    players: roster.map((r, id) => ({
      id,
      team: r.team,
      role: r.role ?? 'runner',
      number: r.number,
      home: { x: r.pos.x, y: r.pos.y },
      pos: { x: r.pos.x, y: r.pos.y },
      vel: { x: 0, y: 0 },
      facing: 0,
      stickCooldown: 0,
      primaryTicks: 0,
      primaryDown: false,
    })),
    events: [],
  };
  resetPositions(state);
  return state;
}

export function periodTicks(config: SimConfig): number {
  return secondsToTicks(config.match.periodSeconds, config);
}

/**
 * Advances the match by exactly one fixed tick, mutating `state` in place.
 * `inputs` is indexed by player id; missing entries mean "no input".
 */
export function stepMatch(
  state: MatchState,
  inputs: ReadonlyArray<InputCommand | undefined>,
  config: SimConfig,
): void {
  state.events = [];
  if (state.phase === 'final') return;
  state.tick++;

  if (state.phase === 'goalPause') {
    if (--state.pauseTicks <= 0) {
      resetPositions(state);
      state.phase = 'live';
      state.events.push({ type: 'restart' });
    }
    return;
  }

  const arena = arenaFor(config);
  const dt = 1 / config.tickHz;

  for (const p of state.players) {
    if (p.stickCooldown > 0) p.stickCooldown--;
    const input = inputs[p.id] ?? NO_INPUT;
    updateFacing(p, input);
    handleActions(state, p, input, config);
    steer(p, input, speedMultiplier(state, p, config), config, dt);
  }
  for (const p of state.players) movePlayer(p, arena, config, dt);
  separatePlayers(state.players, arena, config);
  updateBall(state, arena, config, dt);
  if (state.phase !== 'live') return; // a goal was scored; the clock stops
  tryScoop(state, config);
  tickClock(state, config);
}

function speedMultiplier(state: MatchState, p: Player, config: SimConfig): number {
  if (state.ball.carrier !== p.id) return 1;
  return config.player.carrySpeedMultiplier * (isCharging(p, config) ? config.shot.chargeMoveMultiplier : 1);
}

/** Puts every player back at their start spot and the ball loose at center. */
export function resetPositions(state: MatchState): void {
  for (const p of state.players) {
    p.pos = { x: p.home.x, y: p.home.y };
    p.vel = { x: 0, y: 0 };
    p.facing = p.team === 0 ? 0 : Math.PI;
    p.stickCooldown = 0;
    p.primaryTicks = 0;
  }
  state.ball = { pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 }, carrier: null, flight: null, lastTouch: null };
}

function tickClock(state: MatchState, config: SimConfig): void {
  state.periodTicksLeft--;
  if (state.periodTicksLeft > 0) return;
  state.events.push({ type: 'periodEnd', period: state.period });
  if (state.period >= config.match.periods) {
    state.phase = 'final';
    state.periodTicksLeft = 0;
    state.events.push({ type: 'matchEnd', score: [state.score[0], state.score[1]] });
  } else {
    state.period++;
    state.periodTicksLeft = periodTicks(config);
  }
}

/** Game-clock seconds left in the current period. */
export function periodSecondsLeft(state: MatchState, config: SimConfig): number {
  return state.periodTicksLeft / config.tickHz;
}
