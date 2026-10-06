/**
 * Seeded, serializable RNG (mulberry32). The whole state is one uint32, stored in the
 * match state, so a saved state replays identically. Never use Math.random() in the sim.
 */
export interface RngState {
  s: number;
}

export function createRng(seed: number): RngState {
  // Mix the seed so nearby seeds give unrelated streams.
  let s = (seed ^ 0x9e3779b9) >>> 0;
  s = Math.imul(s ^ (s >>> 16), 0x85ebca6b) >>> 0;
  s = Math.imul(s ^ (s >>> 13), 0xc2b2ae35) >>> 0;
  return { s: (s ^ (s >>> 16)) >>> 0 };
}

/** Uniform float in [0, 1). */
export function nextFloat(rng: RngState): number {
  rng.s = (rng.s + 0x6d2b79f5) >>> 0;
  let t = rng.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Uniform float in [min, max). */
export function nextRange(rng: RngState, min: number, max: number): number {
  return min + (max - min) * nextFloat(rng);
}

/** Uniform integer in [min, max] inclusive. */
export function nextInt(rng: RngState, min: number, max: number): number {
  return min + Math.floor(nextFloat(rng) * (max - min + 1));
}

/** True with the given probability. */
export function chance(rng: RngState, p: number): boolean {
  return nextFloat(rng) < p;
}
