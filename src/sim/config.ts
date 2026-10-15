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
    maxSpeed: 3.75,
    /** Top speed multiplier while carrying the ball. */
    carrySpeedMultiplier: 0.92,
    /** How fast velocity moves toward the desired velocity while steering (m/s²). */
    accel: 16,
    /** How fast velocity bleeds off with no move input (m/s²). */
    friction: 12,
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
    blockChance: 0.35,
    /** A blocked shot keeps this fraction of its speed. */
    blockSpeedKeep: 0.35,
  },

  goalie: {
    /** Goalies move a bit slower than runners but react sharper. */
    maxSpeed: 3.25,
    accel: 22.5,
    /** A shot passing within this distance of the goalie's center can be saved (m). */
    saveRadius: 1.05,
    /** Save chance for a slow shot straight at the goalie (the result is capped at 97%)... */
    saveBase: 0.95,
    /** ...minus up to this much for a full-speed shot... */
    saveSpeedPenalty: 0.15,
    /** ...minus up to this much for a shot at the edge of the goalie's reach... */
    saveEdgePenalty: 0.7,
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
    dashSpeed: 5.5,
    dashSeconds: 0.18,
    /** Time from one check to the next (s), counted from the start of the dash. */
    cooldownSeconds: 1.4,
    /** A dash hits an opponent whose center comes within two body radii plus this (m). */
    reach: 0.3,
    /** Speed added to the player who gets hit, along the dash direction (m/s). */
    knockbackSpeed: 4,
    /** How long a hit player loses control (s). */
    staggerSeconds: 0.6,
    /** Chance a hit on the ball carrier knocks the ball loose. */
    looseChance: 0.35,
    /** A knocked-loose ball pops out at this speed (m/s), scattered up to `looseScatterDeg`. */
    looseSpeed: 5,
    looseScatterDeg: 60,
    /** Fraction of the dash speed the checker keeps after the hit. */
    checkerKeep: 0.3,
    /** A staggered player slammed into the boards faster than this (m/s)... */
    boardSlamSpeed: 1.5,
    /** ...is staggered this much longer (s). */
    boardSlamExtraSeconds: 0.4,
    /** Goalie protection: a checker bounces off a goalie in their crease at this speed (m/s)... */
    goalieBounceSpeed: 2.5,
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

  /**
   * Spells (SPEC §6, M10). Names and descriptions live in src/content/spells.ts: `hexShove` is
   * Thunderclap, `quickstep` Burst of Speed, and `bentShot` Misdirection.
   */
  spells: {
    hexShove: {
      cost: 50,
      cooldownSeconds: 10,
      /** Opponents within this distance (m)... */
      range: 3.5,
      /** ...and this half-angle of where the stick points (degrees) are hit. */
      coneHalfAngleDeg: 35,
      /** Knockback speed (m/s) and stagger (s) for each player hit. */
      knockbackSpeed: 4.5,
      staggerSeconds: 0.6,
      /** A carrier who gets hit always loses the ball, which pops out at this speed (m/s). */
      looseSpeed: 6,
    },
    quickstep: {
      cost: 12,
      cooldownSeconds: 7,
      durationSeconds: 3,
      /** Top speed multiplier while active. */
      speedMultiplier: 1.5,
    },
    bentShot: {
      cost: 30,
      cooldownSeconds: 5,
      /** The armed shot launches this far (degrees) off the aim line, then curves back onto it. */
      bendAngleDeg: 14,
      /** Curve is planned for at least this distance (m), so very close shots don't whip around. */
      minBendDistance: 4,
      /** Extra save-chance penalty for a bending shot: it's harder to read. */
      savePenalty: 0.18,
    },
    /** Arms your next shot: no aim error, and harder to save. */
    pinpoint: {
      cost: 25,
      cooldownSeconds: 6,
      savePenalty: 0.2,
    },
    /** Teleports you the way you're moving (or aiming), ball and all. */
    blink: {
      cost: 40,
      cooldownSeconds: 13,
      /** How far (m), cut short at the boards, a goal, a crease you can't enter, or an Ice Wall... */
      distance: 4,
      /** ...checked every this many meters along the way. */
      step: 0.25,
      /** A Blink that can't go at least this far (m) isn't cast. */
      minDistance: 1,
    },
    /**
     * Pins the nearest opponent in a narrow cone in place and binds their stick: no shooting,
     * catching, or scooping till it breaks, and a carrier may have the ball yanked loose toward you.
     */
    snare: {
      cost: 40,
      cooldownSeconds: 9,
      range: 7,
      coneHalfAngleDeg: 15,
      /** After a Snare, its target can't be snared again for this long past the pin (s): no chain-snaring. */
      immuneSeconds: 3,
      /** Chance a snared carrier's ball comes loose, toward the caster at this speed (m/s). */
      yankChance: 0.3,
      yankSpeed: 6,
      rootSeconds: 1.2,
    },
    /** A short wall in front of you that balls and players bounce off. */
    iceWall: {
      cost: 50,
      cooldownSeconds: 16,
      /** Its middle is this far in front of you (m), square to where your stick points... */
      distance: 3,
      /** ...this long (m) and this thick either side of its line (m)... */
      length: 3,
      halfThickness: 0.15,
      /** ...for this long (s). */
      durationSeconds: 2,
      /** A ball keeps this fraction of its speed off the wall. */
      restitution: 0.4,
    },
    /** For a moment, checks and Thunderclaps don't knock you back, daze you, or strip the ball. */
    stoneSkin: {
      cost: 15,
      cooldownSeconds: 8,
      durationSeconds: 3.5,
    },
    /** Arms your next pass: faster, farther, can't be intercepted, always caught. */
    tailwind: {
      cost: 25,
      cooldownSeconds: 6,
      speedMultiplier: 1.4,
      airMultiplier: 1.4,
      homingMultiplier: 1.5,
    },
    /** Illusions beside you that take hits meant for you (the card's images: 1–4 on a d6). */
    glamourSelf: {
      cost: 15,
      cooldownSeconds: 10,
      durationSeconds: 6,
      images: 2,
      /** Chance a check, Thunderclap, or Snare at you hits an illusion instead (one fades). */
      imageHitChance: 4 / 6,
      /** How far either side of you the illusions run (m), for drawing. */
      spacing: 1.3,
    },
    ward: {
      cooldownSeconds: 240,
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
        reactionSeconds: 0.2,
        /** Random error in where the AI aims at the goal (m, either side). */
        aimErrorM: 0.3,
        /** Shoots from at most this far out. */
        shootRange: 12,
        /** A pass lane counts as open if no opponent is within this distance of it. */
        passLaneClearance: 1.6,
        /** Per-tick chance of throwing a check when one is available (higher vs a shooter winding up). */
        checkChancePerTick: 0.002,
        /** Goalie reaction time to a shot. */
        goalieReactionSeconds: 0.16,
        /** Faceoff press after the whistle: this long, plus up to faceoffWindowSeconds more at random. */
        faceoffReactionSeconds: 0.15,
        faceoffWindowSeconds: 0.35,
        /** Chance of jumping the whistle (a misfire loses the faceoff). */
        faceoffMisfireChance: 0.1,
        /** Scales how readily the AI casts spells when a good moment comes up. */
        spellEagerness: 0.8,
      },
      normal: {
        reactionSeconds: 0.17,
        aimErrorM: 0.25,
        shootRange: 13,
        passLaneClearance: 2.2,
        checkChancePerTick: 0.0025,
        goalieReactionSeconds: 0.13,
        faceoffReactionSeconds: 0.12,
        faceoffWindowSeconds: 0.25,
        faceoffMisfireChance: 0.04,
        spellEagerness: 1,
      },
      hard: {
        reactionSeconds: 0.15,
        aimErrorM: 0.2,
        shootRange: 14,
        passLaneClearance: 2.4,
        checkChancePerTick: 0.003,
        goalieReactionSeconds: 0.11,
        faceoffReactionSeconds: 0.1,
        faceoffWindowSeconds: 0.15,
        faceoffMisfireChance: 0.02,
        spellEagerness: 1.1,
      },
    },
    runner: {
      /** Don't pass within this long of getting the ball (stops ping-pong). */
      minHoldSeconds: 0.75,
      /** Unless desperate, only pass to a teammate at least this much closer to the goal (m). */
      passAdvance: 3,
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
      teammateSpacing: 1.6,
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
      quickstepBreakawayDistance: 9,
      /** ...and nobody within this distance (m) of us. */
      quickstepBreakawaySpace: 3,
      /** ...or racing an opponent to a loose ball that's this close (m). */
      quickstepRaceDistance: 6,
      /** Per-tick chances (times spellEagerness) of Quickstep in those two situations. */
      quickstepBreakawayChancePerTick: 0.01,
      quickstepRaceChancePerTick: 0.012,
      /**
       * Chance (times spellEagerness) of arming a shot spell before a shot when one is ready:
       * Misdirection (`bentShot`) or Pinpoint, picked at random if both are.
       */
      shotSpellChance: 0.5,
      /** Chance (times spellEagerness) of arming Tailwind before a pass... */
      tailwindChance: 0.6,
      /** ...and per tick while carrying under pressure, so it's ready (an armed Tailwind passes through crowded lanes). */
      tailwindPressureChancePerTick: 0.002,
      /** Per-tick chances (times spellEagerness) of Blink: to escape a defender in front, or in a loose-ball race. */
      blinkEscapeChancePerTick: 0.003,
      blinkRaceChancePerTick: 0.0008,
      /** Per-tick chance (times spellEagerness) of Snare at an opponent in the cone; weighted like Hex Shove. */
      snareChancePerTick: 0.0015,
      /** Per-tick chance (times spellEagerness) of Ice Wall when it would stand between a shooter and our goal. */
      iceWallChancePerTick: 0.02,
      /**
       * Stone Skin and Glamour Self, for a carrier about to be hit: chance (times spellEagerness)
       * when an opponent starts a check dash at them from this close (m)...
       */
      protectRange: 3,
      protectDashChance: 0.5,
      /** ...and per tick while an opponent with a check ready is this close (m). */
      protectCrowdRange: 1.8,
      protectCrowdChancePerTick: 0.003,
      /** Burst of Speed only with at least this much mana left over afterward. */
      quickstepReserve: 40,
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
    /**
     * Team playing styles (M9). Each scales the team's difficulty level and runner tuning:
     * 1 = unchanged, except `shootRange`, which adds meters. AI decisions only: every player
     * has the same body, stick, and spells whatever the style, and the human is unaffected.
     * Which team plays which style is in src/content/teams.ts.
     */
    styles: {
      /** The baseline every other style is measured against. */
      balanced: {
        checkChance: 1,
        spellEagerness: 1,
        holdSeconds: 1,
        passAdvance: 1,
        forceShot: 1,
        shootRange: 0,
      },
      /** Hits hard and carries the ball: more checks, holds on longer, shoots through traffic, casts less. */
      physical: {
        checkChance: 1.3,
        spellEagerness: 0.7,
        holdSeconds: 1.5,
        passAdvance: 1.3,
        forceShot: 1.4,
        shootRange: 0,
      },
      /** Moves the ball: passes early and sideways, and shoots from a little farther out. */
      passing: {
        checkChance: 1,
        spellEagerness: 1,
        holdSeconds: 0.6,
        passAdvance: 0.35,
        forceShot: 1,
        shootRange: 1,
      },
    },
  },

  /** The training ground (M9): small drills that teach one thing each. Layouts are in src/sim/drills.ts. */
  training: {
    /** Shot clock and period length in drills: long enough never to come up (s). */
    clockSeconds: 3600,
    /**
     * The drill goalie's save chance starts here instead of `goalie.saveBase`: beatable, so
     * the shooting lessons teach the shot rather than test it (a good shot from the drill
     * spots scores about half the time).
     */
    goalieSaveBase: 0.7,
    /** A drill's opponents (the goalie, the faceoff taker) play at this level. */
    opponentLevel: 'easy' as 'easy' | 'normal' | 'hard',
    /** After a point or a miss, the drill sets up again this long later (s). */
    resetSeconds: 1.2,
    /** The jogging carrier in the hitting drills moves at this fraction of top speed... */
    joggerSpeed: 0.55,
    /** ...around a circle this big (m)... */
    joggerRadius: 5,
    /** ...centered this far from center ice toward their own goal (m). */
    joggerOffset: 2,
  },

  /** Online 1v1 (M11, SPEC §11). The server runs the match; screens predict ahead of it. */
  online: {
    /** The server sends the match to everyone every this many ticks (2 = 30 times a second). */
    snapshotEveryTicks: 2,
    /** A player's controls should reach the server this many ticks before it needs them. */
    inputSlackTicks: 3,
    /** Further off than this (ticks), a screen jumps its clock instead of drifting it. */
    clockJumpTicks: 12,
    /** How much faster or slower a screen runs its clock to drift back to the right lead. */
    clockDrift: 0.06,
    /**
     * With no new controls from a player, the server carries their last ones forward this
     * long (ticks), then lets go of the sticks: a hidden tab stops sending, and its witch
     * shouldn't run into the boards for good.
     */
    holdInputTicks: 30,
    /** A screen never predicts further ahead of the latest server state than this (ticks). */
    maxPredictTicks: 30,
    /** Corrections to what's drawn fade out over about this long (s); bigger jumps than `snapMeters` just snap. */
    smoothSeconds: 0.1,
    snapMeters: 3,
    /** After a goal, the replay cuts in this long later (s) and the match waits this long for it (s). Matches src/render/replay.ts. */
    replayDelaySeconds: 1,
    replayHoldSeconds: 6,
    /** Both seats ready: the match starts this long later (s). */
    countdownSeconds: 3,
    /** The AI level for every AI witch in an online match. */
    aiLevel: 'normal' as 'easy' | 'normal' | 'hard',
  },

  /** Health checks reported by the headless sim. */
  diagnostics: {
    /** A player within `stuckRadius` meters of one spot for longer than this, during live play, is "stuck". The radius is about 2.7% of the distance a runner covers in that time at top speed. */
    stuckSeconds: 5,
    stuckRadius: 0.5,
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
/** Team playing style (M9). */
export type AiStyle = keyof SimConfig['ai']['styles'];
export type AiStyleTuning = SimConfig['ai']['styles'][AiStyle];

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
