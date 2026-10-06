import type { Vec2 } from '../sim';

/** Unit-ish direction toward `target`, easing off inside `slowRadius` (0 = never ease). */
export function seek(from: Vec2, target: Vec2, slowRadius: number): Vec2 {
  const dx = target.x - from.x;
  const dy = target.y - from.y;
  const d = Math.hypot(dx, dy);
  if (d < 1e-6) return { x: 0, y: 0 };
  const s = slowRadius > 0 ? Math.min(1, d / slowRadius) : 1;
  return { x: (dx / d) * s, y: (dy / d) * s };
}
