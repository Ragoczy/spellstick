import { describe, expect, it } from 'vitest';
import { makeConfig, type InputCommand } from '../sim';
import { Predictor, Smoother, positionsOf, type Positions } from './predictor';
import type { SideInput, Snapshot } from './protocol';
import { createWorld, stepWorld, type OnlineWorld } from './world';

const config = makeConfig();

/** Everyone else holds a steady course (what a screen assumes between server states). */
const steady = (id: number): InputCommand => ({
  move: { x: Math.cos(id), y: Math.sin(id) },
  aim: { x: 10 * Math.cos(id * 2), y: 5 * Math.sin(id * 3) },
  primary: id % 3 === 0,
});

/** This person's scripted controls: steering, passes, shots, checks, spells, switching. */
function mine(t: number): SideInput {
  const s = t / 60;
  const input: SideInput = {
    t,
    move: { x: Math.cos(s * 0.9), y: Math.sin(s * 1.3) },
    aim: { x: 12 * Math.cos(s * 0.5), y: 6 * Math.sin(s * 0.7) },
  };
  if (t % 151 < 30) input.primary = true;
  if (t % 83 === 0) input.check = true;
  if (t % 200 === 50) input.cast = 'quickstep';
  if (t % 120 === 7) input.switchPlayer = true;
  return input;
}

function serverStep(w: OnlineWorld): void {
  stepWorld(w, [mine(w.tick + 1), null], steady, config);
}

/** What goes over the wire: JSON there and back. */
function snapshotOf(w: OnlineWorld): Snapshot {
  return JSON.parse(
    JSON.stringify({ world: w, events: [], inputs: w.match.players.map((p) => steady(p.id)) }),
  ) as Snapshot;
}

describe('Predictor', () => {
  it("lands exactly on the server's state when it knows everyone's controls", () => {
    const server = createWorld(config, 42, [true, false]);
    for (let i = 0; i < 400; i++) serverStep(server);
    const p = new Predictor(config, 0);
    p.receive(snapshotOf(server));
    for (let t = server.tick + 1; t <= server.tick + 25; t++) p.addInput(mine(t));
    for (let i = 0; i < 25; i++) serverStep(server);
    expect(p.advanceTo(server.tick)).toBe(true);
    expect(JSON.parse(JSON.stringify(p.world))).toEqual(JSON.parse(JSON.stringify(server)));
  });

  it('starts over from each newer server state, ignores older ones, and never runs too far ahead', () => {
    const server = createWorld(config, 7, [true, false]);
    const p = new Predictor(config, 0);
    expect(p.advanceTo(10)).toBe(false); // nothing from the server yet
    p.receive(snapshotOf(server));
    expect(p.advanceTo(5)).toBe(true);
    expect(p.advanceTo(6)).toBe(false);
    for (let i = 0; i < 10; i++) serverStep(server);
    const newer = snapshotOf(server);
    p.receive(newer);
    p.receive(snapshotOf(createWorld(config, 7, [true, false]))); // stale: ignored
    expect(p.server?.tick).toBe(10);
    p.advanceTo(10_000);
    expect(p.world!.tick).toBe(10 + config.online.maxPredictTicks);
  });

  it('a watcher carries everyone forward', () => {
    const server = createWorld(config, 9, [true, true]);
    const p = new Predictor(config, null);
    p.receive(snapshotOf(server));
    p.advanceTo(20);
    expect(p.world!.tick).toBe(20);
  });
});

describe('Smoother', () => {
  const at = (x: number): Positions => ({ players: [{ x, y: 0 }], ball: { x, y: 0 } });

  it('draws a corrected witch where she was, then eases her to where she is', () => {
    const s = new Smoother(config);
    s.correct(at(1), at(0.5));
    expect(s.player(0).x).toBeCloseTo(0.5);
    s.decay(config.online.smoothSeconds * 5);
    expect(Math.abs(s.player(0).x)).toBeLessThan(0.01);
  });

  it('snaps big jumps', () => {
    const s = new Smoother(config);
    s.correct(at(10), at(0));
    expect(s.player(0)).toEqual({ x: 0, y: 0 });
    expect(s.ball).toEqual({ x: 0, y: 0 });
  });

  it('reads positions from a world', () => {
    const w = createWorld(config, 1, [true, true]);
    expect(positionsOf(w).players).toHaveLength(w.match.players.length);
  });
});
