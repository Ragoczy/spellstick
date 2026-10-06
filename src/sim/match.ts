import { handleActions, isCharging, secondsToTicks } from './actions';
import { arenaFor } from './arena';
import { tryScoop, updateBall } from './ball';
import { resolveChecks, startCheck, stagger } from './checks';
import type { SimConfig } from './config';
import { movePlayer, separatePlayers, steer, updateFacing } from './players';
import { createRng } from './rng';
import {
  applyLiveRules,
  endMatch,
  isOvertime,
  resetPositions,
  setupFaceoff,
  startNextPeriod,
  stepFaceoff,
  tickGameClock,
} from './rules';
import { NO_INPUT, type InputCommand, type MatchState, type Player, type RosterEntry } from './types';

export { facingDir, stickHead } from './players';
export { scoopChance } from './ball';
export { resetPositions } from './rules';

export interface MatchOptions {
  /**
   * How play begins: 'faceoff' for a real match (SPEC §4.1), or 'live' with the ball loose
   * at center (drills and unit tests). Default 'live'.
   */
  start?: 'faceoff' | 'live';
}

/** Creates a fresh match. Same seed + config + roster + inputs ⇒ same match. */
export function createMatch(
  config: SimConfig,
  seed: number,
  roster: readonly RosterEntry[] = [],
  options: MatchOptions = {},
): MatchState {
  const state: MatchState = {
    tick: 0,
    rng: createRng(seed),
    phase: 'live',
    pauseTicks: 0,
    faceoff: null,
    shotClock: { team: null, ticksLeft: secondsToTicks(config.shotClock.seconds, config) },
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
      lean: r.lean ?? 'attack',
      checkCooldown: 0,
      dashTicks: 0,
      dashDir: { x: 0, y: 0 },
      dashHit: false,
      staggerTicks: 0,
    })),
    events: [],
  };
  resetPositions(state);
  if (options.start === 'faceoff') {
    setupFaceoff(state, config);
    state.events = [];
  }
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

  switch (state.phase) {
    case 'goalPause':
      if (--state.pauseTicks <= 0) {
        // Sudden death: an overtime goal ends it. Otherwise, faceoff (SPEC §4.1).
        if (isOvertime(state, config)) endMatch(state);
        else {
          setupFaceoff(state, config);
          state.events.push({ type: 'restart' });
        }
      }
      return;
    case 'periodBreak':
      if (--state.pauseTicks <= 0) startNextPeriod(state, config);
      return;
    case 'faceoff':
      stepFaceoff(state, inputs, config);
      return;
    case 'live':
      break;
  }

  const arena = arenaFor(config);
  const dt = 1 / config.tickHz;

  for (const p of state.players) {
    if (p.stickCooldown > 0) p.stickCooldown--;
    if (p.checkCooldown > 0) p.checkCooldown--;
    const input = inputs[p.id] ?? NO_INPUT;
    if (p.staggerTicks > 0) {
      // Staggered: no control. Track the button so releasing it later isn't read as a new press.
      p.staggerTicks--;
      p.primaryDown = input.primary === true;
      steer(p, NO_INPUT, 1, config, dt);
      continue;
    }
    updateFacing(p, input);
    handleActions(state, p, input, config);
    startCheck(p, input, config);
    if (p.dashTicks > 0) {
      p.vel = { x: p.dashDir.x * config.check.dashSpeed, y: p.dashDir.y * config.check.dashSpeed };
    } else {
      steer(p, input, speedMultiplier(state, p, config), config, dt);
    }
  }
  for (const p of state.players) {
    const impact = movePlayer(p, arena, config, dt);
    if (p.staggerTicks > 0 && impact > config.check.boardSlamSpeed) {
      stagger(p, p.staggerTicks + secondsToTicks(config.check.boardSlamExtraSeconds, config));
      state.events.push({ type: 'boardSlam', playerId: p.id, speed: impact });
    }
  }
  resolveChecks(state, arena, config);
  separatePlayers(state.players, arena, config);
  updateBall(state, arena, config, dt);
  if (state.phase !== 'live') return; // a goal was scored; the clocks stop
  tryScoop(state, config);
  applyLiveRules(state, arena, config);
  tickGameClock(state, config);
}

function speedMultiplier(state: MatchState, p: Player, config: SimConfig): number {
  if (state.ball.carrier !== p.id) return 1;
  return config.player.carrySpeedMultiplier * (isCharging(p, config) ? config.shot.chargeMoveMultiplier : 1);
}

/** Game-clock seconds left in the current period. */
export function periodSecondsLeft(state: MatchState, config: SimConfig): number {
  return state.periodTicksLeft / config.tickHz;
}
