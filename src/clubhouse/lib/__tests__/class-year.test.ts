import { describe, expect, it } from 'vitest';
import { classYearKey, classYearLine, classYearName } from '../class-year';

const NOV_2026 = new Date('2026-11-03T12:00:00Z');
const TZ = 'America/New_York';

describe('classYearKey and classYearName', () => {
  it('names the four years for the season', () => {
    expect([2027, 2028, 2029, 2030].map((y) => classYearKey(y, NOV_2026, TZ))).toEqual(['sr', 'jr', 'so', 'fr']);
    expect(classYearName(2028, NOV_2026, TZ)).toBe('Junior');
  });
  it('past, far and missing years keep the neutral coin, with no label invented', () => {
    for (const y of [2026, 2031, null, undefined]) {
      expect(classYearKey(y, NOV_2026, TZ)).toBeNull();
      expect(classYearName(y, NOV_2026, TZ)).toBeNull();
    }
  });
  it('turns over on 1 August', () => {
    expect(classYearKey(2027, new Date('2026-07-31T16:00:00Z'), TZ)).toBe('jr');
    expect(classYearKey(2027, new Date('2026-08-01T16:00:00Z'), TZ)).toBe('sr');
  });
});

describe('classYearLine', () => {
  it('says each thing once', () => {
    expect(classYearLine('Junior', 2028)).toBe('Junior · Class of 2028');
    expect(classYearLine('Class of 2031', 2031)).toBe('Class of 2031');
    expect(classYearLine(null, 2031)).toBe('Class of 2031');
    expect(classYearLine('Junior', null)).toBe('Junior');
    expect(classYearLine(null, null)).toBeNull();
  });
});
