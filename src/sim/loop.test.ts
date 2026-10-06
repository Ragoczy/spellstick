import { describe, expect, it } from 'vitest';
import { FixedStepper } from './loop';

describe('FixedStepper', () => {
  it('runs whole fixed steps and carries the remainder', () => {
    let steps = 0;
    const stepper = new FixedStepper(() => steps++, 1 / 60, 5);
    stepper.advance(1 / 120);
    expect(steps).toBe(0);
    stepper.advance(1 / 120 + 1e-9);
    expect(steps).toBe(1);
  });

  it('runs the same number of steps regardless of frame rate', () => {
    const count = (frameDt: number) => {
      let steps = 0;
      const stepper = new FixedStepper(() => steps++, 1 / 60, 10);
      for (let t = 0; t < 2 - 1e-9; t += frameDt) stepper.advance(frameDt);
      return steps;
    };
    // 2 s at 60 Hz = 120 steps, whether frames come at 30, 60, or 144 fps (±1 for rounding).
    for (const fps of [30, 60, 144]) expect(Math.abs(count(1 / fps) - 120)).toBeLessThanOrEqual(1);
  });

  it('caps steps per frame and drops the backlog after a long stall', () => {
    let steps = 0;
    const stepper = new FixedStepper(() => steps++, 1 / 60, 5);
    stepper.advance(10);
    expect(steps).toBe(5);
    stepper.advance(0);
    expect(steps).toBe(5);
  });

  it('returns the interpolation alpha in [0, 1)', () => {
    const stepper = new FixedStepper(() => {}, 1 / 60, 5);
    const alpha = stepper.advance(1.5 / 60);
    expect(alpha).toBeCloseTo(0.5, 5);
  });
});
