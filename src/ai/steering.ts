import { goalBox, type ArenaGeometry, type MatchState, type Player, type Vec2 } from '../sim';

/** Unit-ish direction toward `target`, easing off inside `slowRadius` (0 = never ease). */
export function seek(from: Vec2, target: Vec2, slowRadius: number): Vec2 {
  const dx = target.x - from.x;
  const dy = target.y - from.y;
  const d = Math.hypot(dx, dy);
  if (d < 1e-6) return { x: 0, y: 0 };
  const s = slowRadius > 0 ? Math.min(1, d / slowRadius) : 1;
  return { x: (dx / d) * s, y: (dy / d) * s };
}

/**
 * If moving along `move` would run into a goal frame within `lookahead` meters, slide
 * along it instead (toward whichever side of the goal we're already on).
 */
export function avoidGoals(
  pos: Vec2,
  move: Vec2,
  arena: ArenaGeometry,
  margin: number,
  lookahead: number,
): Vec2 {
  const m = Math.hypot(move.x, move.y);
  if (m < 1e-6) return move;
  const dx = move.x / m;
  const dy = move.y / m;
  for (const goal of arena.goals) {
    // Cheap reject: nowhere near this goal.
    if (Math.abs(pos.x - goal.mouth.x) > lookahead + goal.depth + margin + 1) continue;
    const b = goalBox(goal);
    if (
      !rayHitsBox(pos, dx, dy, lookahead, b.minX - margin, b.maxX + margin, b.minY - margin, b.maxY + margin)
    ) {
      continue;
    }
    const side = pos.y >= goal.mouth.y ? 1 : -1;
    // Of the two perpendiculars, take the one pointing to our side of the goal.
    let tx = -dy;
    let ty = dx;
    if (ty * side < 0) {
      tx = -tx;
      ty = -ty;
    }
    return { x: tx * m, y: ty * m };
  }
  return move;
}

function rayHitsBox(
  p: Vec2,
  dx: number,
  dy: number,
  len: number,
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
): boolean {
  // Slab test, one axis at a time.
  const x = slab(p.x, dx, minX, maxX, 0, len);
  if (!x) return false;
  return slab(p.y, dy, minY, maxY, x[0], x[1]) !== null;
}

function slab(o: number, d: number, lo: number, hi: number, t0: number, t1: number): [number, number] | null {
  if (Math.abs(d) < 1e-9) return o < lo || o > hi ? null : [t0, t1];
  let a = (lo - o) / d;
  let b = (hi - o) / d;
  if (a > b) [a, b] = [b, a];
  const s = Math.max(t0, a);
  const e = Math.min(t1, b);
  return s > e ? null : [s, e];
}

/** Nudges `move` away from teammates closer than `radius`, so the AI doesn't pile up. */
export function spaceOut(state: Readonly<MatchState>, me: Player, move: Vec2, radius: number): Vec2 {
  let rx = 0;
  let ry = 0;
  for (const q of state.players) {
    if (q.id === me.id || q.team !== me.team || q.role === 'goalie') continue;
    const dx = me.pos.x - q.pos.x;
    const dy = me.pos.y - q.pos.y;
    const d = Math.hypot(dx, dy);
    if (d >= radius || d < 1e-6) continue;
    const w = (radius - d) / radius;
    rx += (dx / d) * w;
    ry += (dy / d) * w;
  }
  return { x: move.x + rx, y: move.y + ry };
}

/**
 * Keeps a player out of a circle (the opponent's crease): if already inside, head straight
 * out; if `move` would enter it within `lookahead`, slide around it instead.
 */
export function avoidCircle(pos: Vec2, move: Vec2, center: Vec2, radius: number, lookahead: number): Vec2 {
  const m = Math.hypot(move.x, move.y);
  const ox = pos.x - center.x;
  const oy = pos.y - center.y;
  const d = Math.hypot(ox, oy);
  if (d < radius) {
    const s = Math.max(m, 0.6);
    return d > 1e-6 ? { x: (ox / d) * s, y: (oy / d) * s } : { x: s, y: 0 };
  }
  if (m < 1e-6) return move;
  const dx = move.x / m;
  const dy = move.y / m;
  // Closest approach of the ray to the center, within the lookahead.
  const t = Math.max(0, Math.min(lookahead, -(ox * dx + oy * dy)));
  const cx = ox + dx * t;
  const cy = oy + dy * t;
  if (Math.hypot(cx, cy) >= radius) return move;
  // Slide along the tangent on our side of the circle.
  let tx = -oy / d;
  let ty = ox / d;
  if (tx * dx + ty * dy < 0) {
    tx = -tx;
    ty = -ty;
  }
  return { x: tx * m, y: ty * m };
}
