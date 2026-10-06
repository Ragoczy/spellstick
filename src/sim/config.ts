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
    /** Dead-ball pause after a goal before play restarts (s). The game clock stops. */
    goalPauseSeconds: 2,
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
    /** Speed-proportional drag while a pass or shot is in the air (per second). */
    airDrag: 0.15,
  },

  pass: {
    /** Launch speed of a pass (m/s). */
    speed: 17,
    /** A press shorter than this is a pass; longer starts charging a shot (s). */
    tapSeconds: 0.18,
    /** Teammates within this half-angle of the aim direction get assist magnetism (degrees). */
    coneHalfAngleDeg: 22,
    /** Teammates farther than this don't get assist magnetism (m). */
    maxAssistRange: 32,
    /** How hard an assisted pass bends toward the receiver in flight (degrees per second). */
    homingDegPerSec: 70,
    /** A pass stays in the air this long, then lands and rolls (s). */
    airSeconds: 1.1,
  },

  catch: {
    /** An in-flight pass this close to a player's stick head can be caught (m). */
    radius: 1.0,
    /** Catch chance for the passing team at low relative speed... */
    chanceSlow: 0.95,
    /** ...falling to this at `fastRelSpeed` relative speed. */
    chanceFast: 0.75,
    /** Interception chance for the other team at low relative speed... */
    interceptSlow: 0.6,
    /** ...falling to this at `fastRelSpeed`. */
    interceptFast: 0.3,
    /** Relative speed (m/s) at which catch chances bottom out. */
    fastRelSpeed: 22,
    /** A dropped pass keeps this fraction of its speed... */
    dropSpeedKeep: 0.3,
    /** ...and veers up to this many degrees off its path. */
    dropScatterDeg: 50,
  },

  shot: {
    /** Speed of a shot released right after the tap window (m/s). */
    minSpeed: 18,
    /** Speed of a fully charged shot (m/s). */
    maxSpeed: 32,
    /** Hold time for a full charge, counted from the start of the press (s). */
    fullChargeSeconds: 1.0,
    /** Move speed multiplier while charging a shot. */
    chargeMoveMultiplier: 0.75,
    /** Aim error for a standing shot (degrees, max either side). */
    spreadStandingDeg: 1.5,
    /** Extra aim error at full running speed (degrees). */
    spreadRunningDeg: 4,
    /** A shot stays in the air this long, then lands and rolls (s). */
    airSeconds: 1.4,
    /** Chance an opposing runner's body blocks a shot that hits them. */
    blockChance: 0.6,
    /** A blocked shot keeps this fraction of its speed. */
    blockSpeedKeep: 0.35,
  },

  goalie: {
    /** Goalies move a bit slower than runners but react sharper. */
    maxSpeed: 6.5,
    accel: 45,
    /** A shot passing within this distance of the goalie's center can be saved (m). */
    saveRadius: 1.05,
    /** Save chance for a slow shot straight at the goalie (the result is capped at 97%)... */
    saveBase: 1.08,
    /** ...minus up to this much for a full-speed shot... */
    saveSpeedPenalty: 0.15,
    /** ...minus up to this much for a shot at the edge of the goalie's reach... */
    saveEdgePenalty: 0.6,
    /** ...minus up to this much for a shot released very close to the goalie. */
    saveReactionPenalty: 0.3,
    /** Shots released farther than this from the goalie take no reaction penalty (m). */
    reactionDistance: 8,
    /** Of successful saves, this fraction are caught clean; the rest are rebounds. */
    catchFraction: 0.4,
    /** A rebound keeps this fraction of the shot's speed. */
    reboundSpeedKeep: 0.35,
    /** Rebounds scatter up to this many degrees either side of straight out (degrees). */
    reboundScatterDeg: 65,
    /** Chance a goalie gets a stick on a pass that comes within save range. */
    passInterceptChance: 0.7,
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
