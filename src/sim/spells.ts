import type { ArenaGeometry, GoalGeometry } from './arena';
import { goalieProtected, illusionTakesHit, stagger } from './checks';
import { secondsToTicks, type SimConfig } from './config';
import { boardContact, boxContact, distToSegment, goalBox, segmentContact, type Segment } from './physics';
import { facingDir, stickHead } from './players';
import { chance, nextRange } from './rng';
import {
  ARMED_SPELLS,
  type ArmedSpell,
  type InputCommand,
  type MatchState,
  type Player,
  type SpellId,
} from './types';
import { degToRad, rotate, type Vec2 } from './vec';

export const NO_COOLDOWNS: Readonly<Record<SpellId, number>> = Object.freeze({
  hexShove: 0,
  quickstep: 0,
  bentShot: 0,
  pinpoint: 0,
  blink: 0,
  snare: 0,
  iceWall: 0,
  stoneSkin: 0,
  tailwind: 0,
  glamourSelf: 0,
  ward: 0,
});

/** Mana cost of a spell (the goalie's Ward is free; it runs on cooldown alone). */
export function spellCost(spell: SpellId, config: SimConfig): number {
  return spell === 'ward' ? 0 : config.spells[spell].cost;
}

const isArmed = (spell: SpellId): spell is ArmedSpell => (ARMED_SPELLS as readonly SpellId[]).includes(spell);

/**
 * True if `p` could cast `spell` right now: the right role, one of their three spells, off
 * cooldown, enough mana, not dazed, and nothing else already armed. (Blink and Ice Wall also
 * need somewhere to go: see `castSpell`.)
 */
export function canCast(p: Player, spell: SpellId, config: SimConfig): boolean {
  if (p.staggerTicks > 0 || p.spellCooldowns[spell] > 0) return false;
  if (spell === 'ward') return p.role === 'goalie';
  if (p.role !== 'runner' || !(p.spells as SpellId[]).includes(spell)) return false;
  if (isArmed(spell) && p.armed !== null) return false;
  if (spell === 'blink' && p.rootTicks > 0) return false;
  return p.mana >= spellCost(spell, config);
}

/** Per-tick upkeep: mana regen (faster without the ball), cooldowns, and timed effects. */
export function tickSpellState(state: MatchState, p: Player, config: SimConfig): void {
  if (p.role === 'runner') {
    const regen = state.ball.carrier === p.id ? config.mana.regenCarrying : config.mana.regenFree;
    p.mana = Math.min(config.mana.max, p.mana + regen / config.tickHz);
  }
  for (const s of Object.keys(p.spellCooldowns) as SpellId[]) {
    if (p.spellCooldowns[s] > 0) p.spellCooldowns[s]--;
  }
  if (p.quickstepTicks > 0) p.quickstepTicks--;
  if (p.wardTicks > 0) p.wardTicks--;
  if (p.rootTicks > 0) p.rootTicks--;
  if (p.snareImmuneTicks > 0) p.snareImmuneTicks--;
  if (p.stoneTicks > 0) p.stoneTicks--;
  if (p.imageTicks > 0 && --p.imageTicks === 0) p.images = 0;
}

/**
 * Casts `spell` for `p` if allowed: pays mana, starts the cooldown, applies the effect.
 * A Blink with nowhere to go, or an Ice Wall with nowhere to stand, isn't cast (and costs nothing).
 */
