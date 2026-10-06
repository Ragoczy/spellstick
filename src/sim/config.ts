/**
 * Every tuning number for Spellstick lives here.
 *
 * Units: distances in meters, time in seconds, speeds in m/s.
 * World origin is the rink center; +x points toward the away goal (home attacks +x),
 * +y points "down" the screen.
 */
export const DEFAULT_CONFIG = {
  /** Simulation rate. The sim always advances in fixed steps of 1 / tickHz seconds. */
  tickHz: 60,
  /** Max sim steps per rendered frame before the loop drops time (avoids the spiral of death). */
  maxStepsPerFrame: 5,

  rink: {
    /** Inside length of the boards, end to end. */
    length: 60,
    /** Inside width of the boards, side to side. */
    width: 28,
    /** Radius of the rounded corners. */
    cornerRadius: 8,
    /** Distance from each end board to the goal line (the goal mouth). */
    goalLineInset: 5,
    /** Width of the goal mouth (along y). */
    goalWidth: 1.8,
    /** Depth of the goal frame behind the goal line (along x). */
    goalDepth: 1.0,
    /** Radius of the crease circle, centered on the middle of the goal line. */
    creaseRadius: 3,
    /** Radius of the faceoff circle at center. */
    centerCircleRadius: 4,
  },

  teams: {
    /** Runners per side (goalie not included). The code must work with 3, 4, or 5. */
    runnersPerSide: 4,
  },

  match: {
    periods: 4,
    periodSeconds: 150,
  },
} as const;

/** Widen literal types so tests and tools can supply their own numbers. */
type Widen<T> = T extends number ? number : T extends object ? { -readonly [K in keyof T]: Widen<T[K]> } : T;

export type SimConfig = Widen<typeof DEFAULT_CONFIG>;

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

/** Returns a full config with the given overrides applied on top of the defaults. */
export function makeConfig(overrides: DeepPartial<SimConfig> = {}): SimConfig {
  return deepMerge(structuredClone(DEFAULT_CONFIG) as SimConfig, overrides);
}

function deepMerge<T>(base: T, over: DeepPartial<T>): T {
  for (const key of Object.keys(over) as (keyof T)[]) {
    const value = over[key];
    if (value === undefined) continue;
    const current = base[key];
    if (typeof value === 'object' && value !== null && typeof current === 'object' && current !== null) {
      deepMerge(current, value as DeepPartial<typeof current>);
    } else {
      base[key] = value as T[keyof T];
    }
  }
  return base;
}

/** Seconds per sim tick. */
export function tickSeconds(config: SimConfig): number {
  return 1 / config.tickHz;
}
