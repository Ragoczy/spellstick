import type { SideInput } from './protocol';

/** Controls further ahead than this (ticks) are dropped: no screen runs that far ahead. */
const MAX_AHEAD_TICKS = 240;

/**
 * The server's queue of one person's controls, by tick. Each tick takes that tick's controls.
 * If they haven't arrived, the last held controls carry on (moving, aiming, holding the button)
 * without repeating one-tick presses. Presses that arrive too late still happen, a tick late,
 * so a check or a spell is never lost to lag.
 */
export class InputQueue {
  private readonly byTick = new Map<number, SideInput>();
  private last: SideInput | null = null;
  private late: Omit<SideInput, 't' | 'move' | 'aim' | 'primary'> = {};
  /** How many ticks early the latest controls arrived (negative: late). */
  slack: number | null = null;

  /** Controls arriving while the server is at tick `now` (the last tick it stepped). */
  push(input: SideInput, now: number): void {
    this.slack = input.t - now;
    if (input.t <= now) {
      if (input.check) this.late.check = true;
      if (input.cast) this.late.cast = input.cast;
      if (input.switchPlayer) this.late.switchPlayer = true;
      if (input.skipReplay) this.late.skipReplay = true;
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
    if (!input && this.last) {
      input = { t: tick, move: this.last.move, aim: this.last.aim };
      if (this.last.primary) input.primary = true;
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
    this.last = input;
    return input;
  }

  /** Forget everything (the person left or came back). */
  clear(): void {
    this.byTick.clear();
    this.last = null;
    this.late = {};
    this.slack = null;
  }
}
