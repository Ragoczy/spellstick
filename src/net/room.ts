import { createTeamControllers, type Controller } from '../ai';
import { DEFAULT_AWAY, DEFAULT_HOME, TEAMS } from '../content/teams';
import { secondsToTicks, type InputCommand, type SimConfig, type SimEvent } from '../sim';
import { InputQueue } from './inputQueue';
import type {
  ByeReason,
  ClientMessage,
  MemberView,
  ResultView,
  RoomView,
  Seat,
  ServerMessage,
} from './protocol';
import { createWorld, stepWorld, type OnlineWorld } from './world';

/** A signed-in person (from their session). */
export interface RoomUser {
  id: string;
  name: string;
  avatarUrl: string;
}

/** How a room reaches its connections. The server plugs WebSockets in; tests plug in arrays. */
export interface RoomPort {
  send(conn: number, data: string): void;
  close(conn: number, reason: ByeReason): void;
}

interface Member {
  user: RoomUser;
  /** The connection this person is on, or null (dropped mid-match, seat kept). */
  conn: number | null;
  ready: boolean;
  /** Arrival order, for listing. */
  order: number;
}

interface LiveMatch {
  world: OnlineWorld;
  controllers: Controller[];
  queues: [InputQueue, InputQueue];
  /** Events since the last snapshot. */
  events: SimEvent[];
  /** Every witch's command on the last tick that stepped the match. */
  inputs: InputCommand[];
  ticksSinceSnapshot: number;
}

const SEATS = [0, 1] as const;
const json = (msg: ServerMessage) => JSON.stringify(msg);

/**
 * One online room (SPEC §11): the people in it, the two seats, the lobby, and the match. Pure
 * logic: the server calls `join`, `leave`, `message`, and `tick` (60 times a second), and
 * the room answers through its port. Runs the match with the same sim and AI as single-player.
 */
export class Room {
  private readonly members = new Map<string, Member>();
  private readonly byConn = new Map<number, string>();
  private readonly seats: [string | null, string | null] = [null, null];
  private phase: RoomView['phase'] = 'lobby';
  private countdownTicks = 0;
  private match: LiveMatch | null = null;
  private matchNumber = 0;
  private lastResult: ResultView | null = null;
  private order = 0;
  private dirty = false;
  /** Ticks in a row with nobody connected (the server closes the room after a while). */
  idleTicks = 0;

  constructor(
    readonly code: string,
    private readonly config: SimConfig,
    private readonly port: RoomPort,
    private readonly newSeed: () => number,
  ) {}

  /** Connections open to this room. */
  get connected(): number {
    return this.byConn.size;
  }

  /** The live match's world (tests and logs). */
  get world(): Readonly<OnlineWorld> | null {
    return this.match?.world ?? null;
  }

  /** Someone connects. The same person connecting again replaces their old connection (and gets their seat back). */
  join(conn: number, user: RoomUser): void {
    const existing = this.members.get(user.id);
    if (existing && existing.conn !== null) {
      this.byConn.delete(existing.conn);
      this.port.close(existing.conn, 'replaced');
    }
    const member = existing ?? { user, conn: null, ready: false, order: this.order++ };
    member.user = user;
    member.conn = conn;
    this.members.set(user.id, member);
    this.byConn.set(conn, user.id);
    this.port.send(conn, json({ type: 'welcome', you: { id: user.id, name: user.name }, room: this.code }));
    const seat = this.seatOf(user.id);
    if (this.match && seat !== null) {
      this.match.queues[seat].clear();
      this.match.world.humans[seat] = true;
    }
    this.dirty = true;
    this.sendRoom(conn);
    if (this.match) this.sendSnapshot([conn], false);
  }

  /** A connection closed. Mid-match a seated player keeps their seat (the AI plays it) so they can come back. */
  leave(conn: number): void {
    const id = this.byConn.get(conn);
    if (id === undefined) return;
    this.byConn.delete(conn);
    const member = this.members.get(id);
    if (!member || member.conn !== conn) return;
    member.conn = null;
    member.ready = false;
    const seat = this.seatOf(id);
    if (this.match && seat !== null) {
      this.match.world.humans[seat] = false;
      this.match.queues[seat].clear();
    } else {
      this.members.delete(id);
      if (seat !== null) this.seats[seat] = null;
    }
    this.dirty = true;
  }

  message(conn: number, msg: ClientMessage): void {
    const id = this.byConn.get(conn);
    if (id === undefined) return;
    const member = this.members.get(id)!;
    switch (msg.type) {
      case 'ping':
        this.port.send(conn, json({ type: 'pong', id: msg.id }));
        return;
      case 'seat': {
        if (this.match) return;
        if (msg.seat !== null && this.seats[msg.seat] !== null && this.seats[msg.seat] !== id) return;
        for (const s of SEATS) if (this.seats[s] === id) this.seats[s] = null;
        if (msg.seat !== null) this.seats[msg.seat] = id;
        member.ready = false;
        this.dirty = true;
        return;
      }
      case 'ready':
        if (this.match || this.seatOf(id) === null) return;
        member.ready = msg.ready;
        this.dirty = true;
        return;
      case 'input': {
        const seat = this.seatOf(id);
        if (!this.match || seat === null) return;
        for (const input of msg.inputs) this.match.queues[seat].push(input, this.match.world.tick);
        return;
      }
    }
  }

