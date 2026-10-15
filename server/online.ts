import { randomInt } from 'node:crypto';
import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type WebSocket } from 'ws';
import {
  ONLINE_PATH,
  PROTOCOL_VERSION,
  Room,
  isRoomCode,
  parseClientMessage,
  type ByeReason,
  type RoomUser,
  type ServerMessage,
} from '../src/net/index.js';
import { makeConfig, type SimConfig } from '../src/sim/index.js';
import { activityOrigin, me, type AuthDeps, type AuthRequest, type MeBody } from './auth/auth.js';
import { publicOrigin } from './http.js';

/**
 * Online play (SPEC §11): WebSockets at /api/online, one Room per room code, all stepped 60
 * times a second. Rooms live in memory, so the app must run as a single copy (infra/README.md);
 * a restart ends the matches in progress.
 */

export interface OnlineOptions {
  deps: AuthDeps;
  /**
   * Let people without a session play as guests. Local testing and the end-to-end tests only:
   * never set ONLINE_GUESTS in Azure.
   */
  guests?: boolean;
  config?: SimConfig;
  /** Tests only: run this many times faster than real time... */
  timeScale?: number;
  /** ...with these match seeds. */
  seed?: () => number;
}

/** The biggest message a screen sends (a batch of controls is a few hundred bytes). */
const MAX_MESSAGE_BYTES = 8 * 1024;
/** Messages a second a screen may send (it sends about 60). */
const MAX_MESSAGES_PER_SECOND = 240;
/** Most people in one room, and rooms at once. */
const MAX_ROOM_CONNECTIONS = 24;
const MAX_ROOMS = 200;
/** A room with nobody connected closes after this long (s). */
const ROOM_IDLE_SECONDS = 60;
/** Ping each connection this often (ms); one that hasn't answered the last ping is gone. */
const HEARTBEAT_MS = 15_000;
const ROOM_CODE_CHARS = 'abcdefghijkmnpqrstuvwxyz23456789';

interface Conn {
  id: number;
  ws: WebSocket;
  room: Room;
  alive: boolean;
  windowStart: number;
  messages: number;
}

export interface Online {
  /** Rooms open now, by code (tests). */
  readonly rooms: ReadonlyMap<string, Room>;
  close(): void;
}

