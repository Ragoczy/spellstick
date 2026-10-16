/**
 * The network sim (M12): `npm run sim -- --net`. Plays whole online matches between two
 * simulated screens and the real server room, over simulated connections with lag, jitter,
 * lost packets, and Wi-Fi stalls, all in simulated time (no sockets, no waiting). Each screen
 * runs the game's own `NetScreen` (clock, prediction, smoothing) with the AI at the controls,
 * so it measures exactly what a player's screen does: how often and how far it gets
 * corrected, how far from the server's truth it draws things, and how many controls reach
 * the server too late. Seeded: the same seed and settings give the same numbers.
 */
import { deflateRawSync } from 'node:zlib';
import { createTeamControllers, type Controller } from '../src/ai';
import { DEFAULT_AWAY, DEFAULT_HOME, TEAMS } from '../src/content/teams';
import {
  NetScreen,
  positionsOf,
  Room,
  Tally,
  type MatchSummary,
  type Positions,
  type ServerMessage,
  type SideInput,
} from '../src/net';
import {
  chance,
  createRng,
  drawLoadout,
  loadoutRng,
  nextFloat,
  type RngState,
  type SimConfig,
  type TeamIndex,
} from '../src/sim';

/** One person's connection to the server (eastus2). Each direction gets these numbers. */
export interface LinkProfile {
  /** Round trip with no jitter (ms). */
  rttMs: number;
  /** Extra one-way delay, exponentially distributed with this mean (ms). */
  jitterMs: number;
  /** Packets lost (%). WebSockets run on TCP, so a loss arrives late, not never. */
  lossPct: number;
  /** Wi-Fi stalls: about this often (s, 0 for none) the link holds everything for `stallMs`. */
  stallEverySeconds: number;
  stallMs: number;
}

/** Typical connections to an East US server. Numbers are round figures, not measurements. */
export const LINK_PROFILES = {
  /** Same region on a wired connection. */
  east: { rttMs: 20, jitterMs: 2, lossPct: 0, stallEverySeconds: 0, stallMs: 0 },
  /** The US west coast. */
  west: { rttMs: 70, jitterMs: 4, lossPct: 0.1, stallEverySeconds: 0, stallMs: 0 },
  /** Western Europe. */
  europe: { rttMs: 95, jitterMs: 6, lossPct: 0.2, stallEverySeconds: 0, stallMs: 0 },
  /** Australia or East Asia. */
  pacific: { rttMs: 210, jitterMs: 12, lossPct: 0.5, stallEverySeconds: 0, stallMs: 0 },
  /** Same region over busy Wi-Fi: spiky delays and the odd stall. */
  wifi: { rttMs: 35, jitterMs: 15, lossPct: 1, stallEverySeconds: 10, stallMs: 150 },
} satisfies Record<string, LinkProfile>;

export type LinkName = keyof typeof LINK_PROFILES;
export const LINK_NAMES = Object.keys(LINK_PROFILES) as LinkName[];

/** The pairings `--net` plays by default: home's connection, away's. */
export const DEFAULT_PAIRINGS: [LinkName, LinkName][] = [
  ['east', 'east'],
  ['east', 'west'],
  ['east', 'europe'],
  ['west', 'europe'],
  ['east', 'pacific'],
  ['wifi', 'east'],
];

/** How long a lost packet takes to be resent, on top of a round trip (ms). */
const RESEND_EXTRA_MS = 120;
/** Screens draw at about 60 frames a second, give or take this much (ms). */
const FRAME_MS = 1000 / 60;
const FRAME_JITTER_MS = 1;
/** The server's step loop wakes this often (ms), like `setInterval(..., 4)` in server/online.ts. */
const SERVER_WAKE_MS = 4;
/** The server pings each connection this often (ms), like server/online.ts. */
const PING_EVERY_MS = 2000;
/** Every this many snapshots, one is compressed to estimate what goes over the wire. */
const COMPRESS_SAMPLE_EVERY = 30;
/** Moves smaller than this (m) aren't counted as corrections (as in the readout). */
const MIN_CORRECTION_M = 0.005;

/** One direction of a connection: in order, delayed, sometimes resent, sometimes stalled. */
class Pipe {
  private last = 0;
  private stallUntil = 0;
  private nextStall: number;

  constructor(
    private readonly link: LinkProfile,
    private readonly rng: RngState,
  ) {
    this.nextStall = this.untilStall();
  }

