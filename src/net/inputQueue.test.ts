import { describe, expect, it } from 'vitest';
import { InputQueue } from './inputQueue';
import type { SideInput } from './protocol';

const at = (t: number, extra: Partial<SideInput> = {}): SideInput => ({
  t,
  move: { x: 1, y: 0 },
  aim: { x: 5, y: 5 },
  ...extra,
});

describe('InputQueue', () => {
  it('gives each tick its own controls, and reports how early they came', () => {
    const q = new InputQueue();
    q.push(at(12, { check: true }), 9);
    expect(q.slack).toBe(3);
    expect(q.take(11)).toBeNull(); // nothing for 11, and nothing earlier to carry forward
    expect(q.take(12)).toMatchObject({ t: 12, check: true });
  });

  it('carries held controls forward without repeating presses', () => {
    const q = new InputQueue();
    q.push(at(1, { primary: true, check: true, cast: 'quickstep' }), 0);
    q.take(1);
    const carried = q.take(2)!;
    expect(carried).toMatchObject({ t: 2, move: { x: 1, y: 0 }, primary: true });
    expect(carried.check).toBeUndefined();
    expect(carried.cast).toBeUndefined();
  });

  it('still makes a late press happen, on the next tick', () => {
    const q = new InputQueue();
    q.push(at(1), 0);
    q.take(1);
    q.push(at(1, { check: true, cast: 'hexShove', switchPlayer: true }), 1);
    expect(q.slack).toBe(0);
    expect(q.take(2)).toMatchObject({ check: true, cast: 'hexShove', switchPlayer: true });
    expect(q.take(3)?.check).toBeUndefined();
  });

  it('lets go of the sticks after a while with nothing new (a hidden tab)', () => {
    const q = new InputQueue(2);
    q.push(at(1, { primary: true }), 0);
    q.take(1);
    expect(q.take(2)).toMatchObject({ move: { x: 1, y: 0 }, primary: true });
    expect(q.take(3)).toMatchObject({ move: { x: 1, y: 0 }, primary: true });
    const idle = q.take(4)!;
    expect(idle.move).toEqual({ x: 0, y: 0 });
    expect(idle.primary).toBeUndefined();
    expect(idle.aim).toEqual({ x: 5, y: 5 });
  });

  it('has nothing before the first controls arrive, and forgets on clear', () => {
    const q = new InputQueue();
    expect(q.take(1)).toBeNull();
    q.push(at(3), 1);
    q.clear();
    expect(q.take(3)).toBeNull();
    expect(q.slack).toBeNull();
  });

  it('drops controls absurdly far ahead', () => {
    const q = new InputQueue();
    q.push(at(10_000), 1);
    expect(q.take(10_000)).toBeNull();
  });
});
