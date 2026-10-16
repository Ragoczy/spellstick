import { describe, expect, it } from 'vitest';
import { MatchNet, Tally, summarize } from './netStats';

describe('Tally', () => {
  it('gives percentiles, the mean, and the extremes', () => {
    const t = new Tally(1);
    for (let v = 1; v <= 100; v++) t.add(v);
    expect(t.quantile(0.5)).toBe(50);
    expect(t.quantile(0.95)).toBe(95);
    expect(t.quantile(0.05)).toBe(5);
    expect(t.mean).toBe(50.5);
    expect([t.min, t.max]).toEqual([1, 100]);
  });

  it('rounds to its step, and says nothing with no samples', () => {
    const t = new Tally(0.01);
    expect(t.quantile(0.5)).toBeNull();
    expect(t.mean).toBeNull();
    t.add(0.123);
    t.add(0.127);
    expect(t.quantile(0.5)).toBeCloseTo(0.12);
    expect(t.quantile(1)).toBeCloseTo(0.13);
  });
});

describe('summarize', () => {
  it("turns a match's counts into shares and rates", () => {
    const net = new MatchNet();
    net.ticks = 3600; // a minute
    net.connectionTicks = 3 * 3600; // three screens
    net.snapshotBytes = 3 * 60 * 1024 * 40; // 40 KB/s each
    const home = net.seat(0);
    home.connectedTicks = 3600;
    home.heldTicks = 36;
    for (let i = 0; i < 90; i++) home.early.add(3);
    for (let i = 0; i < 10; i++) {
      home.early.add(-1);
      home.lateInputs++;
    }
    home.rttMs.add(40);
    home.rttMs.add(80);
    net.seat(1).connectedTicks = 1800;
    net.seat(1).drops = 1;
    net.stepMs.add(0.05);
    const s = summarize(net, { room: 'discord', match: 2, end: 'final', tickHz: 60 });
    expect(s).toMatchObject({
      room: 'discord',
      match: 2,
      end: 'final',
      minutes: 1,
      ticks: 3600,
      snapshotKBps: 40,
    });
    expect(s.seats[0]).toMatchObject({
      connected: 1,
      held: 0.01,
      late: 0.1,
      earlyTicks: { p50: 3, p05: -1 },
      rttMs: { p50: 40, p95: 80, max: 80 },
    });
    expect(s.seats[1]).toMatchObject({ connected: 0.5, drops: 1, late: 0, rttMs: { p50: null } });
    expect(s.stepMs.mean).toBe(0.05);
  });
});