  /** When something sent at `at` (ms) arrives. */
  arrival(at: number): number {
    const l = this.link;
    while (l.stallEverySeconds > 0 && at >= this.nextStall) {
      this.stallUntil = this.nextStall + l.stallMs;
      this.nextStall += this.untilStall();
    }
    let t = Math.max(at, this.stallUntil) + l.rttMs / 2 + this.exp(l.jitterMs);
    if (l.lossPct > 0 && chance(this.rng, l.lossPct / 100)) t += l.rttMs + RESEND_EXTRA_MS;
    // TCP delivers in order: nothing overtakes what was sent before it.
    t = Math.max(t, this.last);
    this.last = t;
    return t;
  }

  private untilStall(): number {
    return this.link.stallEverySeconds > 0 ? this.exp(this.link.stallEverySeconds * 1000) : Infinity;
  }

  private exp(mean: number): number {
    return mean <= 0 ? 0 : -mean * Math.log(1 - nextFloat(this.rng));
  }
}

/** Things due at a time (ms), run in time order (ties in the order they were added). */
class Timeline {
  private heap: { at: number; seq: number; run: () => void }[] = [];
  private seq = 0;
  now = 0;

  at(time: number, run: () => void): void {
    const h = this.heap;
    h.push({ at: time, seq: this.seq++, run });
    let i = h.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!this.before(h[i]!, h[parent]!)) break;
      [h[i], h[parent]] = [h[parent]!, h[i]!];
      i = parent;
    }
  }

  /** Runs the next thing due; false when nothing is left. */
  next(): boolean {
    const h = this.heap;
    if (h.length === 0) return false;
    const top = h[0]!;
    const last = h.pop()!;
    if (h.length > 0) {
      h[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < h.length && this.before(h[l]!, h[m]!)) m = l;
        if (r < h.length && this.before(h[r]!, h[m]!)) m = r;
        if (m === i) break;
        [h[i], h[m]] = [h[m]!, h[i]!];
        i = m;
      }
    }
    this.now = top.at;
    top.run();
    return true;
  }

  private before(a: { at: number; seq: number }, b: { at: number; seq: number }): boolean {
    return a.at < b.at || (a.at === b.at && a.seq < b.seq);
  }
}

/** One seat's numbers for one match. Distances in cm, rates per minute of match. */
export interface SeatNetResult {
  link: LinkName;
  /** From the server's own match summary (the M12 log line). */
  late: number;
  held: number;
  earlyP50: number | null;
  earlyP05: number | null;
  /** Corrections to your own witch a minute, and their size. */
  mineFixesPerMin: number;
  mineFixAvgCm: number;
  mineFixP95Cm: number;
  /** The largest correction to anyone else, per correction. */
  othersFixP95Cm: number;
  /** Jumps too big to smooth, a minute. */
  snapsPerMin: number;
  /** How far from the server's truth your witch is drawn (smoothing included), and everyone else. */
  mineDrawnAvgCm: number;
  mineDrawnP95Cm: number;
  othersDrawnP95Cm: number;
  /** How many ticks the screen runs ahead of the latest server state it has. */
  aheadTicks: number;
  /** How many ticks early the screen's clock aims for controls to arrive (its lead plus cushion). */
  targetTicks: number;
}

export interface NetMatchResult {
  seed: number;
  minutes: number;
  snapshotKBps: number;
  /** Compressed size over raw size for a sample of snapshots, each compressed on its own (an upper bound: the server's compression also reuses earlier messages). */
  compressRatio: number;
  seats: [SeatNetResult, SeatNetResult];
}

interface SimScreen {
  side: TeamIndex;
  link: LinkName;
  screen: NetScreen;
  up: Pipe;
  down: Pipe;
  controllers: Controller[] | null;
  lastFrame: number;
  /** What this screen drew for each tick (the latest frame on that tick), to check against the server. */
  drawn: Map<number, { mine: number | null; at: Positions }>;
  mineFix: Tally;
  othersFix: Tally;
  mineFixes: number;
  snaps: number;
  ahead: Tally;
  target: Tally;
}

/**
 * Plays one online match over `links` (home's, away's) and returns both seats' numbers.
 * `config` is the game's config, with any `online` settings being tried.
 */
