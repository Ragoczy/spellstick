import { arenaFor } from './arena';
import { secondsToTicks, type SimConfig } from './config';
import { bentLaunch } from './spells';
import { facingDir, stickHead } from './players';
import { nextRange } from './rng';
import type { InputCommand, MatchState, Player } from './types';
import { degToRad, rotate, type Vec2 } from './vec';

export { secondsToTicks } from './config';

/** Presses up to this many ticks long are passes. */
export const tapTicks = (config: SimConfig): number => secondsToTicks(config.pass.tapSeconds, config);

/** 0..1 shot charge for a press held `heldTicks` ticks; 0 while still in the tap window. */
export function chargeFraction(heldTicks: number, config: SimConfig): number {
  const tap = tapTicks(config);
  const full = secondsToTicks(config.shot.fullChargeSeconds, config);
  if (heldTicks <= tap) return 0;
  return Math.min(1, (heldTicks - tap) / Math.max(1, full - tap));
}

/** True while a carrier is holding the button past the tap window (charging a shot). */
export const isCharging = (p: Player, config: SimConfig): boolean => p.primaryTicks > tapTicks(config);

/**
 * Turns the pass/shoot button into actions for one player. Counting starts on a fresh
 * press made while carrying, so holding the button through a catch doesn't fire.
 */
export function handleActions(state: MatchState, p: Player, input: InputCommand, config: SimConfig): void {
  const carrying = state.ball.carrier === p.id;
  const down = input.primary === true;
  const pressed = down && !p.primaryDown;
  p.primaryDown = down;

  if (!carrying) {
    p.primaryTicks = 0;
    return;
  }
  if (input.debugDrop) {
    p.primaryTicks = 0;
    const d = facingDir(p);
    const push = config.debug.dropPush;
    releaseBall(state, p, { x: p.vel.x + d.x * push, y: p.vel.y + d.y * push }, config);
    state.events.push({ type: 'release', playerId: p.id, kind: 'drop' });
    return;
  }
  if (pressed) {
    p.primaryTicks = 1;
  } else if (down && p.primaryTicks > 0) {
    p.primaryTicks++;
  } else if (!down && p.primaryTicks > 0) {
    const held = p.primaryTicks;
    p.primaryTicks = 0;
    if (held <= tapTicks(config)) pass(state, p, config);
    else shoot(state, p, chargeFraction(held, config), input.aim, config);
  }
}

/** Puts the ball in play from `p`'s stick with velocity `vel`, no flight. */
function releaseBall(state: MatchState, p: Player, vel: Vec2, config: SimConfig): void {
  const ball = state.ball;
  ball.carrier = null;
  ball.flight = null;
  ball.pos = stickHead(p, config);
  ball.vel = { x: vel.x, y: vel.y };
  ball.lastTouch = p.id;
  p.stickCooldown = secondsToTicks(config.scoop.releaseCooldownSeconds, config);
}

/**
 * The teammate who gets assist magnetism for a pass along `dir` from `from`: within the
 * aim cone and range, closest to the aim line (ties go to the nearer player). Null if none.
 */
export function choosePassTarget(
  state: MatchState,
  passer: Player,
  from: Vec2,
  dir: Vec2,
  config: SimConfig,
): Player | null {
  const cone = degToRad(config.pass.coneHalfAngleDeg);
  let best: Player | null = null;
  let bestAngle = Infinity;
  let bestDist = Infinity;
  for (const q of state.players) {
    if (q.id === passer.id || q.team !== passer.team) continue;
    const dx = q.pos.x - from.x;
    const dy = q.pos.y - from.y;
    const d = Math.hypot(dx, dy);
    if (d < 1e-6 || d > config.pass.maxAssistRange) continue;
    const cos = (dx * dir.x + dy * dir.y) / d;
    const angle = Math.acos(Math.max(-1, Math.min(1, cos)));
    if (angle > cone) continue;
    if (angle < bestAngle - 1e-9 || (Math.abs(angle - bestAngle) <= 1e-9 && d < bestDist)) {
      best = q;
      bestAngle = angle;
      bestDist = d;
    }
  }
  return best;
}

