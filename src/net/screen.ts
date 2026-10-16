import { FixedStepper, tickSeconds, type SimConfig, type TeamIndex } from '../sim';
import { NetClock } from './clock';
import { Predictor, Smoother, positionsOf, type Positions } from './predictor';
import type { SideInput, Snapshot } from './protocol';
import { CorrectionLog } from './readout';
import type { OnlineWorld } from './world';

/** A newer server state moved things from where the screen had them. */
export interface Correction {
  before: Positions;
  after: Positions;
  /** The witch this screen's person controls (null: watching). */
  mine: number | null;
}

/**
 * One screen in an online match (SPEC §11, M12): its clock, its prediction ahead of the
 * server, and the smoothing of corrections. The match scene draws from it, and the network
 * sim (`npm run sim -- --net`) runs the same code against simulated lag. Pure: the caller
 * passes elapsed time and the time now, and says what this person's controls are each tick.
 */
export class NetScreen {
  readonly predictor: Predictor;
  readonly smoother: Smoother;
  readonly clock: NetClock;
  /** Corrections, for the network readout. */
  readonly corrections: CorrectionLog;
  /** Where everyone was a tick ago, for drawing between ticks (null right after a correction). */
  prev: Positions | null = null;
  /** Every correction, as it happens (the network sim listens). */
  onCorrection: ((fix: Correction, now: number) => void) | null = null;
  private readonly stepper: FixedStepper;
  private outbox: SideInput[] = [];
  private now = 0;

  constructor(
    config: SimConfig,
    readonly side: TeamIndex | null,
    /**
     * This person's controls for tick `t`, given the predicted world a tick before it
     * (null before the first server state). Not called for a watcher.
     */
    private readonly controls: (t: number, world: Readonly<OnlineWorld> | null) => SideInput,
  ) {
    this.predictor = new Predictor(config, side);
    this.smoother = new Smoother(config);
    this.clock = new NetClock(config);
    this.corrections = new CorrectionLog(config.online.snapMeters);
    this.stepper = new FixedStepper(() => this.tick(), tickSeconds(config), config.maxStepsPerFrame);
  }

  /** A server state arrived, with how early our controls are getting there (null: no news). */
  receive(snap: Snapshot, slack: number | null): void {
    this.predictor.receive(snap);
    this.clock.onSnapshot(snap.world.tick, slack, this.side === null);
  }

  /**
   * One frame: `dt` seconds passed and it's `now` (ms). Steps the clock, predicts up to it,
   * and eases corrections. Returns the controls to send to the server (in tick order) and the
   * fraction of a tick left over, for drawing between ticks.
   */
  frame(dt: number, now: number): { send: SideInput[]; alpha: number } {
    this.now = now;
    let alpha = 1;
    if (this.clock.tick !== null) alpha = this.stepper.advance(dt * this.clock.rate);
    const send = this.outbox;
    this.outbox = [];
    if (this.clock.tick !== null) this.correct(this.predictor.advanceTo(this.clock.tick));
    this.smoother.decay(dt);
    return { send, alpha };
  }

  /** The witch this screen's person controls right now, or null (watching, or no state yet). */
  get controlled(): number | null {
    const w = this.predictor.world;
    return this.side === null || !w ? null : w.control[this.side];
  }

  /** One tick of this screen's clock: this person's controls for it, queued and predicted. */
  private tick(): void {
    const t = (this.clock.tick ?? 0) + 1;
    this.clock.tick = t;
    if (this.side !== null) {
      const input = this.controls(t, this.predictor.world);
      this.outbox.push(input);
      this.predictor.addInput(input);
    }
    this.prev = this.predictor.world ? positionsOf(this.predictor.world) : null;
    this.correct(this.predictor.advanceTo(t));
  }

  /** A newer server state moved things: draw them where they were and ease them over. */
  private correct(fix: { before: Positions; after: Positions } | null): void {
    if (!fix) return;
    const mine = this.controlled;
    this.corrections.add(this.now, fix.before, fix.after, mine);
    this.onCorrection?.({ ...fix, mine }, this.now);
    this.smoother.correct(fix.before, fix.after);
    this.prev = null;
  }
}
