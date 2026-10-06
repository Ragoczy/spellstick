import type { ArenaGeometry, GoalGeometry } from './arena';
import { goalieProtected, stagger } from './checks';
import { secondsToTicks, type SimConfig } from './config';
import { facingDir, stickHead } from './players';
import { nextRange } from './rng';
import { RUNNER_SPELLS, type MatchState, type Player, type SpellId } from './types';
import { degToRad, rotate, type Vec2 } from './vec';

export const NO_COOLDOWNS: Readonly<Record<SpellId, number>> = Object.freeze({
  hexShove: 0,
  quickstep: 0,
  bentShot: 0,
  ward: 0,
});

/** Mana cost of a spell (the goalie's Ward is free; it runs on cooldown alone). */
export function spellCost(spell: SpellId, config: SimConfig): number {
  return spell === 'ward' ? 0 : config.spells[spell].cost;
}

/** True if `p` could cast `spell` right now (role, cooldown, mana, not dazed, not already armed). */
export function canCast(p: Player, spell: SpellId, config: SimConfig): boolean {
  if (p.staggerTicks > 0 || p.spellCooldowns[spell] > 0) return false;
  if (spell === 'ward') return p.role === 'goalie';
  if (p.role !== 'runner' || !(RUNNER_SPELLS as readonly SpellId[]).includes(spell)) return false;
  if (spell === 'bentShot' && p.bentArmed) return false;
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
}

/** Casts `spell` for `p` if allowed: pays mana, starts the cooldown, applies the effect. */
export function castSpell(
  state: MatchState,
  p: Player,
  spell: SpellId,
  arena: ArenaGeometry,
  config: SimConfig,
): boolean {
  if (!canCast(p, spell, config)) return false;
  p.mana -= spellCost(spell, config);
  p.spellCooldowns[spell] = secondsToTicks(config.spells[spell].cooldownSeconds, config);
  state.events.push({ type: 'cast', playerId: p.id, team: p.team, spell });
  switch (spell) {
    case 'hexShove':
      hexShove(state, p, arena, config);
      break;
    case 'quickstep':
      p.quickstepTicks = secondsToTicks(config.spells.quickstep.durationSeconds, config);
      break;
    case 'bentShot':
      p.bentArmed = true;
      break;
    case 'ward':
      p.wardTicks = secondsToTicks(config.spells.ward.durationSeconds, config);
      break;
  }
  return true;
}

/** True if `target` is inside Hex Shove's cone from `caster`. */
export function inShoveCone(caster: Player, target: Player, config: SimConfig): boolean {
  const hs = config.spells.hexShove;
  const dx = target.pos.x - caster.pos.x;
  const dy = target.pos.y - caster.pos.y;
  const d = Math.hypot(dx, dy);
  if (d > hs.range || d < 1e-6) return false;
  const f = facingDir(caster);
  return (dx * f.x + dy * f.y) / d >= Math.cos(degToRad(hs.coneHalfAngleDeg));
}

/**
 * Hex Shove: knocks back and staggers every opponent in the cone; a carrier it hits always
 * loses the ball. A goalie in their own crease is protected, as from checks (SPEC §4.6).
 */
function hexShove(state: MatchState, caster: Player, arena: ArenaGeometry, config: SimConfig): void {
  const hs = config.spells.hexShove;
  const hits: number[] = [];
  let loosened = false;
  for (const t of state.players) {
    if (t.team === caster.team || !inShoveCone(caster, t, config) || goalieProtected(t, arena)) continue;
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