export function castSpell(
  state: MatchState,
  p: Player,
  spell: SpellId,
  input: InputCommand,
  arena: ArenaGeometry,
  config: SimConfig,
): boolean {
  if (!canCast(p, spell, config)) return false;
  const blinkTo = spell === 'blink' ? blinkTarget(state, p, blinkDirection(p, input), arena, config) : null;
  if (spell === 'blink' && !blinkTo) return false;
  const wall = spell === 'iceWall' ? wallPlacement(p, arena, config) : null;
  if (spell === 'iceWall' && !wall) return false;

  p.mana -= spellCost(spell, config);
  p.spellCooldowns[spell] = secondsToTicks(config.spells[spell].cooldownSeconds, config);
  state.events.push({ type: 'cast', playerId: p.id, team: p.team, spell });
  const sc = config.spells;
  switch (spell) {
    case 'hexShove':
      hexShove(state, p, arena, config);
      break;
    case 'quickstep':
      p.quickstepTicks = secondsToTicks(sc.quickstep.durationSeconds, config);
      break;
    case 'bentShot':
    case 'pinpoint':
    case 'tailwind':
      p.armed = spell;
      break;
    case 'blink': {
      const from = { x: p.pos.x, y: p.pos.y };
      p.pos = { x: blinkTo!.x, y: blinkTo!.y };
      state.events.push({ type: 'blink', playerId: p.id, from, to: { x: p.pos.x, y: p.pos.y } });
      break;
    }
    case 'snare':
      snare(state, p, config);
      break;
    case 'iceWall':
      state.walls.push({
        a: wall!.a,
        b: wall!.b,
        ticks: secondsToTicks(sc.iceWall.durationSeconds, config),
        playerId: p.id,
      });
      state.events.push({ type: 'iceWall', playerId: p.id, a: wall!.a, b: wall!.b });
      break;
    case 'stoneSkin':
      p.stoneTicks = secondsToTicks(sc.stoneSkin.durationSeconds, config);
      break;
    case 'glamourSelf':
      p.images = sc.glamourSelf.images;
      p.imageTicks = secondsToTicks(sc.glamourSelf.durationSeconds, config);
      break;
    case 'ward':
      p.wardTicks = secondsToTicks(sc.ward.durationSeconds, config);
      break;
  }
  return true;
}

/** True if `target` is inside a cone of `range` and `halfAngleDeg` along `caster`'s stick. */
function inCone(caster: Player, target: Player, range: number, halfAngleDeg: number): boolean {
  const dx = target.pos.x - caster.pos.x;
  const dy = target.pos.y - caster.pos.y;
  const d = Math.hypot(dx, dy);
  if (d > range || d < 1e-6) return false;
  const f = facingDir(caster);
  return (dx * f.x + dy * f.y) / d >= Math.cos(degToRad(halfAngleDeg));
}

/** True if `target` is inside Hex Shove's (Thunderclap's) cone from `caster`. */
export function inShoveCone(caster: Player, target: Player, config: SimConfig): boolean {
  const hs = config.spells.hexShove;
  return inCone(caster, target, hs.range, hs.coneHalfAngleDeg);
}

/**
 * Hex Shove (Thunderclap): knocks back and staggers every opponent in the cone; a carrier it
 * hits always loses the ball. A goalie in their own crease is protected, as from checks
 * (SPEC §4.6). Stone Skin shrugs it off, and an illusion may take it instead.
 */
function hexShove(state: MatchState, caster: Player, arena: ArenaGeometry, config: SimConfig): void {
  const hs = config.spells.hexShove;
  const hits: number[] = [];
  let loosened = false;
  for (const t of state.players) {
    if (t.team === caster.team || !inShoveCone(caster, t, config) || goalieProtected(t, arena)) continue;
    if (t.stoneTicks > 0 || illusionTakesHit(state, t, caster.id, config)) continue;
    const dx = t.pos.x - caster.pos.x;
    const dy = t.pos.y - caster.pos.y;
    const d = Math.hypot(dx, dy) || 1;
    t.vel.x += (dx / d) * hs.knockbackSpeed;
    t.vel.y += (dy / d) * hs.knockbackSpeed;
    stagger(t, secondsToTicks(hs.staggerSeconds, config));
    hits.push(t.id);
    const ball = state.ball;
    if (ball.carrier === t.id) {
      loosened = true;
      ball.carrier = null;
      ball.flight = null;
      ball.pos = stickHead(t, config);
      ball.vel = { x: t.vel.x * 0.5 + (dx / d) * hs.looseSpeed, y: t.vel.y * 0.5 + (dy / d) * hs.looseSpeed };
      ball.lastTouch = t.id;
    }
  }
  state.events.push({ type: 'hexShove', playerId: caster.id, hits, loosened });
}

