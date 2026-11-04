import { describe, expect, it } from 'vitest';
import { classYearKey, classYearLine, classYearLineFor, classYearName } from '../class-year';

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

describe('classYearLineFor', () => {
  it('names a year inside the four, and a far class once', () => {
    expect(classYearLineFor(2028, NOV_2026, TZ)).toBe('Junior · Class of 2028');
    expect(classYearLineFor(2031, NOV_2026, TZ)).toBe('Class of 2031');
  });
  it('invents nothing for a past or missing year', () => {
    expect(classYearLineFor(2026, NOV_2026, TZ)).toBeNull();
    expect(classYearLineFor(null, NOV_2026, TZ)).toBeNull();
  });
  it('turns on 1 August on the team calendar', () => {
    expect(classYearLineFor(2027, new Date('2027-08-01T12:00:00Z'), TZ)).toBeNull();
    expect(classYearLineFor(2028, new Date('2027-08-01T12:00:00Z'), TZ)).toBe('Senior · Class of 2028');
  });
});
