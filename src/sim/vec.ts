/** Minimal 2D vector helpers. Plain objects keep state JSON-serializable. */
export interface Vec2 {
  x: number;
  y: number;
}

export const vec = (x = 0, y = 0): Vec2 => ({ x, y });
export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, y: a.y * s });
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;
export const length = (a: Vec2): number => Math.hypot(a.x, a.y);
export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);

export function normalize(a: Vec2): Vec2 {
  const len = Math.hypot(a.x, a.y);
  return len > 1e-9 ? { x: a.x / len, y: a.y / len } : { x: 0, y: 0 };
}

export function clampLength(a: Vec2, max: number): Vec2 {
  const len = Math.hypot(a.x, a.y);
  return len > max ? { x: (a.x / len) * max, y: (a.y / len) * max } : a;
}

/** Rotates `a` by `radians` (standard rotation matrix; with +y down that is clockwise on screen). */
export function rotate(a: Vec2, radians: number): Vec2 {
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  return { x: a.x * c - a.y * s, y: a.x * s + a.y * c };
}

export const degToRad = (deg: number): number => (deg * Math.PI) / 180;
