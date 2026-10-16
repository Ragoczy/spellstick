import { describe, expect, it } from 'vitest';
import { makeConfig, secondsToTicks, type SimConfig } from '../sim';
import type { MatchSummary } from './netStats';
import type { ByeReason, RoomView, ServerMessage } from './protocol';
import { Room, type RoomUser } from './room';

const ANN: RoomUser = { id: '1', name: 'Ann', avatarUrl: 'a' };
const BEA: RoomUser = { id: '2', name: 'Bea', avatarUrl: 'b' };
const CAT: RoomUser = { id: '3', name: 'Cat', avatarUrl: 'c' };

function setup(config: SimConfig = makeConfig(), code = 'abc123') {
  const sent = new Map<number, ServerMessage[]>();
  const closed: [number, ByeReason][] = [];
  const summaries: MatchSummary[] = [];
  const room = new Room(
    code,
    config,
    {
      send: (conn, data) => sent.set(conn, [...(sent.get(conn) ?? []), JSON.parse(data) as ServerMessage]),
      close: (conn, reason) => closed.push([conn, reason]),
      matchOver: (summary) => summaries.push(summary),
    },
    () => 99,
  );
  const last = <T extends ServerMessage['type']>(conn: number, type: T) =>
    (sent.get(conn) ?? []).filter((m): m is Extract<ServerMessage, { type: T }> => m.type === type).at(-1);
  const view = (conn: number): RoomView => last(conn, 'room')!.room;
  const ticks = (n: number) => {
    for (let i = 0; i < n; i++) room.tick();
  };
  return { room, sent, closed, summaries, last, view, ticks, config };
}

/** Ann (conn 1) home, Bea (conn 2) away, both ready, through the countdown. */
function startMatch(s: ReturnType<typeof setup>) {
  s.room.join(1, ANN);
  s.room.join(2, BEA);
  s.room.message(1, { type: 'seat', seat: 0 });
  s.room.message(2, { type: 'seat', seat: 1 });
  s.room.message(1, { type: 'ready', ready: true });
  s.room.message(2, { type: 'ready', ready: true });
  s.ticks(secondsToTicks(s.config.online.countdownSeconds, s.config) + 1);
}

