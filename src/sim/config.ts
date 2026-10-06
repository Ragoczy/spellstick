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

  player: {
    /** Body radius. */
    radius: 0.6,
    /** Top running speed. */
    maxSpeed: 7.5,
    /** Top speed multiplier while carrying the ball. */
    carrySpeedMultiplier: 0.92,
    /** How fast velocity moves toward the desired velocity while steering (m/s²). */
    accel: 32,
    /** How fast velocity bleeds off with no move input (m/s²). */
    friction: 24,
    /** Distance from body center to the stick head, where a carried ball sits. */
    stickReach: 0.95,
    /** Fraction of normal speed kept when a player runs into the boards (0 = dead stop). */
    boardRestitution: 0.1,
  },

  ball: {
    radius: 0.12,
    /** Constant rolling deceleration for a loose ball (m/s²). */
    rollingDecel: 2.5,
    /** Extra speed-proportional drag for a loose ball (per second). */
    drag: 0.35,
    /** Loose balls slower than this stop dead. */
    stopSpeed: 0.05,
    /** Fraction of normal speed kept after hitting the boards. */
    boardRestitution: 0.65,
    /** Fraction of tangential speed kept after hitting the boards. */
    boardTangentKeep: 0.9,
    /** Fraction of normal speed kept after hitting the goal frame. */
    goalRestitution: 0.5,
  },

  scoop: {
    /** A loose ball within this distance of a player's center can be scooped. */
    radius: 1.15,
    /** Scoop success chance when the ball and player move at the same velocity. */
    chanceSlow: 0.95,
    /** Scoop success chance at or above `fastRelSpeed` relative speed. */
    chanceFast: 0.55,
    /** Relative speed (m/s) at which the scoop chance bottoms out. */
    fastRelSpeed: 9,
    /** After a failed scoop, the player waits this long before trying again (s). */
    retrySeconds: 0.3,
    /** A failed scoop knocks the ball away at this speed (m/s). */
    fumbleSpeed: 2,
    /** A player who just lost or released the ball can't scoop it for this long (s). */
    releaseCooldownSeconds: 0.6,
  },

  /** Health checks reported by the headless sim. */
  diagnostics: {
    /** A player within `stuckRadius` meters of one spot for longer than this, during live play, is "stuck". */
    stuckSeconds: 5,
    stuckRadius: 1,
  },

  /** Debug-only actions for playtesting. */
  debug: {
    /** Speed added in the facing direction when dropping the ball (m/s). */
    dropPush: 1,
    /** Speed of the debug toss toward the cursor (m/s). */
    tossSpeed: 14,
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