export function runNetMatch(config: SimConfig, seed: number, links: [LinkName, LinkName]): NetMatchResult {
  const time = new Timeline();
  const rng = createRng(seed * 7919 + 13);
  let summary: MatchSummary | null = null;
  /** The server's positions after each tick. */
  const truth = new Map<number, Positions>();
  let snapCount = 0;
  let rawBytes = 0;
  let packedBytes = 0;

  const screens: SimScreen[] = ([0, 1] as const).map((side) => {
    const s: SimScreen = {
      side,
      link: links[side],
      screen: null!,
      up: new Pipe(LINK_PROFILES[links[side]], createRng(seed * 31 + side * 2 + 1)),
      down: new Pipe(LINK_PROFILES[links[side]], createRng(seed * 31 + side * 2 + 2)),
      controllers: null,
      lastFrame: 0,
      drawn: new Map(),
      mineFix: new Tally(0.5),
      othersFix: new Tally(0.5),
      mineFixes: 0,
      snaps: 0,
      ahead: new Tally(1),
      target: new Tally(1),
    };
    s.screen = new NetScreen(config, side, (t, w): SideInput => {
      if (!w || !s.controllers) return { t, move: { x: 0, y: 0 }, aim: { x: 0, y: 0 } };
      const id = w.control[side];
      const cmd = s.controllers[id]!.decide(w.match, id);
      const input: SideInput = { t, move: cmd.move, aim: cmd.aim };
      if (cmd.primary) input.primary = true;
      if (cmd.check) input.check = true;
      if (cmd.cast) input.cast = cmd.cast;
      return input;
    });
    s.screen.onCorrection = (fix) => {
      let others = 0;
      let snapped = false;
      fix.after.players.forEach((a, i) => {
        const b = fix.before.players[i];
        if (!b) return;
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d > config.online.snapMeters) snapped = true;
        else if (i === fix.mine) {
          if (d >= MIN_CORRECTION_M) {
            s.mineFixes++;
            s.mineFix.add(d * 100);
          }
        } else if (d > others) others = d;
      });
      if (snapped) s.snaps++;
      if (others >= MIN_CORRECTION_M) s.othersFix.add(others * 100);
    };
    return s;
  });

  const room = new Room(
    'net-sim',
    config,
    {
      send(conn, data) {
        // Only match states matter here; the lobby is skipped through directly below.
        if (!data.startsWith('{"type":"snap"')) return;
        if (conn === 0 && snapCount++ % COMPRESS_SAMPLE_EVERY === 0) {
          rawBytes += data.length;
          packedBytes += deflateRawSync(data).length;
        }
        const s = screens[conn]!;
        time.at(s.down.arrival(time.now), () => {
          const msg = JSON.parse(data) as Extract<ServerMessage, { type: 'snap' }>;
          s.screen.receive(msg.snap, msg.slack);
          if (!s.controllers) {
            const levels = [config.online.aiLevel, config.online.aiLevel] as const;
            s.controllers = createTeamControllers(
              msg.snap.world.match,
              config,
              seed * 17 + s.side + 1,
              [...levels],
              [TEAMS[DEFAULT_HOME].style, TEAMS[DEFAULT_AWAY].style],
            );
          }
        });
      },
      close() {},
      matchOver(s) {
        summary = s;
      },
    },
    () => seed,
  );

  for (const s of screens) {
    const conn = s.side;
    room.join(conn, { id: `p${conn}`, name: `Player ${conn + 1}`, avatarUrl: '' });
    room.message(conn, { type: 'seat', seat: s.side });
    room.message(conn, { type: 'spells', spells: drawLoadout(loadoutRng(seed, s.side)) });
    room.message(conn, { type: 'ready', ready: true });
  }

  // The server: wakes every few ms and runs the ticks it owes (server/online.ts).
  const stepMs = 1000 / config.tickHz;
  let owed = 0;
  let lastWake = 0;
  const wake = () => {
    owed += time.now - lastWake;
    lastWake = time.now;
    let steps = 0;
    while (owed >= stepMs && steps < config.maxStepsPerFrame) {
      room.tick();
      const w = room.world;
      if (w) truth.set(w.tick, positionsOf(w));
      owed -= stepMs;
      steps++;
    }
    if (summary === null) time.at(time.now + SERVER_WAKE_MS + nextFloat(rng), wake);
  };
  time.at(SERVER_WAKE_MS, wake);

  // Pings: server to screen and back, on the same connection as everything else.
  const ping = () => {
    for (const s of screens) {
      const sent = time.now;
      const there = s.down.arrival(sent);
      time.at(s.up.arrival(there), () => room.roundTrip(s.side, time.now - sent));
    }
    if (summary === null) time.at(time.now + PING_EVERY_MS, ping);
  };
  time.at(PING_EVERY_MS, ping);

  // Each screen's frames.
  for (const s of screens) {
    const frame = () => {
      const dt = (time.now - s.lastFrame) / 1000;
      s.lastFrame = time.now;
      const { send } = s.screen.frame(dt, time.now);
      if (send.length > 0) {
        const body = JSON.parse(JSON.stringify(send)) as SideInput[];
        time.at(s.up.arrival(time.now), () => room.message(s.side, { type: 'input', inputs: body }));
      }
      const w = s.screen.predictor.world;
      const server = s.screen.predictor.server;
      if (w && server && s.screen.clock.tick !== null) {
        s.ahead.add(w.tick - server.tick);
        s.target.add(s.screen.clock.target);
        const sm = s.screen.smoother;
        const ball = w.match.ball;
        const ballOff = ball.carrier !== null ? sm.player(ball.carrier) : sm.ball;
        s.drawn.set(w.tick, {
          mine: s.screen.controlled,
          at: {
            players: w.match.players.map((p, i) => ({
              x: p.pos.x + sm.player(i).x,
              y: p.pos.y + sm.player(i).y,
            })),
            ball: { x: ball.pos.x + ballOff.x, y: ball.pos.y + ballOff.y },
          },
        });
      }
      if (summary === null) time.at(time.now + FRAME_MS + (nextFloat(rng) * 2 - 1) * FRAME_JITTER_MS, frame);
    };
    time.at(FRAME_MS * (1 + s.side * 0.37), frame);
  }

  // Hard stop: an hour of simulated time.
  while (summary === null && time.now < 3_600_000 && time.next()) {
    /* run */
  }
  if (summary === null) throw new Error(`net sim: match ${seed} didn't finish`);
  const done = summary as MatchSummary;
  const minutes = Math.max(done.minutes, 0.1);

  const seats = screens.map((s): SeatNetResult => {
    const mineDrawn = new Tally(0.5);
    const othersDrawn = new Tally(0.5);
    for (const [tick, d] of s.drawn) {
      const real = truth.get(tick);
      if (!real) continue;
      let others = 0;
      d.at.players.forEach((p, i) => {
        const r = real.players[i];
        if (!r) return;
        const cm = Math.hypot(p.x - r.x, p.y - r.y) * 100;
        if (i === d.mine) mineDrawn.add(cm);
        else if (cm > others) others = cm;
      });
      othersDrawn.add(others);
    }
    const seat = done.seats[s.side];
    const r1 = (v: number | null) => Math.round((v ?? 0) * 10) / 10;
    return {
      link: s.link,
      late: seat.late,
      held: seat.held,
      earlyP50: seat.earlyTicks.p50,
      earlyP05: seat.earlyTicks.p05,
      mineFixesPerMin: r1(s.mineFixes / minutes),
      mineFixAvgCm: r1(s.mineFix.mean),
      mineFixP95Cm: r1(s.mineFix.quantile(0.95)),
      othersFixP95Cm: r1(s.othersFix.quantile(0.95)),
      snapsPerMin: r1(s.snaps / minutes),
      mineDrawnAvgCm: r1(mineDrawn.mean),
      mineDrawnP95Cm: r1(mineDrawn.quantile(0.95)),
      othersDrawnP95Cm: r1(othersDrawn.quantile(0.95)),
      aheadTicks: r1(s.ahead.mean),
      targetTicks: r1(s.target.mean),
    };
  });
  return {
    seed,
    minutes: done.minutes,
    snapshotKBps: done.snapshotKBps,
    compressRatio: rawBytes === 0 ? 1 : packedBytes / rawBytes,
    seats: [seats[0]!, seats[1]!],
  };
}

