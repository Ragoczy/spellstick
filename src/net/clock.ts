import type { SimConfig } from '../sim';

/** After a jump, wait this long (ticks) before believing the server's reports again: they predate it. */
const SETTLE_TICKS = 30;

/**
 * A screen's network clock in an online match (SPEC §11). A player's screen runs ahead of the
 * server so that their controls for each tick arrive just before the server steps it: the
 * server says how early they're arriving (`slack`), and the clock runs a little faster or
 * slower to keep that at `config.online.inputSlackTicks`, or jumps if it's far off. A watcher's
 * screen stays a snapshot ahead of the latest server state.
 */
export class NetClock {
  /** The tick this screen is on, or null before the first server state. */
  tick: number | null = null;
  /** Multiplies real time: above 1 to catch up, below 1 to fall back. */
  rate = 1;
  /** The server's latest report of how early our controls arrive (null: none yet, or watching). */
  lastSlack: number | null = null;
  private settleUntil = 0;

  constructor(private readonly config: SimConfig) {}

  /**
   * A server state for `serverTick` arrived. `slack` is how early our latest controls got
   * there (null: no news since the last snapshot). `watching`: we send no controls.
   */
  onSnapshot(serverTick: number, slack: number | null, watching: boolean): void {
    const o = this.config.online;
    if (slack !== null) this.lastSlack = slack;
    if (this.tick === null) {
      this.tick = serverTick + (watching ? o.snapshotEveryTicks : o.inputSlackTicks + 4);
      this.settleUntil = this.tick + SETTLE_TICKS;
      return;
    }
    if (this.tick < this.settleUntil) return;
    let error: number;
    if (watching) error = o.snapshotEveryTicks - (this.tick - serverTick);
    else if (slack !== null) error = o.inputSlackTicks - slack;
    else return; // no news: keep going as we are
    if (Math.abs(error) > o.clockJumpTicks) {
      this.tick = Math.max(serverTick, this.tick + error);
      this.rate = 1;
      this.settleUntil = this.tick + SETTLE_TICKS;
    } else if (error > 1) {
      this.rate = 1 + o.clockDrift;
    } else if (error < -2) {
      this.rate = 1 - o.clockDrift;
    } else {
      this.rate = 1;
    }
  }
}