  /** One server tick (1/60 s). */
  tick(): void {
    this.idleTicks = this.connected === 0 ? this.idleTicks + 1 : 0;
    if (this.phase === 'lobby' && this.bothReady()) {
      this.phase = 'countdown';
      this.countdownTicks = secondsToTicks(this.config.online.countdownSeconds, this.config);
      this.dirty = true;
    } else if (this.phase === 'countdown') {
      if (!this.bothReady()) {
        this.phase = 'lobby';
        this.dirty = true;
      } else {
        const before = this.countdownSeconds;
        if (--this.countdownTicks <= 0) this.startMatch();
        else if (this.countdownSeconds !== before) this.dirty = true;
      }
    } else if (this.match) {
      this.stepMatch(this.match);
    }
    if (this.dirty) {
      this.dirty = false;
      for (const conn of this.byConn.keys()) this.sendRoom(conn);
    }
  }

  private get countdownSeconds(): number {
    return Math.ceil(this.countdownTicks / this.config.tickHz);
  }

  private bothReady(): boolean {
    return SEATS.every((s) => {
      const id = this.seats[s];
      const m = id === null ? undefined : this.members.get(id);
      return m !== undefined && m.conn !== null && m.ready;
    });
  }

  private seatOf(id: string): Seat | null {
    if (this.seats[0] === id) return 0;
    if (this.seats[1] === id) return 1;
    return null;
  }

  private startMatch(): void {
    const seed = this.newSeed();
    const world = createWorld(this.config, seed, [true, true]);
    const level = this.config.online.aiLevel;
    this.match = {
      world,
      controllers: createTeamControllers(
        world.match,
        this.config,
        seed,
        [level, level],
        [TEAMS[DEFAULT_HOME].style, TEAMS[DEFAULT_AWAY].style],
      ),
      queues: [
        new InputQueue(this.config.online.holdInputTicks),
        new InputQueue(this.config.online.holdInputTicks),
      ],
      events: [...world.match.events],
      inputs: [],
      ticksSinceSnapshot: 0,
    };
    this.phase = 'match';
    this.matchNumber++;
    this.lastResult = null;
    for (const m of this.members.values()) m.ready = false;
    this.dirty = true;
    this.sendSnapshot([...this.byConn.keys()]);
  }

  private stepMatch(live: LiveMatch): void {
    const w = live.world;
    const next = w.tick + 1;
    const sides = SEATS.map((s) => (w.humans[s] ? live.queues[s].take(next) : null));
    const step = stepWorld(w, sides, (id) => live.controllers[id]!.decide(w.match, id), this.config);
    live.events.push(...step.events);
    if (step.inputs.length > 0) live.inputs = step.inputs;
    const over = w.match.phase === 'final';
    if (++live.ticksSinceSnapshot >= this.config.online.snapshotEveryTicks || over) {
      this.sendSnapshot([...this.byConn.keys()]);
    }
    if (over) this.endMatch(w);
  }

  /**
   * Sends the match to these connections. The regular snapshot to `everyone` also starts
   * collecting events and timing reports afresh; one to a newcomer leaves them for the rest.
   */
  private sendSnapshot(conns: number[], everyone = true): void {
    const live = this.match;
    if (!live) return;
    const w = live.world;
    // The last tick's events are in `events` already; don't send them twice.
    const lastTick = w.match.events;
    w.match.events = [];
    const body = JSON.stringify({ world: w, events: everyone ? live.events : [], inputs: live.inputs });
    w.match.events = lastTick;
    if (everyone) {
      live.events = [];
      live.ticksSinceSnapshot = 0;
    }
    for (const conn of conns) {
      const seat = this.seatOf(this.byConn.get(conn) ?? '');
      const slack = seat === null ? null : live.queues[seat].slack;
      this.port.send(conn, `{"type":"snap","slack":${slack === null ? 'null' : slack},"snap":${body}}`);
    }
    // Each report goes out once: a screen must not keep correcting its clock on old news.
    if (everyone) for (const q of live.queues) q.slack = null;
  }

  private endMatch(w: OnlineWorld): void {
    const name = (id: string | null) => (id === null ? null : (this.members.get(id)?.user.name ?? null));
    this.lastResult = {
      score: [w.match.score[0], w.match.score[1]],
      overtime: w.match.period > this.config.match.periods,
      players: [name(this.seats[0]), name(this.seats[1])],
    };
    this.match = null;
    this.phase = 'lobby';
    // Anyone who dropped and didn't come back loses their seat now.
    for (const [id, m] of this.members) {
      m.ready = false;
      if (m.conn === null) {
        this.members.delete(id);
        for (const s of SEATS) if (this.seats[s] === id) this.seats[s] = null;
      }
    }
    this.dirty = true;
  }

  private sendRoom(conn: number): void {
    this.port.send(conn, json({ type: 'room', room: this.view() }));
  }

  view(): RoomView {
    const members: MemberView[] = [...this.members.values()]
      .sort((a, b) => a.order - b.order)
      .map((m) => ({
        id: m.user.id,
        name: m.user.name,
        avatarUrl: m.user.avatarUrl,
        ready: m.ready,
        online: m.conn !== null,
      }));
    return {
      code: this.code,
      phase: this.phase,
      members,
      seats: [this.seats[0], this.seats[1]],
      countdown: this.phase === 'countdown' ? this.countdownSeconds : 0,
      matchNumber: this.matchNumber,
      lastResult: this.lastResult,
    };
  }
}