/** One row of the report: a pairing's seats, averaged over its matches. */
export interface NetPairingRow {
  links: [LinkName, LinkName];
  games: number;
  snapshotKBps: number;
  compressRatio: number;
  seats: [SeatNetResult, SeatNetResult];
}

const SEAT_NUMBERS = [
  'late',
  'held',
  'earlyP50',
  'earlyP05',
  'mineFixesPerMin',
  'mineFixAvgCm',
  'mineFixP95Cm',
  'othersFixP95Cm',
  'snapsPerMin',
  'mineDrawnAvgCm',
  'mineDrawnP95Cm',
  'othersDrawnP95Cm',
  'aheadTicks',
  'targetTicks',
] as const;

/** Averages a pairing's matches. */
export function averagePairing(links: [LinkName, LinkName], results: NetMatchResult[]): NetPairingRow {
  const n = Math.max(1, results.length);
  const mean = (f: (r: NetMatchResult) => number) => results.reduce((a, r) => a + f(r), 0) / n;
  const seat = (i: 0 | 1): SeatNetResult => {
    const out = { link: links[i] } as SeatNetResult;
    for (const k of SEAT_NUMBERS) {
      const v = mean((r) => r.seats[i][k] ?? 0);
      (out as unknown as Record<string, number>)[k] = Math.round(v * 1000) / 1000;
    }
    return out;
  };
  return {
    links,
    games: results.length,
    snapshotKBps: Math.round(mean((r) => r.snapshotKBps) * 10) / 10,
    compressRatio: mean((r) => r.compressRatio),
    seats: [seat(0), seat(1)],
  };
}

