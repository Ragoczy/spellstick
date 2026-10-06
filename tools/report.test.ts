import { describe, expect, it } from 'vitest';
import { makeConfig } from '../src/sim';
import { balanceWarnings, createReport, formatReport, mergeReports, recordMatch } from './report';
import { runMatch } from './runMatch';

describe('headless sim runner', () => {
  it('runs a match to the final whistle', () => {
    const config = makeConfig({ match: { periodSeconds: 5 } });
    const stats = runMatch(config, 1);
    // Goal pauses stop the clock, so a match lasts at least its regulation time.
    expect(stats.ticks).toBeGreaterThanOrEqual(4 * 5 * 60);
  });

  it('a full 5v5 match has goals, hits, turnovers, and no stuck players', () => {
    for (const seed of [1, 2]) {
      const stats = runMatch(makeConfig(), seed);
      expect(stats.score[0] + stats.score[1]).toBeGreaterThan(0);
      expect(stats.checks).toBeGreaterThan(20);
      expect(stats.possessionChanges).toBeGreaterThan(10);
      expect(stats.shots).toBeGreaterThan(10);
      expect(stats.stuckPlayerIncidents).toBe(0);
    }
  });

  it('the AI casts every spell in full matches (SPEC §7)', () => {
    const casts: Record<string, number> = {};
    for (const seed of [1, 2, 3]) {
      for (const [spell, n] of Object.entries(runMatch(makeConfig(), seed).spellCasts)) {
        casts[spell] = (casts[spell] ?? 0) + n;
      }
    }
    for (const spell of ['hexShove', 'quickstep', 'bentShot', 'ward'])
      expect(casts[spell] ?? 0).toBeGreaterThan(0);
  });

  it('AI teams pick up the ball and nobody gets stuck in short games', () => {
    for (const seed of [1, 2, 3]) {
      const stats = runMatch(makeConfig({ match: { periodSeconds: 30 } }), seed);
      expect(stats.scoops).toBeGreaterThanOrEqual(1);
      expect(stats.stuckPlayerIncidents).toBe(0);
    }
  });

  it('aggregates and formats a report', () => {
    const report = createReport();
    recordMatch(report, { ...runMatch(makeConfig({ match: { periodSeconds: 1 } }), 1), score: [3, 1] });
    expect(report.goals).toBe(4);
    expect(report.homeWins).toBe(1);
    const text = formatReport(report, makeConfig(), { games: 1, baseSeed: 1, elapsedMs: 1 });
    expect(text).toContain('goals per game');
    expect(text).toContain('stuck-player incidents');
  });

  it('merging per-worker reports equals recording everything in one', () => {
    const config = makeConfig({ match: { periodSeconds: 10 } });
    const matches = [1, 2, 3, 4].map((seed) => runMatch(config, seed));
    const whole = createReport();
    matches.forEach((m) => recordMatch(whole, m));
    const a = createReport();
    const b = createReport();
    matches.slice(0, 2).forEach((m) => recordMatch(a, m));
    matches.slice(2).forEach((m) => recordMatch(b, m));
    expect(mergeReports(a, b)).toEqual(whole);
  });

  it('flags a spell above 40% of casts', () => {
    const report = createReport();
    report.games = 1;
    report.goals = 10;
    report.spellCasts = { a: 5, b: 3, c: 2 };
    expect(balanceWarnings(report).some((w) => w.startsWith('a is'))).toBe(true);
  });
});
