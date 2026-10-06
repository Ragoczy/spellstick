/**
 * On-screen text for rule callouts and match flow. Plain and functional for now; the
 * announcer's canon exclamations (SPEC §2, §8) arrive in M6 in src/content/announcer.ts.
 */
export const TEXT = {
  faceoff: 'FACEOFF',
  faceoffHint: 'Click when the whistle blows. Jump early and you lose it.',
  whistle: 'WHISTLE!',
  misfire: 'MISFIRE!',
  goal: 'GOAL!',
  goalDisallowed: 'NO GOAL: IN THE CREASE',
  creaseViolation: 'CREASE! TURNOVER',
  shotClockViolation: 'SHOT CLOCK! TURNOVER',
  overtime: 'OVERTIME: NEXT GOAL WINS',
  endOfPeriod: (n: number) => `END OF ${periodName(n).toUpperCase()}`,
  nextUp: (n: number, overtime: boolean) =>
    overtime ? 'Sudden-death overtime next' : `${periodName(n)} coming up`,
  final: 'FINAL',
  finalOvertime: 'FINAL (OT)',
  shotClock: 'SHOT',
} as const;

/** "1st", "2nd", ..., then "OT", "2OT", ... past regulation. */
export function periodLabel(period: number, regulationPeriods: number): string {
  if (period > regulationPeriods) {
    const ot = period - regulationPeriods;
    return ot === 1 ? 'OT' : `${ot}OT`;
  }
  return ordinal(period);
}

function periodName(n: number): string {
  return `${ordinal(n)} period`;
}

function ordinal(n: number): string {
  const suffix =
    n % 10 === 1 && n !== 11
      ? 'st'
      : n % 10 === 2 && n !== 12
        ? 'nd'
        : n % 10 === 3 && n !== 13
          ? 'rd'
          : 'th';
  return `${n}${suffix}`;
}