/** Which way a Blink goes: where you're moving, or where your stick points if you're standing. */
export function blinkDirection(p: Player, input: InputCommand): Vec2 {
  const m = Math.hypot(input.move.x, input.move.y);
  return m > 0.1 ? { x: input.move.x / m, y: input.move.y / m } : facingDir(p);
}

/**
 * Where a Blink along `dir` lands: as far as it can go up to its distance, stopping short of the
 * boards, a goal, the opponent's crease, and Ice Walls. Null if it can't go far enough to count.
 */
export function blinkTarget(
  state: MatchState,
  p: Player,
  dir: Vec2,
  arena: ArenaGeometry,
  config: SimConfig,
): Vec2 | null {
  const bc = config.spells.blink;
  const r = config.player.radius;
  const wallReach = r + config.spells.iceWall.halfThickness;
  const theirGoal = arena.goals[p.team === 0 ? 1 : 0];
  let best: Vec2 | null = null;
  for (let d = bc.step; d <= bc.distance + 1e-9; d += bc.step) {
    const q = { x: p.pos.x + dir.x * d, y: p.pos.y + dir.y * d };
    const blocked =
      boardContact(q, r, arena) !== null ||
      arena.goals.some((g) => boxContact(q, r, goalBox(g)) !== null) ||
      Math.hypot(q.x - theirGoal.mouth.x, q.y - theirGoal.mouth.y) < theirGoal.creaseRadius + r ||
      state.walls.some((w) => segmentContact(q, wallReach, w) !== null);
    if (blocked) break;
    best = q;
  }
  if (!best || Math.hypot(best.x - p.pos.x, best.y - p.pos.y) < bc.minDistance) return null;
  return best;
}

/**
 * Where `p`'s Ice Wall would stand: square to the stick, `distance` ahead. Null if any of it
 * would be outside the rink or touch a crease (so it can't wall off a goal mouth).
 */
export function wallPlacement(p: Player, arena: ArenaGeometry, config: SimConfig): Segment | null {
  const wc = config.spells.iceWall;
  const f = facingDir(p);
  const c = { x: p.pos.x + f.x * wc.distance, y: p.pos.y + f.y * wc.distance };
  const h = wc.length / 2;
  const a = { x: c.x - f.y * h, y: c.y + f.x * h };
  const b = { x: c.x + f.y * h, y: c.y - f.x * h };
  if (boardContact(a, wc.halfThickness, arena) || boardContact(b, wc.halfThickness, arena)) return null;
  for (const g of arena.goals) {
    if (distToSegment(g.mouth, a, b) < g.creaseRadius + wc.halfThickness) return null;
  }
  return { a, b };
}

/**
 * The opponent a Snare from `caster` would catch: the nearest runner in its cone who hasn't
 * just been snared, if any.
 */
export function snareTarget(state: MatchState, caster: Player, config: SimConfig): Player | null {
  const sn = config.spells.snare;
  let best: Player | null = null;
  let bestD = Infinity;
  for (const t of state.players) {
    if (t.team === caster.team || t.role !== 'runner' || t.snareImmuneTicks > 0) continue;
    if (!inCone(caster, t, sn.range, sn.coneHalfAngleDeg)) continue;
    const d = Math.hypot(t.pos.x - caster.pos.x, t.pos.y - caster.pos.y);
    if (d < bestD) {
      best = t;
      bestD = d;
    }
  }
  return best;
}

/**
 * Snare: pins the nearest opponent in the cone in place and binds their stick (no catching or
 * scooping while it lasts; no shooting either, see handleActions). A carrier may have the ball
 * yanked loose toward the caster. An illusion may take it instead.
 */
