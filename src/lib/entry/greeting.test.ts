/**
 * ============================================================================
 * getGreeting (entry) — 4 sane hour buckets on the baseball demo gate /
 * auth shell, not a "< 12 = morning" scheme that calls 1am "Good morning." (#950)
 * ========================================================================== */
import { describe, expect, it } from 'vitest';
import { getGreeting } from './greeting';

function at(hour: number): Date {
  const d = new Date(2026, 0, 1);
  d.setHours(hour, 0, 0, 0);
  return d;
}

describe('getGreeting (no remembered first name)', () => {
  it('is NOT "Good morning." at 1am — the #950 regression', () => {
    expect(getGreeting(null, at(1))).toBe('Welcome back.');
  });

  it('covers the late-night wraparound (22:00-4:59)', () => {
    expect(getGreeting(null, at(22))).toBe('Welcome back.');
    expect(getGreeting(null, at(0))).toBe('Welcome back.');
    expect(getGreeting(null, at(4))).toBe('Welcome back.');
  });

  it('is morning from 5:00 up to (not including) 11:00', () => {
    expect(getGreeting(null, at(5))).toBe('Good morning.');
    expect(getGreeting(null, at(10))).toBe('Good morning.');
  });

  it('is afternoon from 11:00 up to (not including) 17:00', () => {
    expect(getGreeting(null, at(11))).toBe('Good afternoon.');
    expect(getGreeting(null, at(16))).toBe('Good afternoon.');
  });

  it('is evening from 17:00 up to (not including) 22:00', () => {
    expect(getGreeting(null, at(17))).toBe('Good evening.');
    expect(getGreeting(null, at(21))).toBe('Good evening.');
  });
});

describe('getGreeting (remembered first name)', () => {
  it('always personalizes, regardless of hour — even late at night', () => {
    expect(getGreeting('Nick', at(1))).toBe('Welcome back, Nick.');
    expect(getGreeting('Nick', at(14))).toBe('Welcome back, Nick.');
  });
});
