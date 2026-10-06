import { secondsToTicks } from './actions';
import type { ArenaGeometry, GoalGeometry, TeamIndex } from './arena';
import type { SimConfig } from './config';
import {
  boardContact,
  boxContact,
  distToSegment,
  goalBox,
  goalFrameSegments,
  resolveContact,
  segmentContact,
} from './physics';
import { stickHead } from './players';
import { attackerInCrease, turnOver } from './possession';
import { chance, nextFloat, nextRange } from './rng';
import type { Flight, MatchState, Player } from './types';
import { degToRad, rotate, type Vec2 } from './vec';

/** Moves the ball one tick: carried, in flight, or rolling. May score a goal. */
export function updateBall(state: MatchState, arena: ArenaGeometry, config: SimConfig, dt: number): void {
  const ball = state.ball;
  const bc = config.ball;

  if (ball.carrier !== null) {
    const p = state.players[ball.carrier]!;
    ball.pos = stickHead(p, config);
    ball.vel = { x: p.vel.x, y: p.vel.y };
    // Don't let the stick poke the ball through the boards or into a goal.
    const board = boardContact(ball.pos, bc.radius, arena);
    if (board) resolveContact(ball.pos, { x: 0, y: 0 }, board, 0);
    for (const goal of arena.goals) {
      const c = boxContact(ball.pos, bc.radius, goalBox(goal));
      if (c) resolveContact(ball.pos, { x: 0, y: 0 }, c, 0);
    }
    return;
  }

  const flight = ball.flight;
  if (flight) {
    if (flight.kind === 'pass' && flight.target !== null) homeTowardReceiver(state, flight, config, dt);
    const speed = Math.hypot(ball.vel.x, ball.vel.y);
    const k = Math.max(0, 1 - bc.airDrag * dt);
    ball.vel.x *= k;
    ball.vel.y *= k;
    flight.ticks++;
    if (flight.ticks >= flight.maxTicks || speed < bc.stopSpeed) ball.flight = null;
  } else {
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
  }

  // Substep so a fast ball can't tunnel through a post, a goalie, or the goal line.
  const speed = Math.hypot(ball.vel.x, ball.vel.y);
  const steps = Math.min(12, Math.max(1, Math.ceil((speed * dt) / bc.radius)));
  const h = dt / steps;
  let hardestBoardHit = 0;
  for (let s = 0; s < steps; s++) {
    const prev = { x: ball.pos.x, y: ball.pos.y };
    ball.pos.x += ball.vel.x * h;
    ball.pos.y += ball.vel.y * h;

    for (const goal of arena.goals) {
      if (crossedGoalLine(prev, ball.pos, goal)) {
        scoreGoal(state, goal, arena, config);
        return;
      }
    }

    const board = boardContact(ball.pos, bc.radius, arena);
    if (board) {
      const impact = resolveContact(ball.pos, ball.vel, board, bc.boardRestitution, bc.boardTangentKeep);
      hardestBoardHit = Math.max(hardestBoardHit, impact);
      ball.flight = null;
    }
    for (const goal of arena.goals) {
      for (const seg of goalFrameSegments(goal)) {
        const c = segmentContact(ball.pos, bc.radius, seg);
        if (!c) continue;
        const impact = resolveContact(ball.pos, ball.vel, c, bc.goalRestitution);
        if (impact > 0 && ball.flight?.kind === 'shot') {
          state.events.push({ type: 'post', team: ball.flight.team });
        }
        if (impact > 0) ball.flight = null;
      }
    }

    if (ball.flight && resolveFlightContacts(state, prev, config)) break;
  }
  if (hardestBoardHit > 1) state.events.push({ type: 'ballBoards', speed: hardestBoardHit });
}

/** Assist magnetism: bend a pass toward its receiver's stick, at a capped turn rate. */
function homeTowardReceiver(state: MatchState, flight: Flight, config: SimConfig, dt: number): void {
  const ball = state.ball;
  const receiver = state.players[flight.target!];
  if (!receiver) return;
  const head = stickHead(receiver, config);
  const tx = head.x - ball.pos.x;
  const ty = head.y - ball.pos.y;
  const speed = Math.hypot(ball.vel.x, ball.vel.y);
  if (speed < 1e-6 || tx * ball.vel.x + ty * ball.vel.y <= 0) return; // already past them
  const current = Math.atan2(ball.vel.y, ball.vel.x);
  let delta = Math.atan2(ty, tx) - current;
  while (delta > Math.PI) delta -= 2 * Math.PI;
  while (delta < -Math.PI) delta += 2 * Math.PI;
  const maxTurn = degToRad(config.pass.homingDegPerSec) * dt;
  const turn = Math.max(-maxTurn, Math.min(maxTurn, delta));
  ball.vel = rotate(ball.vel, turn);
}

/** True if the ball center crossed this goal's mouth, between the posts, heading in. */
function crossedGoalLine(prev: Vec2, pos: Vec2, goal: GoalGeometry): boolean {
  const before = (prev.x - goal.mouth.x) * goal.backDir;
  const after = (pos.x - goal.mouth.x) * goal.backDir;
  if (!(before < 0 && after >= 0)) return false;
  const t = before / (before - after);
  const y = prev.y + (pos.y - prev.y) * t;
  return Math.abs(y - goal.mouth.y) < goal.width / 2;
}

