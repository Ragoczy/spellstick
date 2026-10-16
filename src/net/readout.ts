import type { Positions } from './predictor';

/**
 * The network readout (M12): how much a screen's prediction gets corrected. Times are passed
 * in (ms), so this stays free of the wall clock like the rest of src/net.
 */

/** Smaller moves than this (m) aren't counted as corrections. */
const MIN_METERS = 0.005;

interface Fix {
  at: number;
  /** How far your own witch moved (m), or null when watching. */
  mine: number | null;
  /** The furthest anyone else moved (m). */
  others: number;
}

export interface CorrectionSummary {
  /** Corrections a second over the window. */
  perSecond: number;
  /** Your own witch: the average and largest correction (cm), null when watching or none. */
  mineAvgCm: number | null;
  mineMaxCm: number | null;
  /** Everyone else: the largest correction (cm), null when none. */
  othersMaxCm: number | null;
  /** Jumps too big to smooth (a restart after a goal, a big misprediction), drawn as a snap. */
  snaps: number;
}

export class CorrectionLog {
  private fixes: Fix[] = [];
  private snapTimes: number[] = [];

  constructor(
    /** Corrections bigger than this (m) snap instead of easing (config.online.snapMeters). */
    private readonly snapMeters: number,
    /** How far back the summary looks (ms). */
    private readonly windowMs = 5000,
  ) {}

  /** A newer server state moved things from `before` to `after`; `mine` is your witch's id (null: watching). */
  add(at: number, before: Positions, after: Positions, mine: number | null): void {
    let mineDist: number | null = null;
    let others = 0;
    let snapped = false;
    after.players.forEach((a, i) => {
      const b = before.players[i];
      if (!b) return;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d > this.snapMeters) {
        snapped = true;
        return;
      }
      if (i === mine) mineDist = d;
      else if (d > others) others = d;
    });
    if (snapped) this.snapTimes.push(at);
    if ((mineDist ?? 0) < MIN_METERS && others < MIN_METERS) return;
    this.fixes.push({ at, mine: mineDist, others });
  }

  summary(now: number): CorrectionSummary {
    const from = now - this.windowMs;
    this.fixes = this.fixes.filter((f) => f.at > from);
    this.snapTimes = this.snapTimes.filter((t) => t > from);
    const mine = this.fixes.flatMap((f) => (f.mine !== null && f.mine >= MIN_METERS ? [f.mine] : []));
    const others = this.fixes.map((f) => f.others).filter((d) => d >= MIN_METERS);
    const cm = (m: number) => Math.round(m * 100);
    return {
      perSecond: Math.round((this.fixes.length / (this.windowMs / 1000)) * 10) / 10,
      mineAvgCm: mine.length === 0 ? null : cm(mine.reduce((a, b) => a + b, 0) / mine.length),
      mineMaxCm: mine.length === 0 ? null : cm(Math.max(...mine)),
      othersMaxCm: others.length === 0 ? null : cm(Math.max(...others)),
      snaps: this.snapTimes.length,
    };
  }

  clear(): void {
    this.fixes = [];
    this.snapTimes = [];
  }
}
