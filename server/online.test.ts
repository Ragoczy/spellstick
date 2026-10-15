import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { PROTOCOL_VERSION, type RoomView, type ServerMessage, type SideInput } from '../src/net/index.js';
import { makeConfig } from '../src/sim/index.js';
import { attachOnline, type Online } from './online.js';

/**
 * A one-period, 20-second match, played faster than real time. With seed 22 and nobody
 * touching the controls (the AI plays both sides), it ends 1-0 without overtime.
 */
const config = makeConfig({
  match: { periods: 1, periodSeconds: 20, goalPauseSeconds: 0.5, periodBreakSeconds: 0.5 },
  online: { countdownSeconds: 0.2, replayDelaySeconds: 0.2, replayHoldSeconds: 0.3 },
});

let server: Server;
let online: Online;
let base: string;

async function start(guests = true): Promise<void> {
  server = createServer((_req, res) => res.end());
  online = attachOnline(server, {
    deps: { env: { SESSION_SECRET: 'test-secret' }, fetch, nowSeconds: () => 1, log: () => {} },
    guests,
    config,
    timeScale: 10,
    seed: () => 22,
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `127.0.0.1:${(server.address() as AddressInfo).port}`;
}

afterEach(async () => {
  online?.close();
  await new Promise((r) => server?.close(r));
});

/** A scripted screen: remembers what the server said and can send controls. */
class Client {
  readonly ws: WebSocket;
  readonly messages: ServerMessage[] = [];
  room: RoomView | null = null;
  serverTick = 0;
  constructor(query: string, origin = `http://${base}`) {
    this.ws = new WebSocket(`ws://${base}/api/online?v=${PROTOCOL_VERSION}${query}`, { origin });
    this.ws.on('message', (d) => {
      const msg = JSON.parse(String(d)) as ServerMessage;
      this.messages.push(msg);
      if (msg.type === 'room') this.room = msg.room;
      if (msg.type === 'snap') this.serverTick = msg.snap.world.tick;
    });
  }
  send(msg: object): void {
    this.ws.send(JSON.stringify(msg));
  }
  last<T extends ServerMessage['type']>(type: T): Extract<ServerMessage, { type: T }> | undefined {
    return this.messages.filter((m): m is Extract<ServerMessage, { type: T }> => m.type === type).at(-1);
  }
  /** Run toward the goal we attack, shooting now and then, for ticks just ahead of the server. */
  play(attackX: number): void {
    const inputs: SideInput[] = [];
    for (let t = this.serverTick + 1; t <= this.serverTick + 4; t++) {
      inputs.push({
        t,
        move: { x: Math.sign(attackX), y: 0 },
        aim: { x: attackX, y: 0 },
        primary: t % 90 < 40,
      });
    }
    this.send({ type: 'input', inputs });
  }
}

async function until(check: () => boolean, ms = 10_000): Promise<void> {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 10));
  }
}

describe('online play over WebSockets', () => {
  /** Ann (home) and Bea (away) take their seats and ready up; Cat watches. */
  async function seatedMatch(): Promise<[Client, Client, Client]> {
    const ann = new Client('');
    await until(() => ann.room !== null);
    const code = ann.room!.code;
    const bea = new Client(`&room=${code}`);
    const cat = new Client(`&room=${code}`);
    await until(() => bea.room !== null && cat.room?.members.length === 3);
    ann.send({ type: 'seat', seat: 0 });
    bea.send({ type: 'seat', seat: 1 });
    await until(() => ann.room!.seats[1] !== null);
    ann.send({ type: 'ready', ready: true });
    bea.send({ type: 'ready', ready: true });
    await until(() => ann.room!.phase === 'match');
    return [ann, bea, cat];
  }

  it('plays a whole match through the real server, start to final whistle', async () => {
    await start();
    const [ann, bea, cat] = await seatedMatch();
    await until(() => ann.room!.lastResult !== null, 30_000);
    const result = ann.room!.lastResult!;
    expect(result.players[0]).toMatch(/^Guest/);
    expect(result.score).toEqual([1, 0]);
    expect(ann.room!.phase).toBe('lobby');
    expect(ann.room!.seats.every((s) => s !== null)).toBe(true);
    const final = cat.last('snap')!;
    expect(final.snap.world.match.phase).toBe('final');
    expect(final.slack).toBeNull();
    // Everyone heard the goal.
    for (const c of [ann, bea, cat]) {
      expect(c.messages.some((m) => m.type === 'snap' && m.snap.events.some((e) => e.type === 'goal'))).toBe(
        true,
      );
    }
    for (const c of [ann, bea, cat]) c.ws.close();
  }, 40_000);

  it("a player's controls drive their witch, and they hear how early the controls arrive", async () => {
    await start();
    const [ann, bea, cat] = await seatedMatch();
    await until(() => cat.last('snap')?.snap.world.match.phase === 'live');
    const timer = setInterval(() => {
      ann.play(20);
      bea.play(-20);
    }, 5);
    try {
      await until(() => (ann.last('snap')?.slack ?? null) !== null);
      const first = cat.last('snap')!.snap.world;
      const id = first.control[0];
      const x0 = first.match.players[id]!.pos.x;
      await until(() => {
        const w = cat.last('snap')!.snap.world;
        return w.control[0] !== id || w.match.players[id]!.pos.x > x0 + 1;
      });
    } finally {
      clearInterval(timer);
    }
    for (const c of [ann, bea, cat]) c.ws.close();
  }, 40_000);

  it('turns away people who are not signed in', async () => {
    await start(false);
    // No guests (as in Azure): without a session the server says so and closes.
    const nobody = new Client('');
    await until(() => nobody.last('bye') !== undefined);
    expect(nobody.last('bye')!.reason).toBe('unauthenticated');
  });

  it('refuses other sites, old pages, and bad room codes', async () => {
    await start();
    const evil = new WebSocket(`ws://${base}/api/online?v=${PROTOCOL_VERSION}`, {
      origin: 'https://evil.example',
    });
    const refused = await new Promise<string>((r) =>
      evil.on('unexpected-response', (_q, res) => r(String(res.statusCode))),
    );
    expect(refused).toBe('403');
    const stale = new WebSocket(`ws://${base}/api/online?v=0`, { origin: `http://${base}` });
    const bad = new Client('&room=NOPE!');
    const byeOf = (ws: WebSocket) =>
      new Promise<string>((r) =>
        ws.on('message', (d) => r((JSON.parse(String(d)) as { reason: string }).reason)),
      );
    expect(await byeOf(stale)).toBe('version');
    await until(() => bad.last('bye') !== undefined);
    expect(bad.last('bye')!.reason).toBe('bad-room');
  });
});
