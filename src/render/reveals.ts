import { SPELL_POOL, type RunnerSpell, type SpellId, type TeamIndex } from '../sim';

/**
 * Which of each team's three spells have been seen so far this match (Paul, 2026-10-16:
 * "hidden until used"). A spell is revealed the first time anyone on that team casts it, in
 * the order they're revealed. The goalie's Ward isn't one of the three, so it never counts.
 */
export class SpellReveals {
  private readonly seen: [RunnerSpell[], RunnerSpell[]] = [[], []];

  /** Someone on `team` cast `spell`. */
  note(team: TeamIndex, spell: SpellId): void {
    if (!(SPELL_POOL as readonly SpellId[]).includes(spell)) return;
    const list = this.seen[team];
    if (!list.includes(spell as RunnerSpell)) list.push(spell as RunnerSpell);
  }

  /** `team`'s spells seen so far, in the order they were first cast. */
  of(team: TeamIndex): readonly RunnerSpell[] {
    return this.seen[team];
  }

  reset(): void {
    this.seen[0] = [];
    this.seen[1] = [];
  }
}
