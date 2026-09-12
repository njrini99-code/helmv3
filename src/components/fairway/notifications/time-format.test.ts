/**
 * ============================================================================
 * time-format.ts — deterministic, clock-free relative/absolute formatting
 * ----------------------------------------------------------------------------
 * `relativeTimeFrom` used to default `nowMs` to `Date.now()`, so its output
 * depended on the ambient wall clock at call time — a server render and the
 * client's first paint (evaluated moments apart, and never at the exact same
 * instant) could disagree on "3m ago" vs "4m ago" (React #418). The fix makes
 * `nowMs` a required parameter with no internal clock read. These tests pin
 * that the functions are pure: same inputs -> same output, regardless of the
 * real system clock.
 *
 * `fullDateTime` is pinned to explicit `en-US` + `timeZone: 'UTC'` (+
 * `timeZoneName: 'short'`) rather than the runtime's ambient locale/zone, so
 * it also can't silently differ between server and client environments.
 * ========================================================================== */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { relativeTimeFrom, fullDateTime } from './time-format';

describe('relativeTimeFrom', () => {
  it('is pure: identical (iso, nowMs) inputs produce identical output regardless of the real system clock', () => {
    const iso = '2026-08-22T12:00:00.000Z';
    const nowMs = new Date('2026-08-22T12:03:00.000Z').getTime();

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2020-01-01T00:00:00.000Z'));
    const first = relativeTimeFrom(iso, nowMs);

    vi.setSystemTime(new Date('2030-06-15T00:00:00.000Z'));
    const second = relativeTimeFrom(iso, nowMs);
    vi.useRealTimers();

    expect(second).toBe(first);
    expect(first).toBe('3m ago');
  });

  it('buckets seconds/minutes/hours/days/older correctly', () => {
    const iso = '2026-08-22T12:00:00.000Z';
    const base = Date.parse(iso);
    expect(relativeTimeFrom(iso, base + 10_000)).toBe('just now');
    expect(relativeTimeFrom(iso, base + 5 * 60_000)).toBe('5m ago');
    expect(relativeTimeFrom(iso, base + 3 * 60 * 60_000)).toBe('3h ago');
    expect(relativeTimeFrom(iso, base + 2 * 24 * 60 * 60_000)).toBe('2d ago');
    expect(relativeTimeFrom(iso, base + 30 * 24 * 60 * 60_000)).toBe('Aug 22');
  });

  it('returns an empty string for an unparsable date instead of "NaNm ago"', () => {
    expect(relativeTimeFrom('not-a-date', Date.now())).toBe('');
  });
});

describe('fullDateTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('is pure and pinned to en-US/UTC regardless of the real system clock', () => {
    const iso = '2026-09-01T15:00:00.000Z';

    vi.setSystemTime(new Date('2020-01-01T00:00:00.000Z'));
    const first = fullDateTime(iso);

    vi.setSystemTime(new Date('2030-06-15T00:00:00.000Z'));
    const second = fullDateTime(iso);

    expect(second).toBe(first);
    expect(first).toBe('Tue, Sep 1, 2026, 3:00 PM UTC');
  });

  it('returns an empty string for an unparsable date', () => {
    expect(fullDateTime('not-a-date')).toBe('');
  });
});
