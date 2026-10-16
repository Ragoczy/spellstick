import { describe, expect, it } from 'vitest';
import { RateMeter, readoutLines, type ReadoutData } from './netReadout';

const data = (over: Partial<ReadoutData> = {}): ReadoutData => ({
  watching: false,
  rttMs: 48.4,
  rttAvgMs: 52.2,
  aheadTicks: 6,
  slack: 3,
  targetSlack: 3,
  snapsPerSecond: 30,
  kbPerSecond: 42.5,
  corrections: { perSecond: 1.2, mineAvgCm: 3, mineMaxCm: 8, othersMaxCm: 40, snaps: 0 },
  tickHz: 60,
  ...over,
});

describe('network readout (M12)', () => {
  it('shows ping, how far ahead, controls, updates, and corrections', () => {
    expect(readoutLines(data())).toEqual([
      ['Ping', '48 ms (avg 52)'],
      ['Ahead', '6 ticks (100 ms)'],
      ['Controls', '3 ticks early (aim 3)'],
      ['Updates', '30/s · 42.5 KB/s'],
      ['Corrections', '1.2/s · you 3 cm avg, 8 cm max · others 40 cm max'],
    ]);
  });

  it('says how late controls are, counts snaps, and leaves out "you" for a watcher', () => {
    expect(readoutLines(data({ slack: -1 }))[2]).toEqual(['Controls', '2 ticks late (aim 3 early)']);
    const fresh = readoutLines(
      data({
        snapsPerSecond: null,
        kbPerSecond: null,
        corrections: { perSecond: 0, mineAvgCm: null, mineMaxCm: null, othersMaxCm: 5, snaps: 0 },
      }),
    );
    expect(fresh[3]).toEqual(['Updates', '—']);
    expect(fresh[4]).toEqual(['Corrections', '0/s · you none · others 5 cm max']);
    const watcher = readoutLines(
      data({
        watching: true,
        rttMs: null,
        corrections: { perSecond: 0, mineAvgCm: null, mineMaxCm: null, othersMaxCm: null, snaps: 2 },
      }),
    );
    expect(watcher.map(([label]) => label)).toEqual(['Ping', 'Ahead', 'Updates', 'Corrections']);
    expect(watcher[0]).toEqual(['Ping', '—']);
    expect(watcher[3]).toEqual(['Corrections', '0/s · others none · 2 snaps']);
  });

  it('turns running totals into rates', () => {
    const m = new RateMeter();
    m.sample(1000, 0, 0);
    expect(m.snapsPerSecond).toBeNull();
    m.sample(1500, 15, 20 * 1024);
    expect([m.snapsPerSecond, m.kbPerSecond]).toEqual([30, 40]);
  });
});
