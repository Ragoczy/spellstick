import { describe, expect, it } from 'vitest';
import { makeConfig, tickSeconds } from '../sim';
import type { SideInput, Snapshot } from './protocol';
import { NetScreen } from './screen';
import { createWorld, stepWorld, type OnlineWorld } from './world';

const config = makeConfig();
const frame = tickSeconds(config);

function snapshotOf(w: OnlineWorld): Snapshot {
  return JSON.parse(JSON.stringify({ world: w, events: [], inputs: [] })) as Snapshot;
}

const steady = (t: number): SideInput => ({ t, move: { x: 1, y: 0 }, aim: { x: 10, y: 0 } });

describe('NetScreen (M12)', () => {
  it('does nothing until the first server state arrives', () => {
    const screen = new NetScreen(config, 0, steady);
    expect(screen.frame(frame, 0).send).toEqual([]);
    expect(screen.predictor.world).toBeNull();
    expect(screen.controlled).toBeNull();
  });

  it("runs ahead of the server, sending this person's controls in tick order", () => {
    const server = createWorld(config, 11, [true, true]);
    for (let i = 0; i < 30; i++)
      stepWorld(server, [null, null], () => ({ move: { x: 0, y: 0 }, aim: { x: 0, y: 0 } }), config);
    const seen: number[] = [];
    const screen = new NetScreen(config, 0, (t) => {
      seen.push(t);
      return steady(t);
    });
    screen.receive(snapshotOf(server), null);
    const sent: SideInput[] = [];
    for (let i = 0; i < 10; i++) sent.push(...screen.frame(frame, i * 16.7).send);
    const start = server.tick + config.online.inputSlackTicks + 4;
    expect(sent.map((s) => s.t)).toEqual(seen);
    expect(sent[0]!.t).toBe(start + 1);
    expect(sent.at(-1)!.t).toBe(screen.clock.tick);
    expect(screen.predictor.world!.tick).toBe(screen.clock.tick);
    expect(screen.controlled).toBe(screen.predictor.world!.control[0]);
  });

  it('a watcher sends nothing and still predicts', () => {
    const server = createWorld(config, 12, [true, true]);
    const screen = new NetScreen(config, null, () => {
      throw new Error('a watcher has no controls');
    });
    screen.receive(snapshotOf(server), null);
    let sent = 0;
    for (let i = 0; i < 5; i++) sent += screen.frame(frame, i * 16.7).send.length;
    expect(sent).toBe(0);
    expect(screen.predictor.world!.tick).toBeGreaterThan(server.tick);
    expect(screen.controlled).toBeNull();
  });

  it('reports a correction when a newer server state disagrees', () => {
    const server = createWorld(config, 13, [true, true]);
    const screen = new NetScreen(config, 0, steady);
    const fixes: number[] = [];
    screen.onCorrection = (_fix, now) => fixes.push(now);
    screen.receive(snapshotOf(server), null);
    screen.frame(frame, 0);
    // The server saw different controls from this person: it moved the other way.
    for (let i = 0; i < 6; i++) {
      stepWorld(
        server,
        [{ t: server.tick + 1, move: { x: -1, y: 0 }, aim: { x: -10, y: 0 } }, null],
        () => ({ move: { x: 0, y: 0 }, aim: { x: 0, y: 0 } }),
        config,
      );
    }
    screen.receive(snapshotOf(server), null);
    screen.frame(frame, 50);
    expect(fixes).toContain(50);
    expect(screen.prev).toBeNull();
  });
});
