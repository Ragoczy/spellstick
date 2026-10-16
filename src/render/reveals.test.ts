import { describe, expect, it } from 'vitest';
import { SpellReveals } from './reveals';

describe('spells revealed when cast', () => {
  it("reveals each team's spells once, in the order they are first cast", () => {
    const r = new SpellReveals();
    expect(r.of(1)).toEqual([]);
    r.note(1, 'snare');
    r.note(1, 'blink');
    r.note(1, 'snare');
    r.note(0, 'tailwind');
    expect(r.of(1)).toEqual(['snare', 'blink']);
    expect(r.of(0)).toEqual(['tailwind']);
  });

  it("ignores the goalie's Ward, and starts over for a new match", () => {
    const r = new SpellReveals();
    r.note(0, 'ward');
    expect(r.of(0)).toEqual([]);
    r.note(0, 'iceWall');
    r.reset();
    expect(r.of(0)).toEqual([]);
  });
});
