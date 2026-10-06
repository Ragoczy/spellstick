import { describe, expect, it } from 'vitest';
import { periodLabel, TEXT } from './text';

describe('match text', () => {
  it('labels regulation periods and overtimes', () => {
    expect([1, 2, 3, 4].map((p) => periodLabel(p, 4))).toEqual(['1st', '2nd', '3rd', '4th']);
    expect(periodLabel(5, 4)).toBe('OT');
    expect(periodLabel(6, 4)).toBe('2OT');
  });

  it('describes breaks', () => {
    expect(TEXT.endOfPeriod(2)).toBe('END OF 2ND PERIOD');
    expect(TEXT.nextUp(3, false)).toBe('3rd period coming up');
    expect(TEXT.nextUp(5, true)).toBe('Sudden-death overtime next');
  });
});