function snare(state: MatchState, caster: Player, config: SimConfig): void {
  const sn = config.spells.snare;
  const t = snareTarget(state, caster, config);
  if (!t || illusionTakesHit(state, t, caster.id, config)) {
    state.events.push({ type: 'snare', playerId: caster.id, targetId: null, loosened: false });
    return;
  }
  const ticks = secondsToTicks(sn.rootSeconds, config);
  t.rootTicks = ticks;
  t.snareImmuneTicks = ticks + secondsToTicks(sn.immuneSeconds, config);
  t.stickCooldown = Math.max(t.stickCooldown, ticks);
  t.primaryTicks = 0;
  t.vel = { x: 0, y: 0 };
  t.dashTicks = 0;
  const ball = state.ball;
  const loosened = ball.carrier === t.id && chance(state.rng, sn.yankChance);
  if (loosened) {
    const dx = caster.pos.x - t.pos.x;
    const dy = caster.pos.y - t.pos.y;
    const d = Math.hypot(dx, dy) || 1;
    ball.carrier = null;
    ball.flight = null;
    ball.pos = stickHead(t, config);
    ball.vel = { x: (dx / d) * sn.yankSpeed, y: (dy / d) * sn.yankSpeed };
    ball.lastTouch = t.id;
  }
  state.events.push({ type: 'snare', playerId: caster.id, targetId: t.id, loosened });
}

/**
 * Bent Shot launch: aims `bendAngleDeg` wide of the target on the outside (past the post on
 * the side being aimed at), so it looks like it will miss, then curves back in onto the aim
 * point. Returns the launch direction and the spin (rad/s) that bends it back.
 */
export function bentLaunch(
  from: Vec2,
  aim: Vec2,
  speed: number,
  goal: GoalGeometry,
  config: SimConfig,
): { dir: Vec2; spin: number } {
  const bs = config.spells.bentShot;
  const dx = aim.x - from.x;
  const dy = aim.y - from.y;
  const d = Math.hypot(dx, dy) || 1;
  const base = { x: dx / d, y: dy / d };
  const theta = degToRad(bs.bendAngleDeg);
  // The side of the goal we're aiming at; the shot starts out wider on that same side.
  const side = aim.y >= goal.mouth.y ? 1 : -1;
  const plus = rotate(base, theta);
  const sign = (plus.y - base.y) * side > 0 ? 1 : -1;
  const dir = rotate(base, sign * theta);
  const dist = Math.max(bs.minBendDistance, d);
  return { dir, spin: (-sign * 2 * theta * speed) / dist };
}

/**
 * Ward: if the defending goalie has it up, a ball crossing the goal line is blocked and
 * bounces back out, and the Ward is used up. Returns true if it blocked.
 */
export function wardBlocks(state: MatchState, goal: GoalGeometry, config: SimConfig): boolean {
  const keeper = state.players.find(
    (p) => p.role === 'goalie' && p.team === goal.defendedBy && p.wardTicks > 0,
  );
  if (!keeper) return false;
  const ball = state.ball;
  const w = config.spells.ward;
  const speed = Math.hypot(ball.vel.x, ball.vel.y) * w.reboundSpeedKeep;
  const out = { x: -goal.backDir, y: 0 };
  const scatter = degToRad(w.reboundScatterDeg);
  const dir = rotate(out, nextRange(state.rng, -scatter, scatter));
  ball.pos = { x: goal.mouth.x - goal.backDir * (config.ball.radius + 0.05), y: ball.pos.y };
  ball.vel = { x: dir.x * speed, y: dir.y * speed };
  ball.flight = null;
  ball.lastTouch = keeper.id;
  keeper.wardTicks = 0;
  state.events.push({ type: 'wardBlock', goalieId: keeper.id, team: keeper.team });
  return true;
}
