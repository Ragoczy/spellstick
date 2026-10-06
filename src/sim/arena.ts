import type { SimConfig } from './config';
import type { Vec2 } from './vec';

/** 0 = home (defends the -x goal, attacks +x), 1 = away. */
export type TeamIndex = 0 | 1;

export interface GoalGeometry {
  /** Which team defends this goal. */
  defendedBy: TeamIndex;
  /** Center of the goal line (the mouth). */
  mouth: Vec2;
  /** Unit x-direction from the mouth into the net (+1 or -1). */
  backDir: 1 | -1;
  width: number;
  depth: number;
  creaseRadius: number;
}

export interface ArenaGeometry {
  halfLength: number;
  halfWidth: number;
  cornerRadius: number;
  centerCircleRadius: number;
  goals: [GoalGeometry, GoalGeometry];
}

/** Derives the static rink geometry from config. Pure; safe for render and sim. */
export function arenaGeometry(config: SimConfig): ArenaGeometry {
  const r = config.rink;
  const halfLength = r.length / 2;
  const goalX = halfLength - r.goalLineInset;
  const goal = (defendedBy: TeamIndex): GoalGeometry => {
    const side = defendedBy === 0 ? -1 : 1;
    return {
      defendedBy,
      mouth: { x: side * goalX, y: 0 },
      backDir: side,
      width: r.goalWidth,
      depth: r.goalDepth,
      creaseRadius: r.creaseRadius,
    };
  };
  return {
    halfLength,
    halfWidth: r.width / 2,
    cornerRadius: r.cornerRadius,
    centerCircleRadius: r.centerCircleRadius,
    goals: [goal(0), goal(1)],
  };
}

const arenaCache = new WeakMap<SimConfig, ArenaGeometry>();

/** Cached `arenaGeometry` for a config object. */
export function arenaFor(config: SimConfig): ArenaGeometry {
  let arena = arenaCache.get(config);
  if (!arena) {
    arena = arenaGeometry(config);
    arenaCache.set(config, arena);
  }
  return arena;
}
