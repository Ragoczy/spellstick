import { describe, expect, it } from 'vitest';
import { chance, createRng, nextFloat, nextInt } from './rng';

describe('seeded rng', () => {
  it('is reproducible for a seed', () => {
    const a = createRng(123);
    const b = createRng(123);
    for (let i = 0; i < 100; i++) expect(nextFloat(a)).toBe(nextFloat(b));
  });

  it('stays in [0, 1) and is roughly uniform', () => {
    const rng = createRng(9);
    let sum = 0;
    for (let i = 0; i < 20_000; i++) {
      const x = nextFloat(rng);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
      sum += x;
    }
    expect(sum / 20_000).toBeCloseTo(0.5, 1);
  });

  it('nextInt covers its inclusive range', () => {
    const rng = createRng(5);
    const seen = new Set<number>();
    for (let i = 0; i < 1000; i++) seen.add(nextInt(rng, 1, 6));
    expect([...seen].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('chance respects its probability', () => {
    const rng = createRng(11);
    let hits = 0;
    for (let i = 0; i < 10_000; i++) if (chance(rng, 0.25)) hits++;
    expect(hits / 10_000).toBeGreaterThan(0.22);
    expect(hits / 10_000).toBeLessThan(0.28);
  });
});
