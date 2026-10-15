import type { Flight, MatchState, SimEvent, Vec2 } from '../sim';

/**
 * Instant goal replays (M9). Presentation only: the scene records what each sim tick looked
 * like and, after a goal, draws the run-up again in slow motion while the sim waits. The sim
 * never knows, so a match plays out exactly as it would without replays.
 *
 * These are presentation timings, not game rules, so they live here rather than in
 * src/sim/config.ts (like the input and voice constants in src/ui).
 */
export const REPLAY = {
  /** How much of the run-up to show, before the goal (s of game time)... */
  leadSeconds: 2.5,
  /** ...and after it. */
  tailSeconds: 0.5,
  /** Playback speed (0.5 = half speed). */
  speed: 0.5,
  /** The goal plays out live for this long (s of game time) before the replay cuts in. */
  delaySeconds: 1,
} as const;

/** One player as drawn in a replay frame. */
export interface ReplayPlayer {
  x: number;
  y: number;
  facing: number;
  charge: number;
  staggered: boolean;
  quickstep: boolean;
  armed: boolean;
  rooted: boolean;
  stone: boolean;
  images: number;
}

/** What one sim tick looked like: enough to draw it again. */
export interface ReplayFrame {
  tick: number;
  players: ReplayPlayer[];
  ball: { x: number; y: number; vel: Vec2; flight: Pick<Flight, 'kind' | 'spin' | 'tailwind'> | null };
  /** Ids of goalies whose Ward is up. */
  wards: number[];
  /** Ice Walls standing. */
  walls: { a: Vec2; b: Vec2 }[];
  /** Events with a visual effect (hits, spells), to flash again during the replay. */
  fx: SimEvent[];
  /** Play restarted on this tick (a faceoff set): a replay never reaches back past it. */
  cut: boolean;
}

const FX_EVENTS: ReadonlySet<SimEvent['type']> = new Set([
  'check',
  'checkBounce',
  'hexShove',
  'cast',
  'wardBlock',
  'blink',
  'snare',
  'imagePop',
  'stoneBlock',
]);

/** Captures a frame from sim state after a tick. `charge` maps a player to their shot charge (0..1). */
export function captureFrame(state: Readonly<MatchState>, charge: (playerId: number) => number): ReplayFrame {
  const ball = state.ball;
  return {
    tick: state.tick,
    players: state.players.map((p) => ({
      x: p.pos.x,
      y: p.pos.y,
      facing: p.facing,
      charge: ball.carrier === p.id ? charge(p.id) : 0,
      staggered: p.staggerTicks > 0,
      quickstep: p.quickstepTicks > 0,
      armed: p.armed !== null,
      rooted: p.rootTicks > 0,
      stone: p.stoneTicks > 0,
      images: p.images,
    })),
    ball: {
      x: ball.pos.x,
      y: ball.pos.y,
      vel: { x: ball.vel.x, y: ball.vel.y },
      flight: ball.flight
        ? { kind: ball.flight.kind, spin: ball.flight.spin, tailwind: ball.flight.tailwind }
        : null,
    },
    wards: state.players.filter((p) => p.role === 'goalie' && p.wardTicks > 0).map((p) => p.id),
    walls: state.walls.map((w) => ({ a: { ...w.a }, b: { ...w.b } })),
    fx: state.events.filter((e) => FX_EVENTS.has(e.type)),
    cut: state.events.some((e) => e.type === 'faceoffSet' || e.type === 'restart'),
  };
}

/** A ring buffer of the most recent frames. */
export class ReplayRecorder {
  private frames: ReplayFrame[] = [];

  constructor(private readonly capacity: number) {}

  record(frame: ReplayFrame): void {
    this.frames.push(frame);
    if (this.frames.length > this.capacity) this.frames.shift();
  }

  clear(): void {
    this.frames = [];
  }

  get size(): number {
    return this.frames.length;
  }

  /**
   * Frames from `fromTick` to `toTick` (inclusive), oldest first, starting no earlier than
   * the last restart before `toTick`.
   */
  clip(fromTick: number, toTick: number): ReplayFrame[] {
    let start = 0;
    this.frames.forEach((f, i) => {
      if (f.cut && f.tick <= toTick) start = i;
    });
    return this.frames.slice(start).filter((f) => f.tick >= fromTick && f.tick <= toTick);
  }
}

/** One step of playback: the two frames to draw between, and effects that fired since the last step. */
export interface ReplayStep {
  from: ReplayFrame;
  to: ReplayFrame;
  /** 0..1 between `from` and `to`. */
  alpha: number;
  fired: SimEvent[];
  /** Frame `fired` came from, by event, for positions at the moment of the effect. */
  firedFrames: ReplayFrame[];
}

/** Plays frames back at `speed` × real time. */
export class ReplayPlayback {
  /** Position in frames (fractional). */
  private pos = 0;
  /** The last whole frame whose effects have been fired. */
  private firedUpTo = -1;

  constructor(
    private readonly frames: readonly ReplayFrame[],
    private readonly tickHz: number,
    private readonly speed: number = REPLAY.speed,
  ) {}

  get length(): number {
    return this.frames.length;
  }

  get done(): boolean {
    return this.frames.length < 2 || this.pos >= this.frames.length - 1;
  }

  /** Advances by `dtSeconds` of real time. Returns null once the clip has finished. */
  advance(dtSeconds: number): ReplayStep | null {
    if (this.done) return null;
    this.pos = Math.min(this.frames.length - 1, this.pos + Math.max(0, dtSeconds) * this.tickHz * this.speed);
    const i = Math.min(Math.floor(this.pos), this.frames.length - 2);
    const fired: SimEvent[] = [];
    const firedFrames: ReplayFrame[] = [];
    for (let k = this.firedUpTo + 1; k <= Math.floor(this.pos); k++) {
      const f = this.frames[k]!;
      for (const e of f.fx) {
        fired.push(e);
        firedFrames.push(f);
      }
    }
    this.firedUpTo = Math.max(this.firedUpTo, Math.floor(this.pos));
    return { from: this.frames[i]!, to: this.frames[i + 1]!, alpha: this.pos - i, fired, firedFrames };
  }
}