/**
 * Where to throw so a ball at `speed` from `from` meets a target at `pos` moving at `vel`.
 * Falls back to the target's current spot if it can't be caught.
 */
export function leadPoint(from: Vec2, pos: Vec2, vel: Vec2, speed: number, maxSeconds: number): Vec2 {
  const dx = pos.x - from.x;
  const dy = pos.y - from.y;
  const a = vel.x * vel.x + vel.y * vel.y - speed * speed;
  const b = 2 * (dx * vel.x + dy * vel.y);
  const c = dx * dx + dy * dy;
  let t: number;
  if (Math.abs(a) < 1e-9) {
    t = b < 0 ? -c / b : 0;
  } else {
    const disc = b * b - 4 * a * c;
    if (disc < 0) return { x: pos.x, y: pos.y };
    const r = Math.sqrt(disc);
    const t1 = (-b - r) / (2 * a);
    const t2 = (-b + r) / (2 * a);
    t = Math.min(...[t1, t2].filter((x) => x > 0), Infinity);
    if (!Number.isFinite(t)) return { x: pos.x, y: pos.y };
  }
  t = Math.min(Math.max(0, t), maxSeconds);
  return { x: pos.x + vel.x * t, y: pos.y + vel.y * t };
}

function pass(state: MatchState, p: Player, config: SimConfig): void {
  const from = stickHead(p, config);
  let dir = facingDir(p);
  const target = choosePassTarget(state, p, from, dir, config);
  if (target) {
    const lead = leadPoint(from, target.pos, target.vel, config.pass.speed, config.pass.airSeconds);
    const lx = lead.x - from.x;
    const ly = lead.y - from.y;
    const len = Math.hypot(lx, ly);
    if (len > 1e-6) dir = { x: lx / len, y: ly / len };
  }
  const speed = config.pass.speed;
  releaseBall(state, p, { x: dir.x * speed, y: dir.y * speed }, config);
  state.ball.flight = {
    kind: 'pass',
    by: p.id,
    team: p.team,
    target: target?.id ?? null,
    ticks: 0,
    maxTicks: secondsToTicks(config.pass.airSeconds, config),
    from,
    spin: 0,
  };
  state.events.push({ type: 'pass', playerId: p.id, team: p.team, target: target?.id ?? null });
}

/** Shot speed for a 0..1 charge. */
export function shotSpeed(charge: number, config: SimConfig): number {
  return config.shot.minSpeed + (config.shot.maxSpeed - config.shot.minSpeed) * charge;
}

function shoot(state: MatchState, p: Player, charge: number, aim: Vec2, config: SimConfig): void {
  const from = stickHead(p, config);
  const runFraction = Math.min(1, Math.hypot(p.vel.x, p.vel.y) / config.player.maxSpeed);
  const spread = degToRad(config.shot.spreadStandingDeg + config.shot.spreadRunningDeg * runFraction);
  const speed = shotSpeed(charge, config);
  let dir = rotate(facingDir(p), nextRange(state.rng, -spread, spread));
  let spin = 0;
  if (p.bentArmed) {
    // Bent Shot: launch wide and curve back onto the aim point (plus the usual aim error).
    p.bentArmed = false;
    const goal = arenaFor(config).goals[p.team === 0 ? 1 : 0];
    const bent = bentLaunch(from, aim, speed, goal, config);
    dir = rotate(bent.dir, nextRange(state.rng, -spread, spread));
    spin = bent.spin;
  }
  releaseBall(state, p, { x: dir.x * speed, y: dir.y * speed }, config);
  state.ball.flight = {
    kind: 'shot',
    by: p.id,
    team: p.team,
    target: null,
    ticks: 0,
    maxTicks: secondsToTicks(config.shot.airSeconds, config),
    from,
    spin,
  };
  state.events.push({ type: 'shot', playerId: p.id, team: p.team, speed });
}
