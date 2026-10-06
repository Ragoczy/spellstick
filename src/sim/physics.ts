import type { ArenaGeometry, GoalGeometry } from './arena';
import type { Vec2 } from './vec';

/** A collision: push the body `depth` meters along `normal` (unit, pointing out of the obstacle). */
export interface Contact {
  normal: Vec2;
  depth: number;
}

/**
 * Contact between a circle and the inside of the rink boards (a rounded rectangle),
 * or null if the circle is fully inside.
 */
export function boardContact(pos: Vec2, radius: number, arena: ArenaGeometry): Contact | null {
  const r = arena.cornerRadius;
  const hx = arena.halfLength - r;
  const hy = arena.halfWidth - r;
  const ax = Math.abs(pos.x);
  const ay = Math.abs(pos.y);

  if (ax > hx && ay > hy) {
    // Corner region: the wall is an arc around the corner center.
    const cx = Math.sign(pos.x) * hx;
    const cy = Math.sign(pos.y) * hy;
    const dx = pos.x - cx;
    const dy = pos.y - cy;
    const d = Math.hypot(dx, dy);
    const limit = r - radius;
    if (d <= limit) return null;
    return { normal: { x: -dx / d, y: -dy / d }, depth: d - limit };
  }

  // Straight walls. Pick the deeper one if (somehow) both are hit.
  const penX = ax + radius - arena.halfLength;
  const penY = ay + radius - arena.halfWidth;
  if (penX <= 0 && penY <= 0) return null;
  if (penX >= penY) return { normal: { x: -Math.sign(pos.x), y: 0 }, depth: penX };
  return { normal: { x: 0, y: -Math.sign(pos.y) }, depth: penY };
}

/** The goal frame's footprint as an axis-aligned box. */
export function goalBox(goal: GoalGeometry): { minX: number; maxX: number; minY: number; maxY: number } {
  const backX = goal.mouth.x + goal.backDir * goal.depth;
  return {
    minX: Math.min(goal.mouth.x, backX),
    maxX: Math.max(goal.mouth.x, backX),
    minY: goal.mouth.y - goal.width / 2,
    maxY: goal.mouth.y + goal.width / 2,
  };
}

export interface Segment {
  a: Vec2;
  b: Vec2;
}

/**
 * The goal frame as the ball sees it: two side bars (ending at the posts) and a back bar.
 * The mouth is open, so a ball can go in.
 */
export function goalFrameSegments(goal: GoalGeometry): Segment[] {
  const h = goal.width / 2;
  const x0 = goal.mouth.x;
  const x1 = goal.mouth.x + goal.backDir * goal.depth;
  const y = goal.mouth.y;
  return [
    { a: { x: x0, y: y - h }, b: { x: x1, y: y - h } },
    { a: { x: x0, y: y + h }, b: { x: x1, y: y + h } },
    { a: { x: x1, y: y - h }, b: { x: x1, y: y + h } },
  ];
}

/** Closest point to `p` on segment ab. */
export function closestOnSegment(p: Vec2, a: Vec2, b: Vec2): Vec2 {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const len2 = abx * abx + aby * aby;
  const t = len2 > 0 ? Math.min(1, Math.max(0, ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2)) : 0;
  return { x: a.x + abx * t, y: a.y + aby * t };
}

/** Distance from `p` to segment ab. */
export function distToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const q = closestOnSegment(p, a, b);
  return Math.hypot(p.x - q.x, p.y - q.y);
}

/** Contact between a circle and a thin segment (a capsule of zero radius), or null. */
export function segmentContact(pos: Vec2, radius: number, seg: Segment): Contact | null {
  const q = closestOnSegment(pos, seg.a, seg.b);
  const dx = pos.x - q.x;
  const dy = pos.y - q.y;
  const d = Math.hypot(dx, dy);
  if (d >= radius) return null;
  if (d < 1e-9) return { normal: { x: 0, y: 1 }, depth: radius };
  return { normal: { x: dx / d, y: dy / d }, depth: radius - d };
}

/** Contact between a circle and a solid axis-aligned box, or null. */
export function boxContact(
  pos: Vec2,
  radius: number,
  box: { minX: number; maxX: number; minY: number; maxY: number },
): Contact | null {
  const qx = Math.min(Math.max(pos.x, box.minX), box.maxX);
  const qy = Math.min(Math.max(pos.y, box.minY), box.maxY);
  const dx = pos.x - qx;
  const dy = pos.y - qy;
  const d2 = dx * dx + dy * dy;
  if (d2 > 0) {
    if (d2 >= radius * radius) return null;
    const d = Math.sqrt(d2);
    return { normal: { x: dx / d, y: dy / d }, depth: radius - d };
  }
  // Center is inside the box: push out through the nearest face.
  const exits = [
    { normal: { x: -1, y: 0 }, depth: pos.x - box.minX + radius },
    { normal: { x: 1, y: 0 }, depth: box.maxX - pos.x + radius },
    { normal: { x: 0, y: -1 }, depth: pos.y - box.minY + radius },
    { normal: { x: 0, y: 1 }, depth: box.maxY - pos.y + radius },
  ];
  return exits.reduce((best, e) => (e.depth < best.depth ? e : best));
}

/**
 * Applies a contact to a moving body: moves it out of the obstacle and reflects the
 * velocity's normal component. Returns the impact speed (0 if it was moving away).
 */
export function resolveContact(
  pos: Vec2,
  vel: Vec2,
  contact: Contact,
  restitution: number,
  tangentKeep = 1,
): number {
  pos.x += contact.normal.x * contact.depth;
  pos.y += contact.normal.y * contact.depth;
  const vn = vel.x * contact.normal.x + vel.y * contact.normal.y;
  if (vn >= 0) return 0;
  const tx = vel.x - vn * contact.normal.x;
  const ty = vel.y - vn * contact.normal.y;
  vel.x = tx * tangentKeep - vn * restitution * contact.normal.x;
  vel.y = ty * tangentKeep - vn * restitution * contact.normal.y;
  return -vn;
}
