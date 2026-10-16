import { describe, expect, it } from 'vitest';
import type { Positions } from './predictor';
import { CorrectionLog } from './readout';

const at = (...xs: number[]): Positions => ({ players: xs.map((x) => ({ x, y: 0 })), ball: { x: 0, y: 0 } });

describe('correction log (the network readout)', () => {
  it('measures your witch apart from everyone else, over the last few seconds', () => {
    const log = new CorrectionLog(3, 5000);
    log.add(1000, at(0, 0, 0), at(0.02, 0.5, 0), 0); // you 2 cm, someone else 50 cm
    log.add(2000, at(0, 0, 0), at(0.04, 0, 0.1), 0); // you 4 cm, someone else 10 cm
    log.add(3000, at(0, 0, 0), at(0.001, 0, 0), 0); // too small to count
    expect(log.summary(4000)).toEqual({
      perSecond: 0.4,
      mineAvgCm: 3,
      mineMaxCm: 4,
      othersMaxCm: 50,
      snaps: 0,
    });
    // Five seconds on, the first one has dropped out.
    expect(log.summary(6500)).toMatchObject({ perSecond: 0.2, mineMaxCm: 4, othersMaxCm: 10 });
  });

  it('counts jumps too big to smooth as snaps, not corrections', () => {
    const log = new CorrectionLog(3, 5000);
    log.add(1000, at(0, 0), at(5, 0.2), 0);
    expect(log.summary(1000)).toEqual({
      perSecond: 0.2,
      mineAvgCm: null,
      mineMaxCm: null,
      othersMaxCm: 20,
      snaps: 1,
    });
  });

  it('has no "you" for a watcher', () => {
    const log = new CorrectionLog(3, 5000);
    log.add(1000, at(0, 0), at(0.3, 0.1), null);
    expect(log.summary(1000)).toMatchObject({ mineAvgCm: null, othersMaxCm: 30 });
  });
});
