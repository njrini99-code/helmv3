import { describe, expect, it } from 'vitest';
import { flipSign } from '../GoalSheet';

describe('a negative strokes gained target', () => {
  it('flips the sign the decimal pad can’t type (MOB-STATS-1)', () => {
    expect(flipSign('0.5')).toBe('-0.5');
    expect(flipSign('-0.5')).toBe('0.5');
    expect(flipSign('')).toBe('-');
  });
});