/** The report printed by `npm run sim -- --net`. */
export function formatNetReport(
  rows: NetPairingRow[],
  info: { games: number; baseSeed: number; elapsedMs: number; settings: string },
): string {
  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
  const num = (v: number | null, places = 1) => (v ?? 0).toFixed(places);
  const lines = [
    `Spellstick network sim — ${info.games} match${info.games === 1 ? '' : 'es'} per pairing, seeds ${info.baseSeed}+, ${(info.elapsedMs / 1000).toFixed(1)} s`,
    `Settings: ${info.settings}`,
    '',
    'Links (to the East US server): ' +
      LINK_NAMES.map((n) => {
        const l = LINK_PROFILES[n];
        return `${n} ${l.rttMs} ms${l.jitterMs ? ` ±${l.jitterMs}` : ''}${l.lossPct ? ` ${l.lossPct}% loss` : ''}${l.stallEverySeconds ? ` stall ${l.stallMs} ms/${l.stallEverySeconds} s` : ''}`;
      }).join(', '),
    '',
    'Per seat. Late: controls that reached the server after their tick. Held: ticks played on carried-forward',
    'controls. Fixes: corrections to your own witch a minute, their average and 95th percentile (cm); others: the',
    'largest correction to anyone else (95th pct). Drawn: how far from the server it draws your witch (avg, p95) and',
    'anyone else (p95), smoothing included. Ahead: ticks the screen predicts past the latest server state. Aim: how',
    'early the clock aims for controls to arrive (lead plus cushion), averaged.',
    '',
    'pairing         seat     late   held  early p50/p05  fixes/min  fix avg/p95  others p95  snaps/min  drawn avg/p95  others p95  ahead   aim',
  ];
  for (const r of rows) {
    r.seats.forEach((s, i) => {
      lines.push(
        [
          (i === 0 ? `${r.links[0]} v ${r.links[1]}` : '').padEnd(15),
          `${i === 0 ? 'home' : 'away'} ${s.link}`.padEnd(13),
          pct(s.late).padStart(6),
          pct(s.held).padStart(6),
          `${num(s.earlyP50)}/${num(s.earlyP05)}`.padStart(14),
          num(s.mineFixesPerMin).padStart(10),
          `${num(s.mineFixAvgCm)}/${num(s.mineFixP95Cm)}`.padStart(12),
          num(s.othersFixP95Cm).padStart(11),
          num(s.snapsPerMin, 2).padStart(10),
          `${num(s.mineDrawnAvgCm)}/${num(s.mineDrawnP95Cm)}`.padStart(14),
          num(s.othersDrawnP95Cm).padStart(11),
          num(s.aheadTicks).padStart(6),
          num(s.targetTicks).padStart(5),
        ].join(' '),
      );
    });
  }
  const kbps = rows.reduce((a, r) => a + r.snapshotKBps, 0) / Math.max(1, rows.length);
  const ratio = rows.reduce((a, r) => a + r.compressRatio, 0) / Math.max(1, rows.length);
  lines.push(
    '',
    `Snapshots: ${kbps.toFixed(1)} KB/s per screen before compression, at most about ${(kbps * ratio).toFixed(1)} KB/s compressed (${(ratio * 100).toFixed(0)}% of raw, each compressed on its own).`,
  );
  return lines.join('\n');
}
