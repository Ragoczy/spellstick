import { describe, expect, it } from 'vitest';
import { CHANGELOG, changelogDate } from './changelog';

describe("changelog (What's new on the title screen)", () => {
  it('has entries, each dated YYYY-MM-DD with a title and at least one item', () => {
    expect(CHANGELOG.length).toBeGreaterThan(0);
    for (const e of CHANGELOG) {
      expect(e.date).toMatch(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/);
      expect(e.title.trim()).not.toBe('');
      expect(e.items.length).toBeGreaterThan(0);
      for (const i of e.items) expect(i.trim()).not.toBe('');
    }
  });

  it('is newest first, so the title screen shows the latest', () => {
    const dates = CHANGELOG.map((e) => e.date);
    expect(dates).toEqual([...dates].sort().reverse());
  });

  it('formats dates the same in every locale', () => {
    expect(changelogDate('2026-10-10')).toBe('10 Oct 2026');
    expect(changelogDate('2027-01-03')).toBe('3 Jan 2027');
  });
});
