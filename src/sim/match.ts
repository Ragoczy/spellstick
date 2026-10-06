import { arenaGeometry, type ArenaGeometry } from './arena';
import type { SimConfig } from './config';
import { boardContact, boxContact, goalBox, resolveContact } from './physics';
import { chance, createRng } from './rng';
import { NO_INPUT, type InputCommand, type MatchState, type Player, type RosterEntry } from './types';
import type { Vec2 } from './vec';

/** Creates a fresh match. Same seed + config + roster + inputs ⇒ same match. */
export function createMatch(
  config: SimConfig,
  seed: number,
  roster: readonly RosterEntry[] = [],
): MatchState {
  return {
    tick: 0,
    rng: createRng(seed),
    phase: 'live',
    period: 1,
    periodTicksLeft: periodTicks(config),
    score: [0, 0],
    ball: { pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 }, carrier: null },
    players: roster.map((r, id) => ({
      id,
      team: r.team,
      number: r.number,
      pos: { x: r.pos.x, y: r.pos.y },
      vel: { x: 0, y: 0 },
      facing: r.team === 0 ? 0 : Math.PI,
      scoopCooldown: 0,
    })),
    events: [],
  };
}

export function periodTicks(config: SimConfig): number {
  return Math.round(config.match.periodSeconds * config.tickHz);
}

const secondsToTicks = (s: number, config: SimConfig) => Math.round(s * config.tickHz);

const arenaCache = new WeakMap<SimConfig, ArenaGeometry>();
function arenaFor(config: SimConfig): ArenaGeometry {
  let arena = arenaCache.get(config);
  if (!arena) {
    arena = arenaGeometry(config);
    arenaCache.set(config, arena);
  }
  return arena;
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

  const arena = arenaFor(config);
  const dt = 1 / config.tickHz;
  state.tick++;

  for (const p of state.players) applyInput(state, p, inputs[p.id] ?? NO_INPUT, config, dt);
  for (const p of state.players) movePlayer(p, arena, config, dt);
  separatePlayers(state.players, arena, config);
  updateBall(state, arena, config, dt);
  tryScoop(state, config);
  tickClock(state, config);
}

/** Unit vector along a player's stick. */
export function facingDir(p: Player): Vec2 {
  return { x: Math.cos(p.facing), y: Math.sin(p.facing) };
}

/** Where the stick head (and a carried ball) is. */
export function stickHead(p: Player, config: SimConfig): Vec2 {
  const d = facingDir(p);
  return { x: p.pos.x + d.x * config.player.stickReach, y: p.pos.y + d.y * config.player.stickReach };
}

function applyInput(state: MatchState, p: Player, input: InputCommand, config: SimConfig, dt: number): void {
  if (p.scoopCooldown > 0) p.scoopCooldown--;
  const pc = config.player;
  const carrying = state.ball.carrier === p.id;

  // Steering: velocity approaches the desired velocity at a capped rate.
  let mx = input.move.x;
  let my = input.move.y;
  const mlen = Math.hypot(mx, my);
  if (mlen > 1) {
    mx /= mlen;
    my /= mlen;
  }
  const topSpeed = pc.maxSpeed * (carrying ? pc.carrySpeedMultiplier : 1);
  const dvx = mx * topSpeed - p.vel.x;
  const dvy = my * topSpeed - p.vel.y;
  const dvLen = Math.hypot(dvx, dvy);
  const maxDv = (mlen > 0.01 ? pc.accel : pc.friction) * dt;
  const k = dvLen > maxDv ? maxDv / dvLen : 1;
  p.vel.x += dvx * k;
  p.vel.y += dvy * k;

  // The stick points at the aim point.
  const ax = input.aim.x - p.pos.x;
  const ay = input.aim.y - p.pos.y;
  if (ax * ax + ay * ay > 0.0025) p.facing = Math.atan2(ay, ax);

  if (carrying && input.debugToss) {
    const d = facingDir(p);
    releaseBall(
      state,
      p,
      { x: d.x * config.debug.tossSpeed, y: d.y * config.debug.tossSpeed },
      'toss',
      config,
    );
  } else if (carrying && input.debugDrop) {
    const d = facingDir(p);
    const push = config.debug.dropPush;
    releaseBall(state, p, { x: p.vel.x + d.x * push, y: p.vel.y + d.y * push }, 'drop', config);
  }
}

function releaseBall(
  state: MatchState,
  p: Player,
  vel: Vec2,
  kind: 'drop' | 'toss',
  config: SimConfig,
): void {
  state.ball.carrier = null;
  state.ball.pos = stickHead(p, config);
  state.ball.vel = { x: vel.x, y: vel.y };
  p.scoopCooldown = secondsToTicks(config.scoop.releaseCooldownSeconds, config);
  state.events.push({ type: 'release', playerId: p.id, kind });
}

function movePlayer(p: Player, arena: ArenaGeometry, config: SimConfig, dt: number): void {
  p.pos.x += p.vel.x * dt;
  p.pos.y += p.vel.y * dt;
  keepPlayerInBounds(p, arena, config);
}

function keepPlayerInBounds(p: Player, arena: ArenaGeometry, config: SimConfig): void {
  const radius = config.player.radius;
  const board = boardContact(p.pos, radius, arena);
  if (board) resolveContact(p.pos, p.vel, board, config.player.boardRestitution);
  for (const goal of arena.goals) {
    const c = boxContact(p.pos, radius, goalBox(goal));
    if (c) resolveContact(p.pos, p.vel, c, 0);
  }
}

