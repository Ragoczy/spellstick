import { describe, expect, it } from 'vitest';
import { makeConfig } from '../sim';
import { NetClock } from './clock';

const config = makeConfig();
const o = config.online;

/** A clock past its first state and the settling after it. */
function settled(watching = false): NetClock {
  const c = new NetClock(config);
  c.onSnapshot(100, null, watching);
  c.tick = 1000;
  return c;
}

describe('NetClock', () => {
  it("starts a player's screen a little ahead of the first server state, a watcher's just ahead", () => {
    const p = new NetClock(config);
    p.onSnapshot(100, null, false);
    expect(p.tick).toBe(100 + o.inputSlackTicks + 4);
    const w = new NetClock(config);
    w.onSnapshot(100, null, true);
    expect(w.tick).toBe(100 + o.snapshotEveryTicks);
  });

  it('speeds up when controls arrive too late and slows down when too early', () => {
    const c = settled();
    c.onSnapshot(990, o.inputSlackTicks - 4, false);
    expect(c.rate).toBeGreaterThan(1);
    c.onSnapshot(990, o.inputSlackTicks + 5, false);
    expect(c.rate).toBeLessThan(1);
    c.onSnapshot(990, o.inputSlackTicks, false);
    expect(c.rate).toBe(1);
  });

  it('jumps when far off, then ignores reports that predate the jump', () => {
    const c = settled();
    c.onSnapshot(990, -100, false);
    expect(c.tick).toBe(1000 + c.target + 100);
    const after = c.tick;
    c.onSnapshot(995, -100, false); // sent before the jump: ignored
    expect(c.tick).toBe(after);
  });

  it('late controls buy a tick of cushion, at most so often and so much', () => {
    const c = settled();
    expect(c.target).toBe(o.inputSlackTicks);
    c.onSnapshot(990, 0, false);
    expect(c.cushion).toBe(1);
    c.onSnapshot(992, -1, false); // too soon after the last one
    expect(c.cushion).toBe(1);
    for (let i = 0; i < 40; i++) {
      c.tick! += 60;
      c.onSnapshot(c.tick! - 10, 0, false);
    }
    expect(c.cushion).toBe(o.leadCushionMaxTicks);
    expect(c.target).toBe(o.inputSlackTicks + o.leadCushionMaxTicks);
  });

  it('gives a tick of cushion back after a long enough spell with nothing late', () => {
    const c = settled();
    c.onSnapshot(990, 0, false);
    c.tick! += 60;
    c.onSnapshot(c.tick! - 10, -1, false);
    expect(c.cushion).toBe(2);
    const relax = o.leadCushionRelaxSeconds * config.tickHz;
    c.tick! += relax - 1;
    c.onSnapshot(c.tick! - 5, c.target, false);
    expect(c.cushion).toBe(2); // not quite long enough
    c.tick! += 1;
    c.onSnapshot(c.tick! - 5, c.target, false);
    expect(c.cushion).toBe(1);
    c.tick! += 1;
    c.onSnapshot(c.tick! - 5, c.target, false);
    expect(c.cushion).toBe(1); // one at a time
    c.tick! += relax;
    c.onSnapshot(c.tick! - 5, c.target, false);
    expect(c.cushion).toBe(0);
  });

  it('does nothing on a snapshot with no news of our controls', () => {
    const c = settled();
    c.rate = 1.06;
    c.onSnapshot(990, null, false);
    expect(c).toMatchObject({ tick: 1000, rate: 1.06 });
  });

  it("keeps a watcher's screen about a snapshot ahead of the server", () => {
    const c = settled(true);
    c.onSnapshot(1000 - 40, null, true);
    expect(c.tick).toBe(1000 - 40 + o.snapshotEveryTicks);
  });
});
