import type { ArenaGeometry } from './arena';
import type { SimConfig } from './config';
import { boardContact, boxContact, goalBox, resolveContact } from './physics';
import type { InputCommand, Player } from './types';
import type { Vec2 } from './vec';

/** Unit vector along a player's stick. */
export function facingDir(p: Player): Vec2 {
  return { x: Math.cos(p.facing), y: Math.sin(p.facing) };
}

/** Where the stick head (and a carried ball) is. */
export function stickHead(p: Player, config: SimConfig): Vec2 {
  const d = facingDir(p);
  return { x: p.pos.x + d.x * config.player.stickReach, y: p.pos.y + d.y * config.player.stickReach };
}

/** Points the stick at the aim point. */
export function updateFacing(p: Player, input: InputCommand): void {
  const ax = input.aim.x - p.pos.x;
  const ay = input.aim.y - p.pos.y;
  if (ax * ax + ay * ay > 0.0025) p.facing = Math.atan2(ay, ax);
}

/** Steering: velocity approaches (move input × top speed) at a capped rate. */
export function steer(
  p: Player,
  input: InputCommand,
  speedMultiplier: number,
  config: SimConfig,
  dt: number,
): void {
  const goalie = p.role === 'goalie';
  const maxSpeed = goalie ? config.goalie.maxSpeed : config.player.maxSpeed;
  const accel = goalie ? config.goalie.accel : config.player.accel;

  let mx = input.move.x;
  let my = input.move.y;
  const mlen = Math.hypot(mx, my);
  if (mlen > 1) {
    mx /= mlen;
    my /= mlen;
  }
  const topSpeed = maxSpeed * speedMultiplier;
  const dvx = mx * topSpeed - p.vel.x;
  const dvy = my * topSpeed - p.vel.y;
  const dvLen = Math.hypot(dvx, dvy);
  const maxDv = (mlen > 0.01 ? accel : config.player.friction) * dt;
  const k = dvLen > maxDv ? maxDv / dvLen : 1;
  p.vel.x += dvx * k;
  p.vel.y += dvy * k;
}

/** Moves a player one tick and keeps them in bounds. Returns how hard they hit the boards (m/s). */
export function movePlayer(p: Player, arena: ArenaGeometry, config: SimConfig, dt: number): number {
  p.pos.x += p.vel.x * dt;
  p.pos.y += p.vel.y * dt;
  return keepPlayerInBounds(p, arena, config);
}

function keepPlayerInBounds(p: Player, arena: ArenaGeometry, config: SimConfig): number {
  const radius = config.player.radius;
  const board = boardContact(p.pos, radius, arena);
  const impact = board ? resolveContact(p.pos, p.vel, board, config.player.boardRestitution) : 0;
  for (const goal of arena.goals) {
    const c = boxContact(p.pos, radius, goalBox(goal));
    if (c) resolveContact(p.pos, p.vel, c, 0);
  }
  return impact;
}

/** Pushes overlapping players apart and cancels their closing speed. */
export function separatePlayers(players: Player[], arena: ArenaGeometry, config: SimConfig): void {
  const minDist = config.player.radius * 2;
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const a = players[i]!;
      const b = players[j]!;
      let dx = b.pos.x - a.pos.x;
      let dy = b.pos.y - a.pos.y;
      if (dx * dx + dy * dy >= minDist * minDist) continue;
      let d = Math.hypot(dx, dy);
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
