/**
 * ============================================================================
 * getTimeOfDay / getGreeting — 4 sane buckets, not a "< 12 = morning" 3-bucket
 * scheme that calls 1am "Good morning" (#950).
 * ========================================================================== */
import { describe, expect, it } from 'vitest';
import { getGreeting, getTimeOfDay, timeOfDayForHour } from './time-of-day';

function at(hour: number): Date {
  const d = new Date(2026, 0, 1);
  d.setHours(hour, 0, 0, 0);
  return d;
}

describe('getTimeOfDay', () => {
  it('is late night at 1am — NOT morning (the #950 regression)', () => {
    expect(getTimeOfDay(at(1))).toBe('lateNight');
  });

  it('covers the late-night wraparound (22:00-4:59)', () => {
    expect(getTimeOfDay(at(22))).toBe('lateNight');
    expect(getTimeOfDay(at(23))).toBe('lateNight');
    expect(getTimeOfDay(at(0))).toBe('lateNight');
    expect(getTimeOfDay(at(4))).toBe('lateNight');
  });

  it('is morning from 5:00 up to (not including) 11:00', () => {
    expect(getTimeOfDay(at(5))).toBe('morning');
    expect(getTimeOfDay(at(10))).toBe('morning');
  });

  it('is afternoon from 11:00 up to (not including) 17:00', () => {
    expect(getTimeOfDay(at(11))).toBe('afternoon');
    expect(getTimeOfDay(at(16))).toBe('afternoon');
  });

  it('is evening from 17:00 up to (not including) 22:00', () => {
    expect(getTimeOfDay(at(17))).toBe('evening');
    expect(getTimeOfDay(at(21))).toBe('evening');
  });
});

describe('timeOfDayForHour — the decimal-hour variant used by tz-aware callers', () => {
  it('is late night just after midnight, at a fractional hour', () => {
    expect(timeOfDayForHour(0.5)).toBe('lateNight');
  });

  it('is afternoon at a fractional hour (e.g. 14.5 = 2:30pm)', () => {
    expect(timeOfDayForHour(14.5)).toBe('afternoon');
  });
});

describe('getGreeting', () => {
  it('maps each bucket to its copy, with a time-neutral late-night line', () => {
    expect(getGreeting('morning')).toBe('Good morning');
    expect(getGreeting('afternoon')).toBe('Good afternoon');
    expect(getGreeting('evening')).toBe('Good evening');
    expect(getGreeting('lateNight')).toBe('Welcome back');
  });
});