function scoreGoal(state: MatchState, goal: GoalGeometry, arena: ArenaGeometry, config: SimConfig): void {
  const ball = state.ball;
  const team: TeamIndex = goal.defendedBy === 0 ? 1 : 0;
  // SPEC §4.4: no goal while any attacker is in the crease; the defense gets the ball.
  const intruder = attackerInCrease(state, team, arena);
  if (intruder) {
    state.events.push({ type: 'goalDisallowed', team, attackerId: intruder.id });
    turnOver(state, goal.defendedBy, true, config);
    return;
  }
  const toucher = ball.lastTouch !== null ? state.players[ball.lastTouch] : undefined;
  const scorer = toucher && toucher.team === team ? toucher.id : null;
  state.score[team]++;
  ball.pos = { x: goal.mouth.x + goal.backDir * goal.depth * 0.5, y: ball.pos.y };
  ball.vel = { x: 0, y: 0 };
  ball.flight = null;
  state.phase = 'goalPause';
  state.pauseTicks = secondsToTicks(config.match.goalPauseSeconds, config);
  state.events.push({ type: 'goal', team, scorer });
}

/**
 * Catches, interceptions, saves, and blocks along the ball's path this substep.
 * Returns true if the flight ended.
 */
function resolveFlightContacts(state: MatchState, prev: Vec2, config: SimConfig): boolean {
  const flight = state.ball.flight!;
  return flight.kind === 'shot'
    ? resolveShot(state, flight, prev, config)
    : resolvePass(state, flight, prev, config);
}

/** Distance from a player's catch zone (body center to stick head) to the ball's path. */
function reachDistance(p: Player, prev: Vec2, pos: Vec2, config: SimConfig): number {
  return Math.min(distToSegment(p.pos, prev, pos), distToSegment(stickHead(p, config), prev, pos));
}

function resolvePass(state: MatchState, flight: Flight, prev: Vec2, config: SimConfig): boolean {
  const ball = state.ball;
  const best = nearestWithFairTies(
    state,
    state.players.filter((p) => p.stickCooldown === 0),
    (p) => {
      const reach = p.role === 'goalie' ? config.goalie.saveRadius : config.catch.radius;
      const d =
        p.role === 'goalie' ? distToSegment(p.pos, prev, ball.pos) : reachDistance(p, prev, ball.pos, config);
      return d <= reach ? d : Infinity;
    },
    Infinity,
  );
  if (!best) return false;

  const cc = config.catch;
  const rel = Math.hypot(ball.vel.x - best.vel.x, ball.vel.y - best.vel.y);
  const t = Math.min(1, rel / cc.fastRelSpeed);
  const sameTeam = best.team === flight.team;
  const p = sameTeam
    ? cc.chanceSlow + (cc.chanceFast - cc.chanceSlow) * t
    : best.role === 'goalie'
      ? config.goalie.passInterceptChance
      : cc.interceptSlow + (cc.interceptFast - cc.interceptSlow) * t;

  if (chance(state.rng, p)) {
    takePossession(state, best);
    state.events.push({ type: 'catch', playerId: best.id, team: best.team, intercepted: !sameTeam });
    return true;
  }
  best.stickCooldown = secondsToTicks(config.scoop.retrySeconds, config);
  if (!sameTeam) return false; // a missed interception: the pass sails on by
  // A dropped catch: the ball pops off the stick.
  const scatter = degToRad(cc.dropScatterDeg);
  ball.vel = rotate(
    { x: ball.vel.x * cc.dropSpeedKeep, y: ball.vel.y * cc.dropSpeedKeep },
    nextRange(state.rng, -scatter, scatter),
  );
  ball.flight = null;
  ball.lastTouch = best.id;
  state.events.push({ type: 'dropPass', playerId: best.id });
  return true;
}

