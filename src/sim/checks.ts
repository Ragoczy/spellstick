import { secondsToTicks } from './actions';
import type { ArenaGeometry } from './arena';
import { nearestWithFairTies } from './ball';
import type { SimConfig } from './config';
import { facingDir, stickHead } from './players';
import { chance, nextRange } from './rng';
import type { InputCommand, MatchState, Player } from './types';
import { degToRad, rotate } from './vec';

/** Starts a check dash if the player asked for one and can throw it. */
export function startCheck(p: Player, input: InputCommand, config: SimConfig): void {
  if (!input.check || p.checkCooldown > 0 || p.staggerTicks > 0 || p.dashTicks > 0 || p.rootTicks > 0) return;
  const mlen = Math.hypot(input.move.x, input.move.y);
  p.dashDir = mlen > 0.1 ? { x: input.move.x / mlen, y: input.move.y / mlen } : facingDir(p);
  p.dashTicks = secondsToTicks(config.check.dashSeconds, config);
  p.dashHit = false;
  p.checkCooldown = secondsToTicks(config.check.cooldownSeconds, config);
}

/**
 * Glamour Self (M10): if `target` has illusions up, a hit meant for them (a check, Thunderclap,
 * or Snare from `by`) may find an illusion instead. One illusion fades and the hit does nothing.
 * Returns true if an illusion took it.
 */
export function illusionTakesHit(state: MatchState, target: Player, by: number, config: SimConfig): boolean {
  if (target.images <= 0 || !chance(state.rng, config.spells.glamourSelf.imageHitChance)) return false;
  if (--target.images === 0) target.imageTicks = 0;
  state.events.push({ type: 'imagePop', playerId: target.id, by });
  return true;
}

/** True if a goalie is inside their own crease, where they can't be hit (SPEC §4.6). */
export function goalieProtected(goalie: Player, arena: ArenaGeometry): boolean {
  if (goalie.role !== 'goalie') return false;
  const goal = arena.goals[goalie.team];
  return Math.hypot(goalie.pos.x - goal.mouth.x, goalie.pos.y - goal.mouth.y) <= goal.creaseRadius;
}

/**
 * Resolves dashing checkers against opponents in reach. Each dash hits at most one
 * player: they're knocked back and staggered, and a carrier may lose the ball.
 */
export function resolveChecks(state: MatchState, arena: ArenaGeometry, config: SimConfig): void {
  const cc = config.check;
  const reach = config.player.radius * 2 + cc.reach;
  // Find every hit first, then apply them, so two players who check each other on the
  // same tick both land (resolving in id order would favor the home team).
  const hits: [Player, Player][] = [];
  for (const p of state.players) {
    if (p.dashTicks <= 0) continue;
    p.dashTicks--; // counts this tick of the dash
    if (p.dashHit) continue;
    const target = nearestWithFairTies(
      state,
      state.players.filter((q) => q.team !== p.team),
      (q) => Math.hypot(q.pos.x - p.pos.x, q.pos.y - p.pos.y),
      reach,
    );
    if (target) hits.push([p, target]);
  }
  for (const [p, target] of hits) {
    p.dashHit = true;
    p.dashTicks = 0;

    if (goalieProtected(target, arena)) {
      // The checker bounces off; the goalie doesn't budge.
      p.vel = { x: -p.dashDir.x * cc.goalieBounceSpeed, y: -p.dashDir.y * cc.goalieBounceSpeed };
      stagger(p, secondsToTicks(cc.goalieBounceStaggerSeconds, config));
      state.events.push({ type: 'checkBounce', playerId: p.id, goalieId: target.id });
      continue;
    }
    // Glamour Self: the dash goes through an illusion. Stone Skin: the target doesn't budge.
    if (illusionTakesHit(state, target, p.id, config)) continue;
    if (target.stoneTicks > 0) {
      p.vel.x *= cc.checkerKeep;
      p.vel.y *= cc.checkerKeep;
      state.events.push({ type: 'stoneBlock', playerId: target.id, by: p.id });
      continue;
    }

    target.vel.x += p.dashDir.x * cc.knockbackSpeed;
    target.vel.y += p.dashDir.y * cc.knockbackSpeed;
    stagger(target, secondsToTicks(cc.staggerSeconds, config));
    p.vel.x *= cc.checkerKeep;
    p.vel.y *= cc.checkerKeep;

    const ball = state.ball;
    const loosened = ball.carrier === target.id && chance(state.rng, cc.looseChance);
    if (loosened) {
      const scatter = degToRad(cc.looseScatterDeg);
      const dir = rotate(p.dashDir, nextRange(state.rng, -scatter, scatter));
      ball.carrier = null;
      ball.flight = null;
      ball.pos = stickHead(target, config);
      ball.vel = {
        x: target.vel.x * 0.5 + dir.x * cc.looseSpeed,
        y: target.vel.y * 0.5 + dir.y * cc.looseSpeed,
      };
      ball.lastTouch = target.id;
    }
    state.events.push({ type: 'check', playerId: p.id, targetId: target.id, team: p.team, loosened });
  }
}

/** Puts a player out of action for at least `ticks`: no control, no stick, charge lost; ends a Snare. */
export function stagger(p: Player, ticks: number): void {
  p.staggerTicks = Math.max(p.staggerTicks, ticks);
  p.rootTicks = 0; // a hit knocks you free of a Snare
  p.stickCooldown = Math.max(p.stickCooldown, ticks);
  p.primaryTicks = 0;
  p.dashTicks = 0;
}
