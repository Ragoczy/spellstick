import type { Seat } from './protocol';

/**
 * Online feel (M12): how a live match went over the network, gathered while it runs and
 * logged by the server as one line at the end. Anonymous: no names, ids, or room codes.
 */

/**
 * Counts values rounded to `step`, for percentiles without keeping every sample (a match is
 * about 40,000 ticks).
 */
export class Tally {
  private readonly counts = new Map<number, number>();
  count = 0;
  private sum = 0;
  max = -Infinity;
  min = Infinity;

  constructor(private readonly step = 1) {}

  add(value: number): void {
    const key = Math.round(value / this.step);
    this.counts.set(key, (this.counts.get(key) ?? 0) + 1);
    this.count++;
    this.sum += value;
    if (value > this.max) this.max = value;
    if (value < this.min) this.min = value;
  }

  get mean(): number | null {
    return this.count === 0 ? null : this.sum / this.count;
  }

  /** The value `q` (0–1) of the way up, to `step`; null with no samples. */
  quantile(q: number): number | null {
    if (this.count === 0) return null;
    const keys = [...this.counts.keys()].sort((a, b) => a - b);
    const want = Math.max(1, Math.ceil(q * this.count));
    let seen = 0;
    for (const k of keys) {
      seen += this.counts.get(k)!;
      if (seen >= want) return k * this.step;
    }
    return keys.at(-1)! * this.step;
  }
}

/** One seat's network numbers for a match. */
export class SeatNet {
  /** How many ticks early each batch of controls arrived (negative: late). */
  readonly early = new Tally(1);
  /** Controls that arrived at or after the tick they were for. */
  lateInputs = 0;
  /** Round trips to this player's screen (ms). */
  readonly rttMs = new Tally(1);
  /** Ticks the match stepped with this player connected. */
  connectedTicks = 0;
  /** Of those, ticks their controls weren't there in time (the last ones were carried forward). */
  heldTicks = 0;
  drops = 0;
  rejoins = 0;
}

/** A whole match's network numbers. The room fills in the ticks; the server adds wall-clock timings. */
export class MatchNet {
  readonly seats: [SeatNet, SeatNet] = [new SeatNet(), new SeatNet()];
  ticks = 0;
  /** Snapshot bytes sent (before WebSocket compression), and connection-ticks, for bytes per screen per second. */
  snapshotBytes = 0;
  connectionTicks = 0;
  watchersMax = 0;
  /** Server: wall-clock cost of one room tick (ms). */
  readonly stepMs = new Tally(0.01);
  /** Server: times the step loop fell so far behind it dropped the backlog. */
  stalls = 0;

  seat(s: Seat): SeatNet {
    return this.seats[s];
  }
}

export type MatchEnd = 'final' | 'abandoned';

export interface SeatSummary {
  /** Share of the match this seat's player was connected (0–1). */
  connected: number;
  drops: number;
  rejoins: number;
  rttMs: { p50: number | null; p95: number | null; max: number | null };
  /** Ticks early that controls arrived: the middle, and the worst 5% (negative: late). */
  earlyTicks: { p50: number | null; p05: number | null };
  /** Share of controls that arrived too late for their tick. */
  late: number;
  /** Share of connected ticks played on carried-forward controls. */
  held: number;
}

export interface MatchSummary {
  /** Where the room is: a browser room link or a Discord Activity. */
  room: 'browser' | 'discord';
  match: number;
  end: MatchEnd;
  minutes: number;
  ticks: number;
  seats: [SeatSummary, SeatSummary];
  watchersMax: number;
  /** Snapshot data per connected screen (KB/s, before compression). */
  snapshotKBps: number;
  stepMs: { mean: number | null; p99: number | null; max: number | null };
  stalls: number;
}

const round = (v: number | null, places = 2): number | null =>
  v === null || !Number.isFinite(v) ? null : Math.round(v * 10 ** places) / 10 ** places;
const share = (part: number, whole: number) => (whole === 0 ? 0 : (round(part / whole, 3) ?? 0));

function seatSummary(s: SeatNet, ticks: number): SeatSummary {
  return {
    connected: share(s.connectedTicks, ticks),
    drops: s.drops,
    rejoins: s.rejoins,
    rttMs: {
      p50: round(s.rttMs.quantile(0.5), 0),
      p95: round(s.rttMs.quantile(0.95), 0),
      max: s.rttMs.count === 0 ? null : round(s.rttMs.max, 0),
    },
    earlyTicks: { p50: s.early.quantile(0.5), p05: s.early.quantile(0.05) },
    late: share(s.lateInputs, s.early.count),
    held: share(s.heldTicks, s.connectedTicks),
  };
}

export function summarize(
  net: MatchNet,
  info: { room: MatchSummary['room']; match: number; end: MatchEnd; tickHz: number },
): MatchSummary {
  const seconds = net.ticks / info.tickHz;
  const connSeconds = net.connectionTicks / info.tickHz;
  return {
    room: info.room,
    match: info.match,
    end: info.end,
    minutes: round(seconds / 60, 1) ?? 0,
    ticks: net.ticks,
    seats: [seatSummary(net.seats[0], net.ticks), seatSummary(net.seats[1], net.ticks)],
    watchersMax: net.watchersMax,
    snapshotKBps: round(connSeconds === 0 ? 0 : net.snapshotBytes / 1024 / connSeconds, 1) ?? 0,
    stepMs: {
      mean: round(net.stepMs.mean, 3),
      p99: round(net.stepMs.quantile(0.99), 3),
      max: net.stepMs.count === 0 ? null : round(net.stepMs.max, 3),
    },
    stalls: net.stalls,
  };
}
