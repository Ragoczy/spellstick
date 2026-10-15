import { createRng, nextInt, type RngState } from './rng';
import { LOADOUT_SIZE, SPELL_POOL, type RunnerSpell } from './types';

/**
 * Three different spells from the pool at random (M10), for teams the player doesn't pick for:
 * the opponents, the title demo, and the headless sim. `include` is always one of them;
 * `exclude` never is. Uses its own RNG, so drawing doesn't disturb a match's.
 */
export function drawLoadout(
  rng: RngState,
  opts: { include?: RunnerSpell; exclude?: RunnerSpell } = {},
): RunnerSpell[] {
  const picked: RunnerSpell[] = opts.include ? [opts.include] : [];
  const pool = SPELL_POOL.filter((s) => s !== opts.include && s !== opts.exclude);
  while (picked.length < LOADOUT_SIZE && pool.length > 0) {
    picked.push(pool.splice(nextInt(rng, 0, pool.length - 1), 1)[0]!);
  }
  return picked;
}

/** A loadout RNG for a match seed, separate from the match's own stream. `salt` tells teams apart. */
export function loadoutRng(seed: number, salt: number): RngState {
  return createRng(seed * 31 + salt + 0x10ad);
}

/** True if `spells` is a valid loadout: three different spells from the pool. */
export function isLoadout(spells: unknown): spells is RunnerSpell[] {
  return (
    Array.isArray(spells) &&
    spells.length === LOADOUT_SIZE &&
    new Set(spells).size === LOADOUT_SIZE &&
    spells.every((s) => (SPELL_POOL as readonly unknown[]).includes(s))
  );
}
