import { describe, expect, it } from 'vitest';
import { isPlausibleQualifierDate, plausibleQualifierDateBounds } from './qualifier-date';

const TODAY = new Date('2026-09-24T12:00:00Z');

describe('isPlausibleQualifierDate', () => {
  it('accepts near-term dates', () => {
    expect(isPlausibleQualifierDate('2026-10-02', TODAY)).toBe(true);
    expect(isPlausibleQualifierDate('2028-03-01', TODAY)).toBe(true);
    expect(isPlausibleQualifierDate('2025-01-15', TODAY)).toBe(true);
  });

  it('rejects the year-60824 row and other junk', () => {
    expect(isPlausibleQualifierDate('60824-05-01', TODAY)).toBe(false);
    expect(isPlausibleQualifierDate('2029-01-01', TODAY)).toBe(false);
    expect(isPlausibleQualifierDate('1999-12-31', TODAY)).toBe(false);
    expect(isPlausibleQualifierDate('', TODAY)).toBe(false);
    expect(isPlausibleQualifierDate(null, TODAY)).toBe(false);
  });

  it('gives inclusive DB bounds', () => {
    expect(plausibleQualifierDateBounds(TODAY)).toEqual({ from: '2000-01-01', to: '2028-12-31' });
  });
});