function resolveShot(state: MatchState, flight: Flight, prev: Vec2, config: SimConfig): boolean {
  const ball = state.ball;
  for (const p of state.players) {
    if (p.team === flight.team || p.stickCooldown > 0) continue;
    if (p.role === 'goalie') {
      const d = distToSegment(p.pos, prev, ball.pos);
      if (d > config.goalie.saveRadius) continue;
      p.stickCooldown = secondsToTicks(config.scoop.retrySeconds, config);
      // How far off-center the shot is: the closest approach of its line to the goalie,
      // not the distance at the moment it first came into reach.
      const speed = Math.hypot(ball.vel.x, ball.vel.y);
      const offset =
        speed > 1e-6
          ? Math.abs((p.pos.x - ball.pos.x) * ball.vel.y - (p.pos.y - ball.pos.y) * ball.vel.x) / speed
          : d;
      if (!chance(state.rng, saveChance(p, offset, speed, flight.from, config))) continue;
      if (chance(state.rng, config.goalie.catchFraction)) {
        takePossession(state, p);
        state.events.push({ type: 'save', playerId: p.id, team: p.team, caught: true });
      } else {
        rebound(state, p, config);
        state.events.push({ type: 'save', playerId: p.id, team: p.team, caught: false });
      }
      return true;
    }
    // A runner's body can block a shot.
    const d = distToSegment(p.pos, prev, ball.pos);
    if (d > config.player.radius + config.ball.radius) continue;
    p.stickCooldown = secondsToTicks(config.scoop.retrySeconds, config);
    if (!chance(state.rng, config.shot.blockChance)) continue;
    const nx = ball.pos.x - p.pos.x;
    const ny = ball.pos.y - p.pos.y;
    const n = Math.hypot(nx, ny) || 1;
    const vn = (ball.vel.x * nx + ball.vel.y * ny) / n;
    const keep = config.shot.blockSpeedKeep;
    ball.vel = {
      x: (ball.vel.x - (2 * vn * nx) / n) * keep,
      y: (ball.vel.y - (2 * vn * ny) / n) * keep,
    };
    ball.flight = null;
    ball.lastTouch = p.id;
    state.events.push({ type: 'block', playerId: p.id, team: p.team });
    return true;
  }
  return false;
}

/**
 * Chance a goalie stops a shot: high for slow shots right at them from distance; lower
 * for hard shots, shots at the edge of their reach, and shots from close in.
 */
export function saveChance(
  goalie: Player,
  offset: number,
  speed: number,
  from: Vec2,
  config: SimConfig,
): number {
  const gc = config.goalie;
  const sc = config.shot;
  const speedT = Math.min(1, Math.max(0, (speed - sc.minSpeed) / (sc.maxSpeed - sc.minSpeed)));
  const edgeT = Math.min(1, offset / gc.saveRadius);
  const releaseDist = Math.hypot(from.x - goalie.pos.x, from.y - goalie.pos.y);
  const reactT = Math.min(1, Math.max(0, 1 - releaseDist / gc.reactionDistance));
  const p =
    gc.saveBase - gc.saveSpeedPenalty * speedT - gc.saveEdgePenalty * edgeT - gc.saveReactionPenalty * reactT;
  return Math.min(0.97, Math.max(0.05, p));
}

function rebound(state: MatchState, goalie: Player, config: SimConfig): void {
  const ball = state.ball;
  const speed = Math.hypot(ball.vel.x, ball.vel.y) * config.goalie.reboundSpeedKeep;
  // Straight out from the goalie's own goal, scattered.
  const out = { x: goalie.team === 0 ? 1 : -1, y: 0 };
  const scatter = degToRad(config.goalie.reboundScatterDeg);
  const dir = rotate(out, nextRange(state.rng, -scatter, scatter));
  ball.vel = { x: dir.x * speed, y: dir.y * speed };
  ball.flight = null;
  ball.lastTouch = goalie.id;
}

function takePossession(state: MatchState, p: Player): void {
  const ball = state.ball;
  ball.carrier = p.id;
  ball.flight = null;
  ball.lastTouch = p.id;
  p.primaryTicks = 0;
}

/**
 * The candidate with the smallest distance (at most `maxDist`). Exact ties are broken with
 * the seeded RNG; picking by id would hand mirrored races to the same team every time.
 */
export function nearestWithFairTies(
  state: MatchState,
  candidates: Player[],
  distance: (p: Player) => number,
  maxDist: number,
): Player | null {
  let best: Player[] = [];
  let bestDist = maxDist;
  for (const p of candidates) {
    const d = distance(p);
    if (d > bestDist + 1e-9 || !Number.isFinite(d)) continue;
    if (d < bestDist - 1e-9) {
      best = [p];
      bestDist = d;
    } else {
      best.push(p);
    }
  }
  if (best.length <= 1) return best[0] ?? null;
  return best[Math.floor(nextFloat(state.rng) * best.length)]!;
}

/** Loose ground balls only: the nearest eligible player gets one scoop attempt per tick. */
export function tryScoop(state: MatchState, config: SimConfig): void {
  const ball = state.ball;
  if (ball.carrier !== null || ball.flight !== null) return;
  const sc = config.scoop;

  const best = nearestWithFairTies(
    state,
    state.players.filter((p) => p.stickCooldown === 0),
    (p) => Math.hypot(ball.pos.x - p.pos.x, ball.pos.y - p.pos.y),
    sc.radius,
  );
  if (!best) return;

  const rel = Math.hypot(ball.vel.x - best.vel.x, ball.vel.y - best.vel.y);
  const t = Math.min(1, rel / sc.fastRelSpeed);
  if (chance(state.rng, scoopChance(t, config))) {
    takePossession(state, best);
    state.events.push({ type: 'pickup', playerId: best.id, team: best.team });
    return;
  }

  // Fumble: the ball squirts away from the stick.
  best.stickCooldown = secondsToTicks(sc.retrySeconds, config);
  let nx = ball.pos.x - best.pos.x;
  let ny = ball.pos.y - best.pos.y;
  const n = Math.hypot(nx, ny);
  if (n < 1e-6) {
    nx = Math.cos(best.facing);
    ny = Math.sin(best.facing);
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
