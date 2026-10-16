import { describe, expect, it } from 'vitest';
import { makeConfig } from '../src/sim';
import { averagePairing, formatNetReport, runNetMatch } from './netSim';

// Short matches: the network numbers don't need a full one.
const config = makeConfig({ match: { periodSeconds: 10 } });

// Whole online matches in simulated time: a few seconds each, longer on a busy machine.
describe('network sim (M12)', { timeout: 60_000 }, () => {
  it('plays an online match to the final whistle through the real room and screens', () => {
    const r = runNetMatch(config, 3, ['east', 'east']);
    expect(r.minutes).toBeGreaterThan(0.5);
    expect(r.snapshotKBps).toBeGreaterThan(0);
    for (const seat of r.seats) {
      // A short, steady link: nearly every control arrives in time, a tick or two early (only
      // the match's first ticks, before the screen has heard from the server, have none).
      expect(seat.late).toBeLessThan(0.01);
      expect(seat.held).toBeLessThan(0.01);
      expect(seat.earlyP05).toBeGreaterThanOrEqual(1);
      expect(seat.aheadTicks).toBeGreaterThan(0);
      expect(seat.mineDrawnAvgCm).toBeLessThan(5);
    }
  });

  it('is deterministic: the same seed and links give the same numbers', () => {
    expect(runNetMatch(config, 5, ['east', 'wifi'])).toEqual(runNetMatch(config, 5, ['east', 'wifi']));
  });

  it('a long, lossy link runs further ahead and gets more of its controls in late', () => {
    const r = runNetMatch(config, 4, ['east', 'pacific']);
    const [near, far] = r.seats;
    expect(far.aheadTicks).toBeGreaterThan(near.aheadTicks + 5);
    expect(far.late).toBeGreaterThanOrEqual(near.late);
    expect(far.othersDrawnP95Cm).toBeGreaterThan(near.othersDrawnP95Cm);
  });

  it('averages a pairing and prints a row per seat', () => {
    const results = [runNetMatch(config, 6, ['east', 'west'])];
    const row = averagePairing(['east', 'west'], results);
    expect(row.games).toBe(1);
    expect(row.seats[1].link).toBe('west');
    expect(row.seats[0].aheadTicks).toBeCloseTo(results[0]!.seats[0].aheadTicks, 3);
    const text = formatNetReport([row], { games: 1, baseSeed: 6, elapsedMs: 1000, settings: 'test' });
    expect(text).toContain('east v west');
    expect(text).toContain('away west');
    expect(text).toMatch(/Snapshots: .* KB\/s/);
  });
});