describe('Room', () => {
  it('welcomes people and lists them', () => {
    const s = setup();
    s.room.join(1, ANN);
    s.room.join(2, BEA);
    s.ticks(1);
    expect(s.last(1, 'welcome')).toEqual({ type: 'welcome', you: { id: '1', name: 'Ann' }, room: 'abc123' });
    expect(s.view(1).members.map((m) => m.name)).toEqual(['Ann', 'Bea']);
    expect(s.view(1).phase).toBe('lobby');
  });

  it('seats people in free seats only, and readies only the seated', () => {
    const s = setup();
    s.room.join(1, ANN);
    s.room.join(2, BEA);
    s.room.message(1, { type: 'seat', seat: 0 });
    s.room.message(2, { type: 'seat', seat: 0 }); // taken
    s.room.message(2, { type: 'ready', ready: true }); // not seated
    s.ticks(1);
    expect(s.view(2).seats).toEqual(['1', null]);
    expect(s.view(2).members[1]!.ready).toBe(false);
    s.room.message(1, { type: 'seat', seat: 1 }); // moving frees the old seat
    s.ticks(1);
    expect(s.view(2).seats).toEqual([null, '1']);
  });

  it('counts down once both seats are ready, and stops if someone unreadies', () => {
    const s = setup();
    s.room.join(1, ANN);
    s.room.join(2, BEA);
    s.room.message(1, { type: 'seat', seat: 0 });
    s.room.message(2, { type: 'seat', seat: 1 });
    s.room.message(1, { type: 'ready', ready: true });
    s.room.message(2, { type: 'ready', ready: true });
    s.ticks(2);
    expect(s.view(1)).toMatchObject({ phase: 'countdown', countdown: s.config.online.countdownSeconds });
    s.room.message(2, { type: 'ready', ready: false });
    s.ticks(1);
    expect(s.view(1).phase).toBe('lobby');
  });

  it('starts the match and sends it to everyone, watchers included', () => {
    const s = setup();
    s.room.join(3, CAT);
    startMatch(s);
    expect(s.view(3).phase).toBe('match');
    expect(s.view(3).matchNumber).toBe(1);
    s.ticks(4);
    const snap = s.last(3, 'snap')!;
    expect(snap.slack).toBeNull();
    expect(snap.snap.world.humans).toEqual([true, true]);
    expect(snap.snap.world.tick).toBeGreaterThan(0);
    expect(s.room.world!.match.players.length).toBeGreaterThan(2);
  });

  it("drives a player's witch from their controls, and tells them how early they arrive", () => {
    const s = setup();
    startMatch(s);
    // Past the faceoff, where the takers are locked in place.
    for (let i = 0; i < 2000 && s.room.world!.match.phase !== 'live'; i++) s.room.tick();
    const w = s.room.world!;
    const me = w.control[0];
    const before = { ...w.match.players[me]!.pos };
    const inputs = [];
    for (let t = w.tick + 1; t <= w.tick + 4; t++)
      inputs.push({ t, move: { x: 0, y: -1 }, aim: { x: 0, y: -10 } });
    s.room.message(1, { type: 'input', inputs });
    s.ticks(4);
    expect(s.room.world!.match.players[me]!.pos.y).toBeLessThan(before.y);
    // The report goes out once, in the next snapshot; after that there's no news.
    const reports = s.sent.get(1)!.flatMap((m) => (m.type === 'snap' && m.slack !== null ? [m.slack] : []));
    expect(reports).toEqual([4]);
    expect(s.last(1, 'snap')!.slack).toBeNull();
  });

  it("gives a dropped player's side to the AI and lets them back in", () => {
    const s = setup();
    startMatch(s);
    s.room.leave(1);
    s.ticks(1);
    expect(s.room.world!.humans).toEqual([false, true]);
    expect(s.view(2).members.find((m) => m.id === '1')!.online).toBe(false);
    expect(s.view(2).seats[0]).toBe('1');
    s.room.join(4, ANN);
    expect(s.room.world!.humans).toEqual([true, true]);
    expect(s.last(4, 'snap')).toBeDefined();
  });

  it('replaces an older connection when the same person connects again', () => {
    const s = setup();
    s.room.join(1, ANN);
    s.room.join(5, ANN);
    expect(s.closed).toEqual([[1, 'replaced']]);
    expect(s.room.connected).toBe(1);
    s.room.leave(1); // the old connection closing changes nothing
    s.ticks(1);
    expect(s.view(5).members).toHaveLength(1);
  });

  it('frees a lobby seat when its player leaves', () => {
    const s = setup();
    s.room.join(1, ANN);
    s.room.join(2, BEA);
    s.room.message(1, { type: 'seat', seat: 0 });
    s.room.leave(1);
    s.ticks(1);
    expect(s.view(2).seats).toEqual([null, null]);
    expect(s.view(2).members.map((m) => m.name)).toEqual(['Bea']);
  });

  it('goes back to the lobby with the result after the final whistle, seats kept', () => {
    const s = setup(makeConfig({ match: { periods: 1, periodSeconds: 20 } }));
    startMatch(s);
    s.room.leave(2); // Bea drops and never comes back
    for (let i = 0; i < 200_000 && s.room.world; i++) s.room.tick();
    expect(s.room.world).toBeNull();
    s.ticks(1);
    const v = s.view(1);
    expect(v.phase).toBe('lobby');
    expect(v.lastResult).toMatchObject({ players: ['Ann', 'Bea'] });
    expect(v.lastResult!.score[0]).not.toBe(v.lastResult!.score[1]);
    expect(v.seats).toEqual(['1', null]);
    expect(s.last(1, 'snap')!.snap.world.match.phase).toBe('final');
  });

  it("plays each seat's own three spells, picked in the lobby (M13)", () => {
    const s = setup();
    s.room.join(1, ANN);
    s.room.join(2, BEA);
    s.room.message(1, { type: 'spells', spells: ['snare', 'blink', 'iceWall'] });
    s.ticks(1);
    // Each person sees only their own picks; the rest stay hidden until cast.
    expect(s.view(1).members.map((m) => m.spells)).toEqual([['snare', 'blink', 'iceWall'], null]);
    expect(s.view(2).members.map((m) => m.spells)).toEqual([
      null,
      ['hexShove', 'quickstep', 'bentShot'], // nothing sent yet: the starting three
    ]);
    startMatch(s);
    const players = s.room.world!.match.players;
    const runners = (team: number) => players.filter((p) => p.team === team && p.role === 'runner');
    for (const p of runners(0)) expect(p.spells).toEqual(['snare', 'blink', 'iceWall']);
    for (const p of runners(1)) expect(p.spells).toEqual(['hexShove', 'quickstep', 'bentShot']);
    // Mid-match the spells stay as they started.
    s.room.message(1, { type: 'spells', spells: ['tailwind', 'pinpoint', 'stoneSkin'] });
    s.ticks(1);
    expect(s.view(1).members[0]!.spells).toEqual(['snare', 'blink', 'iceWall']);
  });

  it('changing spells in the lobby takes back Ready', () => {
    const s = setup();
    s.room.join(1, ANN);
    s.room.message(1, { type: 'seat', seat: 0 });
    s.room.message(1, { type: 'ready', ready: true });
    s.room.message(1, { type: 'spells', spells: ['tailwind', 'pinpoint', 'stoneSkin'] });
    s.ticks(1);
    expect(s.view(1).members[0]).toMatchObject({
      ready: false,
      spells: ['tailwind', 'pinpoint', 'stoneSkin'],
    });
  });

  it('reports how a finished match went over the network, without names (M12)', () => {
    const s = setup(makeConfig({ match: { periods: 1, periodSeconds: 20 } }), 'd-1234');
    s.room.join(3, CAT);
    startMatch(s);
    const w = s.room.world!;
    // Ann's controls: two early, one late.
    s.room.message(1, {
      type: 'input',
      inputs: [
        { t: w.tick + 3, move: { x: 0, y: 0 }, aim: { x: 0, y: 0 } },
        { t: w.tick + 4, move: { x: 0, y: 0 }, aim: { x: 0, y: 0 } },
        { t: w.tick, move: { x: 0, y: 0 }, aim: { x: 0, y: 0 } },
      ],
    });
    s.room.roundTrip(1, 42);
    s.room.roundTrip(3, 999); // a watcher's round trip isn't a seat's
    s.ticks(10);
    s.room.leave(2);
    s.ticks(10);
    s.room.join(6, BEA);
    for (let i = 0; i < 200_000 && s.room.world; i++) s.room.tick();
    expect(s.summaries).toHaveLength(1);
    const sum = s.summaries[0]!;
    expect(sum).toMatchObject({ room: 'discord', match: 1, end: 'final', watchersMax: 1 });
    expect(sum.seats[0]).toMatchObject({ drops: 0, rejoins: 0, connected: 1, rttMs: { p50: 42 } });
    expect(sum.seats[0].late).toBeCloseTo(1 / 3, 2);
    expect(sum.seats[0].earlyTicks.p50).toBe(3);
    // Ann sent controls for a few ticks only: the rest were carried forward.
    expect(sum.seats[0].held).toBeGreaterThan(0.9);
    expect(sum.seats[1]).toMatchObject({ drops: 1, rejoins: 1, rttMs: { p50: null } });
    expect(sum.seats[1].connected).toBeLessThan(1);
    expect(sum.snapshotKBps).toBeGreaterThan(0);
    expect(JSON.stringify(sum)).not.toMatch(/Ann|Bea|Cat|1234/);
  });

  it('reports a match still going when the room closes as abandoned', () => {
    const s = setup();
    startMatch(s);
    s.ticks(30);
    s.room.abandon();
    expect(s.summaries.map((x) => x.end)).toEqual(['abandoned']);
    expect(s.summaries[0]!.room).toBe('browser');
    expect(s.room.world).toBeNull();
  });

  it('answers pings and counts idle time', () => {
    const s = setup();
    s.room.join(1, ANN);
    s.room.message(1, { type: 'ping', id: 4 });
    expect(s.last(1, 'pong')).toEqual({ type: 'pong', id: 4 });
    s.room.leave(1);
    s.ticks(3);
    expect(s.room.idleTicks).toBe(3);
  });
});
