import { NO_INPUT, type InputCommand, type SimConfig, type TeamIndex, type Vec2 } from '../sim';
import { heldOnly, type SideInput, type Snapshot } from './protocol';
import { stepWorld, type OnlineWorld } from './world';

/**
 * A screen's view of an online match (SPEC §11). The server's latest state is a little in the
 * past by the time it arrives, so the screen runs ahead of it: from that state it steps the
 * same world forward with this person's own controls (which it knows exactly) and everyone
 * else's last known commands carried forward. When the next server state arrives, it starts
 * over from that one. Watchers (no side) just carry everyone forward.
 */
export class Predictor {
  private auth: { world: OnlineWorld; inputs: InputCommand[] } | null = null;
  private fresh = false;
  private readonly mine = new Map<number, SideInput>();
  /** The predicted world, or null before the first server state. */
  world: OnlineWorld | null = null;

  constructor(
    private readonly config: SimConfig,
    private readonly side: TeamIndex | null,
  ) {}

  /** The server's latest state, as received (don't change it). */
  get server(): Readonly<OnlineWorld> | null {
    return this.auth?.world ?? null;
  }

  /** A new state from the server. Older ones than what we have are ignored. */
  receive(snap: Snapshot): void {
    if (this.auth && snap.world.tick <= this.auth.world.tick) return;
    this.auth = { world: snap.world, inputs: snap.inputs.map(heldOnly) };
    this.fresh = true;
    for (const t of this.mine.keys()) if (t <= snap.world.tick) this.mine.delete(t);
  }

  /** This person's controls for a tick (already sent to the server). */
  addInput(input: SideInput): void {
    this.mine.set(input.t, input);
  }

  /**
   * Brings the predicted world up to `tick` (never more than `maxPredictTicks` past the
   * server's state). Returns true if it started over from a newer server state, which may
   * have moved things: the caller smooths that over.
   */
  advanceTo(tick: number): boolean {
    const auth = this.auth;
    if (!auth) return false;
    let restarted = false;
    if (this.fresh || !this.world) {
      this.world = structuredClone(auth.world);
      this.fresh = false;
      restarted = true;
    }
    const target = Math.min(tick, auth.world.tick + this.config.online.maxPredictTicks);
    while (this.world.tick < target) this.stepOnce(this.world, auth.inputs);
    return restarted;
  }

  private stepOnce(world: OnlineWorld, others: InputCommand[]): void {
    const t = world.tick + 1;
    const sides: (SideInput | null)[] = [null, null];
    if (this.side !== null && world.humans[this.side])
      sides[this.side] = this.mine.get(t) ?? this.heldBefore(t);
    stepWorld(world, sides, (id) => others[id] ?? NO_INPUT, this.config);
  }

  /** The latest controls before tick `t`, held (no presses), for a tick we have none for. */
  private heldBefore(t: number): SideInput | null {
    let best: SideInput | null = null;
    for (const input of this.mine.values()) if (input.t < t && (!best || input.t > best.t)) best = input;
    if (!best) return null;
    const held: SideInput = { t, move: best.move, aim: best.aim };
    if (best.primary) held.primary = true;
    return held;
  }
}

/** Where things are drawn: every player and the ball. */
export interface Positions {
  players: Vec2[];
  ball: Vec2;
}

export function positionsOf(world: Readonly<OnlineWorld>): Positions {
  return {
    players: world.match.players.map((p) => ({ x: p.pos.x, y: p.pos.y })),
    ball: { x: world.match.ball.pos.x, y: world.match.ball.pos.y },
  };
}

/**
 * Hides corrections: when a newer server state moves something, it's drawn where it was and
 * eases to where it really is over `config.online.smoothSeconds`. Big jumps (a restart after
 * a goal) just snap.
 */
export class Smoother {
  private players: Vec2[] = [];
  private ballOffset: Vec2 = { x: 0, y: 0 };

  constructor(private readonly config: SimConfig) {}

  /** Something was drawn at `before` and is now at `after`. */
  correct(before: Positions, after: Positions): void {
    const snap = this.config.online.snapMeters;
    const carry = (offset: Vec2 | undefined, b: Vec2, a: Vec2): Vec2 => {
      const x = (offset?.x ?? 0) + b.x - a.x;
      const y = (offset?.y ?? 0) + b.y - a.y;
      return Math.hypot(x, y) > snap ? { x: 0, y: 0 } : { x, y };
    };
    this.players = after.players.map((a, i) => {
      const b = before.players[i];
      return b ? carry(this.players[i], b, a) : { x: 0, y: 0 };
    });
    this.ballOffset = carry(this.ballOffset, before.ball, after.ball);
  }

  /** Eases every offset toward zero over `dtSeconds`. */
  decay(dtSeconds: number): void {
    const k = Math.exp(-Math.max(0, dtSeconds) / this.config.online.smoothSeconds);
    for (const o of this.players) {
      o.x *= k;
      o.y *= k;
    }
    this.ballOffset.x *= k;
    this.ballOffset.y *= k;
  }

  player(id: number): Vec2 {
    return this.players[id] ?? { x: 0, y: 0 };
  }

  get ball(): Vec2 {
    return this.ballOffset;
  }

  reset(): void {
    this.players = [];
    this.ballOffset = { x: 0, y: 0 };
  }
}
