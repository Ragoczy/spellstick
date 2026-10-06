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
    /** Break between periods, and before overtime (s). */
    periodBreakSeconds: 3,
    /** Length of each sudden-death overtime period (s); another starts if nobody scores. */
    overtimeSeconds: 150,
  },

  /** Faceoffs (SPEC §4.1). */
  faceoff: {
    /** The whistle blows a random time after the players set, between these (s). */
    minDelaySeconds: 1.0,
    maxDelaySeconds: 2.0,
    /** If nobody presses within this long after the whistle, the ball is just dropped loose (s). */
    timeoutSeconds: 3,
    /** How far each taker stands from the center dot (m). */
    takerOffset: 0.9,
  },

  /** Shot clock (SPEC §4.3). */
  shotClock: {
    seconds: 30,
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
    blockChance: 0.5,
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

  /** Body checks (SPEC §4.5–4.6): right click dashes in the move direction. */
  check: {
    /** Dash speed (m/s) and duration (s). */
    dashSpeed: 11,
    dashSeconds: 0.18,
    /** Time from one check to the next (s), counted from the start of the dash. */
    cooldownSeconds: 1.4,
    /** A dash hits an opponent whose center comes within two body radii plus this (m). */
    reach: 0.3,
    /** Speed added to the player who gets hit, along the dash direction (m/s). */
    knockbackSpeed: 8,
    /** How long a hit player loses control (s). */
    staggerSeconds: 0.6,
    /** Chance a hit on the ball carrier knocks the ball loose. */
    looseChance: 0.4,
    /** A knocked-loose ball pops out at this speed (m/s), scattered up to `looseScatterDeg`. */
    looseSpeed: 5,
    looseScatterDeg: 60,
    /** Fraction of the dash speed the checker keeps after the hit. */
    checkerKeep: 0.3,
    /** A staggered player slammed into the boards faster than this (m/s)... */
    boardSlamSpeed: 3,
    /** ...is staggered this much longer (s). */
    boardSlamExtraSeconds: 0.4,
    /** Goalie protection: a checker bounces off a goalie in their crease at this speed (m/s)... */
    goalieBounceSpeed: 5,
    /** ...and is staggered this long (s). */
    goalieBounceStaggerSeconds: 0.4,
  },

  /** Mana (SPEC §6). Runners only; the goalie's Ward runs on a cooldown alone. */
  mana: {
    max: 100,
    /** Regeneration while carrying the ball (per second)... */
    regenCarrying: 0.6,
    /** ...and while not carrying it (per second). */
    regenFree: 1.0,
  },

  /** Spells (SPEC §6). Names and descriptions live in src/content/spells.ts. */
  spells: {
    hexShove: {
      cost: 50,
      cooldownSeconds: 10,
      /** Opponents within this distance (m)... */
      range: 3.5,
      /** ...and this half-angle of where the stick points (degrees) are hit. */
      coneHalfAngleDeg: 35,
      /** Knockback speed (m/s) and stagger (s) for each player hit. */
      knockbackSpeed: 9,
      staggerSeconds: 0.6,
      /** A carrier who gets hit always loses the ball, which pops out at this speed (m/s). */
      looseSpeed: 6,
    },
    quickstep: {
      cost: 30,
      cooldownSeconds: 8,
      durationSeconds: 2.5,
      /** Top speed multiplier while active. */
      speedMultiplier: 1.4,
    },
    bentShot: {
      cost: 25,
      cooldownSeconds: 5,
      /** The armed shot launches this far (degrees) off the aim line, then curves back onto it. */
      bendAngleDeg: 14,
      /** Curve is planned for at least this distance (m), so very close shots don't whip around. */
      minBendDistance: 4,
      /** Extra save-chance penalty for a bending shot: it's harder to read. */
      savePenalty: 0.25,
    },
    ward: {
      cooldownSeconds: 180,
      /** The shield stays up this long (s) or until it blocks one shot. */
      durationSeconds: 1.0,
      /** A warded shot bounces back out at this fraction of its speed. */
      reboundSpeedKeep: 0.4,
      reboundScatterDeg: 40,
    },
  },

  /**
   * AI tuning. `levels` are the difficulty presets (SPEC §7); the rest is shared behavior.
   * Durations are in seconds, distances in meters.
   */
  ai: {
    levels: {
      easy: {
        /** Defensive reaction lag: time to mostly catch up to an attacker's move. */
        reactionSeconds: 0.3,
        /** Random error in where the AI aims at the goal (m, either side). */
        aimErrorM: 0.45,
        /** Shoots from at most this far out. */
        shootRange: 10,
        /** A pass lane counts as open if no opponent is within this distance of it. */
        passLaneClearance: 1.6,
        /** Per-tick chance of throwing a check when one is available (higher vs a shooter winding up). */
        checkChancePerTick: 0.002,
        /** Goalie reaction time to a shot. */
        goalieReactionSeconds: 0.22,
        /** Faceoff press after the whistle: this long, plus up to faceoffWindowSeconds more at random. */
        faceoffReactionSeconds: 0.15,
        faceoffWindowSeconds: 0.35,
        /** Chance of jumping the whistle (a misfire loses the faceoff). */
        faceoffMisfireChance: 0.1,
        /** Scales how readily the AI casts spells when a good moment comes up. */
        spellEagerness: 0.5,
      },
      normal: {
        reactionSeconds: 0.17,
        aimErrorM: 0.25,
        shootRange: 11,
        passLaneClearance: 2.2,
        checkChancePerTick: 0.004,
        goalieReactionSeconds: 0.13,
        faceoffReactionSeconds: 0.12,
        faceoffWindowSeconds: 0.25,
        faceoffMisfireChance: 0.04,
        spellEagerness: 1,
      },
      hard: {
        reactionSeconds: 0.1,
        aimErrorM: 0.12,
        shootRange: 12,
        passLaneClearance: 2.4,
        checkChancePerTick: 0.007,
        goalieReactionSeconds: 0.08,
        faceoffReactionSeconds: 0.1,
        faceoffWindowSeconds: 0.15,
        faceoffMisfireChance: 0.02,
        spellEagerness: 1.3,
      },
    },
    runner: {
      /** Don't pass within this long of getting the ball (stops ping-pong). */
      minHoldSeconds: 0.75,
      /** Shots need this much clearance from opposing bodies beyond body + ball radius. */
      shotLaneMargin: 0.2,
      /** Shoot only when at least this far out from the goal line, and not wider than this ratio. */
      minShotFront: 2.5,
      maxShotAngleRatio: 1.6,
      /** Aim this far inside the post. */
      postInset: 0.3,
      /** An opponent this close counts as pressure. */
      pressureRadius: 2.2,
      /** Slower than this while trying to move counts as blocked... */
      blockedSpeed: 0.6,
      /** ...for this long. */
      blockedSeconds: 0.5,
      /** Re-pick juke direction this often. */
      jukeSeconds: 0.67,
      /** In range without a look for this long: reset back out. */
      inRangePatienceSeconds: 1.25,
      /** A reset carries back out for this long. */
      resetSeconds: 0.75,
      /** A carrier within this radius for `noProgressSeconds` resets. */
      noProgressRadius: 2.5,
      noProgressSeconds: 1.5,
      /** Gap kept from a marked attacker (goal-side), and from the carrier when pressuring. */
      markGap: 2.5,
      pressureGap: 1.6,
      /** Defenders whose man is farther than this from goal sag toward the crease instead. */
      sagDistance: 16,
      /** Checks are thrown at opponents within this distance... */
      checkRange: 2.0,
      /** ...this many times as often at a carrier who is winding up a shot. */
      checkWindupMultiplier: 4,
      /** In range with the lane covered, chance per tick of shooting through traffic anyway. */
      forceShotChancePerTick: 0.012,
      /** Off-ball attackers drift around their spot this far (m) over about this long (s). */
      driftLateral: 3.5,
      driftDepth: 2,
      driftSeconds: 4.5,
      /** Off-ball attackers cut to the crease edge for this long, about this often. */
      cutSeconds: 0.9,
      cutEverySeconds: 4,
      /** Off-ball attackers keep at least this far from their nearest defender if they can. */
      getOpenRadius: 2.5,
      /** Off the ball, keep at least this far from teammates (m). */
      teammateSpacing: 2.2,
      /** Look this far ahead (m) for a goal frame in the way, and slide around it. */
      goalLookahead: 2.5,
      /** Stay this far outside the opponent's crease (m). */
      creaseMargin: 0.4,
      /** Shot clock under this (s): shoot even through traffic, from a bit farther out... */
      shotClockUrgentSeconds: 8,
      urgentRangeBonus: 3,
      /** ...under this (s): shoot from anywhere within desperateRange. */
      shotClockDesperateSeconds: 3,
      desperateRange: 20,
      /** Per-tick chance (times spellEagerness) of Hex Shove when an opponent is in the cone. */
      hexShoveChancePerTick: 0.0015,
      /** ...tripled against a carrier winding up a shot or within this distance (m) of our goal. */
      hexShoveThreatDistance: 9,
      /** Quickstep for a breakaway: carrying with this much open floor (m) toward goal... */
      quickstepBreakawayDistance: 14,
      /** ...and nobody within this distance (m) of us. */
      quickstepBreakawaySpace: 4,
      /** ...or racing an opponent to a loose ball that's this close (m). */
      quickstepRaceDistance: 6,
      /** Per-tick chances (times spellEagerness) of Quickstep in those two situations. */
      quickstepBreakawayChancePerTick: 0.02,
      quickstepRaceChancePerTick: 0.003,
      /** Chance (times spellEagerness) of arming Bent Shot before a shot when it's ready. */
      bentShotChance: 0.6,
    },
    goalie: {
      /** Distance in front of the goal line the goalie patrols. */
      arcRadius: 1.6,
      /** Widest angle off straight-out the goalie follows the ball (radians). */
      maxArcAngle: 1.25,
      /** Leaves the crease for loose balls this close to the goal mouth. */
      chaseLooseRange: 4.5,
      /** Holds a caught ball this long before clearing. */
      holdSeconds: 0.85,
      /** Raise the Ward against an on-target shot from closer than this (m)... */
      wardDangerDistance: 7,
      /** ...or faster than this (m/s). */
      wardDangerSpeed: 27,
    },
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

/** AI difficulty preset name (SPEC §7). */
export type Difficulty = keyof SimConfig['ai']['levels'];
export type AiLevel = SimConfig['ai']['levels'][Difficulty];

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

/** Whole ticks for a duration in seconds. */
export const secondsToTicks = (s: number, config: SimConfig): number => Math.round(s * config.tickHz);

/** Seconds per sim tick. */
export function tickSeconds(config: SimConfig): number {
  return 1 / config.tickHz;
}