/** Pushes overlapping players apart and cancels their closing speed. */
function separatePlayers(players: Player[], arena: ArenaGeometry, config: SimConfig): void {
  const minDist = config.player.radius * 2;
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const a = players[i]!;
      const b = players[j]!;
      let dx = b.pos.x - a.pos.x;
      let dy = b.pos.y - a.pos.y;
      let d = Math.hypot(dx, dy);
      if (d >= minDist) continue;
      if (d < 1e-6) {
        // Exactly stacked: split along x, deterministically by id.
        dx = 1;
        dy = 0;
        d = 1;
      }
      const nx = dx / d;
      const ny = dy / d;
      const push = (minDist - Math.min(d, minDist)) / 2;
      a.pos.x -= nx * push;
      a.pos.y -= ny * push;
      b.pos.x += nx * push;
      b.pos.y += ny * push;
      const closing = (a.vel.x - b.vel.x) * nx + (a.vel.y - b.vel.y) * ny;
      if (closing > 0) {
        a.vel.x -= (nx * closing) / 2;
        a.vel.y -= (ny * closing) / 2;
        b.vel.x += (nx * closing) / 2;
        b.vel.y += (ny * closing) / 2;
      }
    }
  }
  for (const p of players) keepPlayerInBounds(p, arena, config);
}

function updateBall(state: MatchState, arena: ArenaGeometry, config: SimConfig, dt: number): void {
  const ball = state.ball;
  const bc = config.ball;

  if (ball.carrier !== null) {
    const p = state.players[ball.carrier]!;
    ball.pos = stickHead(p, config);
    ball.vel = { x: p.vel.x, y: p.vel.y };
    // Don't let the stick poke the ball through the boards or the goal.
    const board = boardContact(ball.pos, bc.radius, arena);
    if (board) resolveContact(ball.pos, { x: 0, y: 0 }, board, 0);
    for (const goal of arena.goals) {
      const c = boxContact(ball.pos, bc.radius, goalBox(goal));
      if (c) resolveContact(ball.pos, { x: 0, y: 0 }, c, 0);
    }
    return;
  }

  // Rolling friction: constant deceleration plus speed-proportional drag.
  const speed = Math.hypot(ball.vel.x, ball.vel.y);
  const newSpeed = Math.max(0, speed - (bc.rollingDecel + bc.drag * speed) * dt);
  if (newSpeed < bc.stopSpeed) {
    ball.vel.x = 0;
    ball.vel.y = 0;
    return;
  }
  ball.vel.x *= newSpeed / speed;
  ball.vel.y *= newSpeed / speed;

  // Substep so a fast ball can't tunnel through the goal frame.
  const steps = Math.min(8, Math.max(1, Math.ceil((newSpeed * dt) / bc.radius)));
  const h = dt / steps;
  let hardestBoardHit = 0;
  for (let s = 0; s < steps; s++) {
    ball.pos.x += ball.vel.x * h;
    ball.pos.y += ball.vel.y * h;
    const board = boardContact(ball.pos, bc.radius, arena);
    if (board) {
      const impact = resolveContact(ball.pos, ball.vel, board, bc.boardRestitution, bc.boardTangentKeep);
      hardestBoardHit = Math.max(hardestBoardHit, impact);
    }
    for (const goal of arena.goals) {
      const c = boxContact(ball.pos, bc.radius, goalBox(goal));
      if (c) resolveContact(ball.pos, ball.vel, c, bc.goalRestitution);
    }
  }
  if (hardestBoardHit > 1) state.events.push({ type: 'ballBoards', speed: hardestBoardHit });
}

/** The nearest eligible player gets one scoop attempt per tick at a loose ball. */
function tryScoop(state: MatchState, config: SimConfig): void {
  const ball = state.ball;
  if (ball.carrier !== null) return;
  const sc = config.scoop;

  let best: Player | null = null;
  let bestDist = sc.radius;
  for (const p of state.players) {
    if (p.scoopCooldown > 0) continue;
    const d = Math.hypot(ball.pos.x - p.pos.x, ball.pos.y - p.pos.y);
    if (d <= bestDist) {
      best = p;
      bestDist = d;
    }
  }
  if (!best) return;

  const rel = Math.hypot(ball.vel.x - best.vel.x, ball.vel.y - best.vel.y);
  const t = Math.min(1, rel / sc.fastRelSpeed);
  if (chance(state.rng, scoopChance(t, config))) {
    ball.carrier = best.id;
    state.events.push({ type: 'pickup', playerId: best.id, team: best.team });
    return;
  }

  // Fumble: the ball squirts away from the stick.
  best.scoopCooldown = secondsToTicks(sc.retrySeconds, config);
  let nx = ball.pos.x - best.pos.x;
  let ny = ball.pos.y - best.pos.y;
  const n = Math.hypot(nx, ny);
  if (n < 1e-6) {
    const d = facingDir(best);
    nx = d.x;
    ny = d.y;
  } else {
    nx /= n;
    ny /= n;
  }
  ball.vel.x += nx * sc.fumbleSpeed;
  ball.vel.y += ny * sc.fumbleSpeed;
  state.events.push({ type: 'scoopMiss', playerId: best.id });
}

/** Scoop success chance; `t` is relative speed as a fraction of `fastRelSpeed` (0..1). */
export function scoopChance(t: number, config: SimConfig): number {
  return config.scoop.chanceSlow + (config.scoop.chanceFast - config.scoop.chanceSlow) * t;
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
