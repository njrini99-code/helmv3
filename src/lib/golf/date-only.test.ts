import { describe, it, expect } from 'vitest';
import {
  parseDateOnly,
  dateOnlyToUtcDate,
  formatDateOnly,
  formatDateOnlyWeekdayShort,
  formatDateOnlyWeekdayLong,
  formatDateOnlyShort,
  formatDateOnlyFull,
} from './date-only';

describe('parseDateOnly', () => {
  it('parses a bare YYYY-MM-DD string', () => {
    expect(parseDateOnly('2026-06-02')).toEqual({ year: 2026, month: 6, day: 2 });
  });

  it('parses the leading date out of a full timestamp', () => {
    expect(parseDateOnly('2026-06-02T00:00:00.000Z')).toEqual({ year: 2026, month: 6, day: 2 });
  });

  it('returns null for null/undefined/empty input', () => {
    expect(parseDateOnly(null)).toBeNull();
    expect(parseDateOnly(undefined)).toBeNull();
    expect(parseDateOnly('')).toBeNull();
  });

  it('returns null for garbage input', () => {
    expect(parseDateOnly('not-a-date')).toBeNull();
    expect(parseDateOnly('2026/06/02')).toBeNull();
  });

  it('returns null for an out-of-range month or day', () => {
    expect(parseDateOnly('2026-13-01')).toBeNull();
    expect(parseDateOnly('2026-01-32')).toBeNull();
  });
});

describe('dateOnlyToUtcDate', () => {
  it('anchors at UTC midnight for the given calendar day', () => {
    const d = dateOnlyToUtcDate({ year: 2026, month: 6, day: 2 });
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(5); // 0-indexed
    expect(d.getUTCDate()).toBe(2);
    expect(d.getUTCHours()).toBe(0);
  });
});

describe('formatDateOnly / boundary case — the #916 off-by-one', () => {
  // The exact bug: a naive `new Date('2026-06-02').toLocaleDateString()` (no
  // timeZone pin) parses as UTC midnight, then reads back in the *local*
  // timezone — which prints June 1 anywhere west of UTC (every US zone).
  // Every formatter here must print June 2 regardless of host TZ, because
  // Node/vitest runs these tests in whatever TZ the CI/dev machine has.
  it('formats a first-of-a-run date-only string as the correct calendar day', () => {
    expect(formatDateOnlyShort('2026-06-02')).toBe('Jun 2');
    expect(formatDateOnlyFull('2026-06-02')).toBe('June 2, 2026');
  });

  it('formats the correct weekday for the boundary date (Tuesday, not Monday)', () => {
    // 2026-06-02 is a Tuesday. The reported bug showed "Mon Jun 1" in one
    // surface and "June 2" in the other for this exact date.
    expect(formatDateOnlyWeekdayShort('2026-06-02')).toBe('Tue');
    expect(formatDateOnlyWeekdayLong('2026-06-02')).toBe('Tuesday');
  });

  it('is stable across a full-timestamp variant of the same date', () => {
    expect(formatDateOnlyShort('2026-06-02T00:00:00.000Z')).toBe(
      formatDateOnlyShort('2026-06-02'),
    );
  });

  it('handles a year boundary correctly (Dec 31 never becomes Jan 1 or vice versa)', () => {
    expect(formatDateOnlyFull('2025-12-31')).toBe('December 31, 2025');
    expect(formatDateOnlyFull('2026-01-01')).toBe('January 1, 2026');
  });

  it('falls back to the em dash for unparseable input', () => {
    expect(formatDateOnly(null, { month: 'short', day: 'numeric' })).toBe('—');
    expect(formatDateOnly('garbage', { month: 'short', day: 'numeric' })).toBe('—');
  });

  it('honors a custom fallback string', () => {
    expect(formatDateOnly(null, { month: 'short', day: 'numeric' }, 'N/A')).toBe('N/A');
  });
});