export function attachOnline(server: Server, opts: OnlineOptions): Online {
  const config = opts.config ?? makeConfig();
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: MAX_MESSAGE_BYTES,
    perMessageDeflate: { threshold: 512 },
  });
  const rooms = new Map<string, Room>();
  const conns = new Map<number, Conn>();
  let nextConn = 1;

  const send = (ws: WebSocket, data: string) => {
    if (ws.readyState === ws.OPEN) ws.send(data);
  };
  const bye = (ws: WebSocket, reason: ByeReason) => {
    send(ws, JSON.stringify({ type: 'bye', reason } satisfies ServerMessage));
    ws.close(4000, reason);
  };

  const port = {
    send: (conn: number, data: string) => {
      const c = conns.get(conn);
      if (c) send(c.ws, data);
    },
    close: (conn: number, reason: ByeReason) => {
      const c = conns.get(conn);
      if (!c) return;
      conns.delete(conn);
      bye(c.ws, reason);
    },
  };

  const newCode = (): string => {
    for (;;) {
      let code = '';
      for (let i = 0; i < 6; i++) code += ROOM_CODE_CHARS[randomInt(ROOM_CODE_CHARS.length)];
      if (!rooms.has(code)) return code;
    }
  };

  const roomFor = (code: string): Room | null => {
    const found = rooms.get(code);
    if (found) return found.connected < MAX_ROOM_CONNECTIONS ? found : null;
    if (rooms.size >= MAX_ROOMS) return null;
    const room = new Room(code, config, port, opts.seed ?? (() => randomInt(1, 2 ** 31)));
    rooms.set(code, room);
    return room;
  };

  /** Who's connecting: their session, a guest (testing only), or nobody. */
  const userFor = (req: IncomingMessage, origin: string): RoomUser | null => {
    const authReq: AuthRequest = {
      url: `${origin}${req.url ?? '/'}`,
      headers: {
        get: (name) => {
          const v = req.headers[name.toLowerCase()];
          return Array.isArray(v) ? v.join(', ') : (v ?? null);
        },
      },
    };
    const res = me(authReq, opts.deps);
    if (res.status === 200) {
      const body = res.jsonBody as MeBody;
      return { id: body.id, name: body.username, avatarUrl: body.avatarUrl };
    }
    if (!opts.guests) return null;
    const n = randomInt(1000, 10_000);
    return { id: `guest-${n}-${randomInt(1e9)}`, name: `Guest ${n}`, avatarUrl: '' };
  };

  const onUpgrade = (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = new URL(req.url ?? '/', 'http://placeholder');
    if (url.pathname !== ONLINE_PATH) {
      socket.destroy();
      return;
    }
    const origin = publicOrigin(req);
    const sender = req.headers.origin;
    const fromGame =
      origin !== null &&
      sender !== undefined &&
      (sender === origin || sender === activityOrigin(opts.deps.env.DISCORD_CLIENT_ID));
    if (!origin || !fromGame) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      if (url.searchParams.get('v') !== String(PROTOCOL_VERSION)) return bye(ws, 'version');
      const user = userFor(req, origin);
      if (!user) return bye(ws, 'unauthenticated');
      const asked = url.searchParams.get('room');
      if (asked !== null && !isRoomCode(asked)) return bye(ws, 'bad-room');
      const room = roomFor(asked ?? newCode());
      if (!room) return bye(ws, 'server');

      const conn: Conn = { id: nextConn++, ws, room, alive: true, windowStart: Date.now(), messages: 0 };
      conns.set(conn.id, conn);
      ws.on('pong', () => (conn.alive = true));
      ws.on('message', (data, isBinary) => {
        if (isBinary || !conns.has(conn.id)) return;
        const now = Date.now();
        if (now - conn.windowStart >= 1000) {
          conn.windowStart = now;
          conn.messages = 0;
        }
        if (++conn.messages > MAX_MESSAGES_PER_SECOND) {
          conns.delete(conn.id);
          room.leave(conn.id);
          bye(ws, 'too-fast');
          return;
        }
        const msg = parseClientMessage(String(data));
        if (msg) room.message(conn.id, msg);
      });
      ws.on('close', () => {
        conns.delete(conn.id);
        room.leave(conn.id);
      });
      ws.on('error', () => ws.terminate());
      room.join(conn.id, user);
    });
  };
  server.on('upgrade', onUpgrade);

  // 60 steps a second, caught up from a monotonic clock (setInterval alone drifts).
  const stepMs = 1000 / config.tickHz / (opts.timeScale ?? 1);
  let last = performance.now();
  let owed = 0;
  const loop = setInterval(() => {
    const now = performance.now();
    owed += now - last;
    last = now;
    let steps = 0;
    const maxSteps = config.maxStepsPerFrame * (opts.timeScale ?? 1);
    while (owed >= stepMs && steps < maxSteps) {
      for (const [code, room] of rooms) {
        try {
          room.tick();
        } catch (e) {
          opts.deps.log(`online: a room failed and was closed (${(e as Error).name})`);
          rooms.delete(code);
          continue;
        }
        if (room.idleTicks > ROOM_IDLE_SECONDS * config.tickHz) rooms.delete(code);
      }
      owed -= stepMs;
      steps++;
    }
    if (steps >= maxSteps) owed = 0; // fell far behind: drop the backlog
  }, 4);

  const heartbeat = setInterval(() => {
    for (const c of conns.values()) {
      if (!c.alive) {
        c.ws.terminate();
        continue;
      }
      c.alive = false;
      c.ws.ping();
    }
  }, HEARTBEAT_MS);

  return {
    rooms,
    close: () => {
      clearInterval(loop);
      clearInterval(heartbeat);
      server.off('upgrade', onUpgrade);
      for (const c of conns.values()) bye(c.ws, 'server');
      conns.clear();
      rooms.clear();
      wss.close();
    },
  };
}
