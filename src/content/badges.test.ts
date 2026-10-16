import { describe, expect, it } from 'vitest';
import { makeConfig } from '../sim';
import { BADGE_ART, BADGE_ART_SIZE, BADGE_PALETTE, badgeSvg } from './badgeArt';
import { ACHIEVEMENT_IDS, ACHIEVEMENTS, howToEarn, TIERS } from './badges';

describe('badge content (M14)', () => {
  it('five tiers, one per threshold, each with a colour and art', () => {
    expect(TIERS.map((t) => t.tier)).toEqual([1, 2, 3, 4, 5]);
    expect(makeConfig().badges.tierThresholds).toHaveLength(TIERS.length);
    for (const t of TIERS) {
      expect(t.colour).toMatch(/^#[0-9a-f]{6}$/);
      expect(BADGE_ART[t.art]).toBeDefined();
    }
  });

  it('every achievement has a name, a how-to line, and art', () => {
    for (const id of ACHIEVEMENT_IDS) {
      const a = ACHIEVEMENTS[id];
      expect(a.name.length).toBeGreaterThan(2);
      expect(howToEarn(id)).toMatch(/\.$/);
      expect(BADGE_ART[a.art]).toBeDefined();
    }
  });

  it('every grid is 16×16 in known colours', () => {
    for (const [id, rows] of Object.entries(BADGE_ART)) {
      expect(rows, id).toHaveLength(BADGE_ART_SIZE);
      for (const row of rows) {
        expect(row, id).toHaveLength(BADGE_ART_SIZE);
        for (const c of row) expect(c === '.' || c === 'A' || c in BADGE_PALETTE, `${id}: ${c}`).toBe(true);
      }
    }
  });

  it('how-to lines use the tuning numbers', () => {
    const b = makeConfig().badges;
    expect(howToEarn('lightFingers')).toContain(`${b.loosens} times`);
    expect(howToEarn('comeback')).toContain(`${b.comebackDeficit} or more`);
    expect(howToEarn('hatTrick', makeConfig({ badges: { hatTrickGoals: 4 } }))).toContain('Score 4 goals');
  });

  it('draws an SVG with the accent colour', () => {
    const svg = badgeSvg('tierGolden', '#ffa630', 48);
    expect(svg).toMatch(/^<svg [^>]*width="48"/);
    expect(svg).toContain('fill="#ffa630"');
    expect(svg).toContain('crispEdges');
  });
});
