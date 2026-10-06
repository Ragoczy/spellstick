import { describe, expect, it } from 'vitest';
import { makeConfig } from '../src/sim';
import { balanceWarnings, createReport, formatReport, recordMatch } from './report';
import { runMatch } from './runMatch';

describe('headless sim runner', () => {
  it('runs an empty match to the final whistle', () => {
    const config = makeConfig({ match: { periodSeconds: 5 } });
    const stats = runMatch(config, 1);
    expect(stats.ticks).toBe(4 * 5 * 60);
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

  it('flags a spell above 40% of casts', () => {
    const report = createReport();
    report.games = 1;
    report.goals = 10;
    report.spellCasts = { a: 5, b: 3, c: 2 };
    expect(balanceWarnings(report).some((w) => w.startsWith('a is'))).toBe(true);
  });
});
