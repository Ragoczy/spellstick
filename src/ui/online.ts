import {
  ONLINE_PATH,
  PROTOCOL_VERSION,
  isRoomCode,
  type ByeReason,
  type ClientMessage,
  type RoomView,
  type ServerMessage,
  type SideInput,
  type Snapshot,
} from '../net';

/** A dropped connection is retried this many times, this far apart (ms), before giving up. */
const RETRIES = 5;
const RETRY_MS = 1500;
/** The screen pings the server this often (ms) for the network readout (M12). */
const PING_MS = 1000;

/** What the screens hear from an online session. */
export interface OnlineHandlers {
  welcome(you: { id: string; name: string }, room: string): void;
  room(view: RoomView): void;
  snapshot(snap: Snapshot, slack: number | null): void;
  /** The session is over: the server said why (`bye`), or the connection couldn't be kept. */
  ended(reason: ByeReason | 'lost'): void;
  /** The connection dropped and is being retried (true), or is back (false). */
  reconnecting(on: boolean): void;
  /** What you earned in the match that just ended (M14), once the server has saved it. */
  badges?(news: BadgeNews): void;
}

/** The `badges` message: newly unlocked achievements, your tier, and whether it went up. */
export type BadgeNews = Omit<Extract<ServerMessage, { type: 'badges' }>, 'type'>;

/** What each reason means to the player. */
export const BYE_MESSAGES: Record<ByeReason | 'lost', string> = {
  replaced: 'You opened this room somewhere else, so this window left it.',
  version: 'Spellstick has been updated. Reload the page to play online.',
  'bad-room': "That room link doesn't look right. Start a new room from the title screen.",
  unauthenticated: 'Log in with Discord to play online.',
  'too-fast': 'Your connection sent too much at once and was closed. Try again.',
  server: 'The server is busy or restarting. Try again in a minute.',
  lost: 'Lost the connection to the server. Check your internet and try again.',
};

/** The room in this page's address (`?room=`), if it's a browser room code. */
export function roomFromAddress(search: string): string | null {
  const code = new URLSearchParams(search).get('room');
  return code && isRoomCode(code) && !code.startsWith('d-') ? code : null;
}

/** The link to send a friend for a browser room. */
export function roomLink(origin: string, code: string): string {
  return `${origin}/?room=${code}`;
}

/** Discord's Activity instance id, as a room code. */
export const discordRoom = (instanceId: string): string => `d-${instanceId}`;

/**
 * One connection to an online room (SPEC §11). It retries a dropped connection a few times,
 * rejoining the same room, which gives a seated player their seat back.
 */
export class OnlineSession {
  private ws: WebSocket | null = null;
  private retries = 0;
  private closedByUs = false;
  private over = false;
  /** The room, once the server has said which (it names a new browser room). */
  room: string | null;
  you: { id: string; name: string } | null = null;
  view: RoomView | null = null;
  /** Network readout (M12): the latest round trip and a running average (ms), and what's come in. */
  rttMs: number | null = null;
  rttAvgMs: number | null = null;
  bytesIn = 0;
  snapsIn = 0;
  private pingTimer = 0;
  private pingId = 0;
  private readonly pingsOut = new Map<number, number>();

  constructor(
    room: string | null,
    private readonly handlers: OnlineHandlers,
  ) {
    this.room = room;
    this.connect();
  }

  private connect(): void {
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const query = new URLSearchParams({ v: String(PROTOCOL_VERSION) });
    if (this.room) query.set('room', this.room);
    // A relative address on this host: inside Discord it goes through Discord's proxy to our server.
    const ws = new WebSocket(`${proto}://${window.location.host}${ONLINE_PATH}?${query}`);
    this.ws = ws;
    ws.addEventListener('message', (e) => this.onMessage(String(e.data)));
    ws.addEventListener('close', () => this.onClose(ws));
  }

  private onMessage(data: string): void {
    this.bytesIn += data.length;
    let msg: ServerMessage;
    try {
      msg = JSON.parse(data) as ServerMessage;
    } catch {
      return;
    }
    switch (msg.type) {
      case 'welcome':
        if (this.retries > 0) this.handlers.reconnecting(false);
        this.retries = 0;
        this.you = msg.you;
        this.room = msg.room;
        this.startPinging();
        this.handlers.welcome(msg.you, msg.room);
        break;
      case 'room':
        this.view = msg.room;
        this.handlers.room(msg.room);
        break;
      case 'snap':
        this.snapsIn++;
        this.handlers.snapshot(msg.snap, msg.slack);
        break;
      case 'bye':
        this.finish(msg.reason);
        break;
      case 'badges':
        this.handlers.badges?.({ unlocked: msg.unlocked, tier: msg.tier, promoted: msg.promoted });
        break;
      case 'pong': {
        const sent = this.pingsOut.get(msg.id);
        if (sent === undefined) break;
        this.pingsOut.delete(msg.id);
        const rtt = performance.now() - sent;
        this.rttMs = rtt;
        this.rttAvgMs = this.rttAvgMs === null ? rtt : this.rttAvgMs * 0.8 + rtt * 0.2;
        break;
      }
    }
  }

  /** A ping a second while connected, answered by the room (`pong`), for the round trip. */
  private startPinging(): void {
    window.clearInterval(this.pingTimer);
    this.pingsOut.clear();
    this.pingTimer = window.setInterval(() => {
      if (this.ws?.readyState !== WebSocket.OPEN) return;
      const id = ++this.pingId;
      // Forget pings that never came back, so the map can't grow.
      for (const old of this.pingsOut.keys()) if (old < id - 10) this.pingsOut.delete(old);
      this.pingsOut.set(id, performance.now());
      this.send({ type: 'ping', id });
    }, PING_MS);
  }

  private onClose(ws: WebSocket): void {
    window.clearInterval(this.pingTimer);
    if (ws !== this.ws || this.closedByUs || this.over) return;
    if (this.retries >= RETRIES) {
      this.finish('lost');
      return;
    }
    if (this.retries === 0) this.handlers.reconnecting(true);
    this.retries++;
    window.setTimeout(() => {
      if (!this.closedByUs && !this.over) this.connect();
    }, RETRY_MS);
  }

  private finish(reason: ByeReason | 'lost'): void {
    if (this.over) return;
    this.over = true;
    window.clearInterval(this.pingTimer);
    this.ws?.close();
    this.handlers.ended(reason);
  }

  send(msg: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  sendInputs(inputs: SideInput[]): void {
    if (inputs.length > 0) this.send({ type: 'input', inputs });
  }

  /** Leaves the room for good. */
  close(): void {
    this.closedByUs = true;
    window.clearInterval(this.pingTimer);
    this.ws?.close();
  }
}
