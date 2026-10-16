import type { SideInput } from './protocol';

/** Ticks to carry a person's last controls forward when none arrive (config.online.holdInputTicks). */
const DEFAULT_HOLD_TICKS = 30;

/** Controls further ahead than this (ticks) are dropped: no screen runs that far ahead. */
const MAX_AHEAD_TICKS = 240;

/**
 * The server's queue of one person's controls, by tick. Each tick takes that tick's controls.
 * If they haven't arrived, the person's latest controls carry on (moving, aiming, holding the
 * button) without repeating one-tick presses. Controls that arrive too late for their own tick
 * still count as the latest, and their presses still happen a tick late, so a lagging player
 * still moves and a check or a spell is never lost. Only when nothing at all arrives for
 * `holdTicks` (a hidden tab) does the witch stand still.
 */
export class InputQueue {
  private readonly byTick = new Map<number, SideInput>();
  /** The newest controls to carry forward: the last ones used, or newer ones that came late. */
  private latest: SideInput | null = null;
  private late: Omit<SideInput, 't' | 'move' | 'aim' | 'primary'> = {};
  /** How many ticks early the latest controls arrived (negative: late). */
  slack: number | null = null;
  /** Ticks in a row with nothing arriving. */
  private missing = 0;
  /** Whether the last `take` had that tick's own controls (false: carried forward or none). */
  onTime = false;

  constructor(private readonly holdTicks = DEFAULT_HOLD_TICKS) {}

  /** Controls arriving while the server is at tick `now` (the last tick it stepped). */
  push(input: SideInput, now: number): void {
    this.slack = input.t - now;
    this.missing = 0;
    if (input.t <= now) {
      if (input.check) this.late.check = true;
      if (input.cast) this.late.cast = input.cast;
      if (input.switchPlayer) this.late.switchPlayer = true;
      if (input.skipReplay) this.late.skipReplay = true;
      if (!this.latest || input.t > this.latest.t) this.latest = input;
      return;
    }
    if (input.t - now > MAX_AHEAD_TICKS) return;
    this.byTick.set(input.t, input);
  }

  /** The controls for `tick`, or null if this person has never sent any. */
  take(tick: number): SideInput | null {
    const got = this.byTick.get(tick);
    for (const t of this.byTick.keys()) if (t <= tick) this.byTick.delete(t);
    let input: SideInput | null = got ? { ...got } : null;
    this.onTime = got !== undefined;
    if (!got) this.missing++;
    const from = this.latest;
    if (!input && from) {
      const holding = this.missing <= this.holdTicks;
      input = { t: tick, move: holding ? from.move : { x: 0, y: 0 }, aim: from.aim };
      if (from.primary && holding) input.primary = true;
    }
    if (!input) {
      this.late = {};
      return null;
    }
    if (this.late.check) input.check = true;
    if (this.late.cast && !input.cast) input.cast = this.late.cast;
    if (this.late.switchPlayer) input.switchPlayer = true;
    if (this.late.skipReplay) input.skipReplay = true;
    this.late = {};
    if (got) this.latest = got;
    return input;
  }

  /** Forget everything (the person left or came back). */
  clear(): void {
    this.byTick.clear();
    this.latest = null;
    this.late = {};
    this.slack = null;
    this.missing = 0;
  }
}
