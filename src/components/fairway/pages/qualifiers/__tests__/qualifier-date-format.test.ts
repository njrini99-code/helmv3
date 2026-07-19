/**
 * Regression test for P30/P126 — a qualifier's date-only string
 * ("YYYY-MM-DD") rendered one calendar day off depending on which page it was
 * viewed from, and produced a hydration mismatch (#418) between server and
 * client.
 *
 * Root cause: `new Date(dateStr)` parses a date-only string as UTC midnight;
 * formatting it back with `toLocaleDateString` in a timezone BEHIND UTC (any
 * US zone) reads the prior calendar day. Because the server (commonly UTC)
 * and the browser (the viewer's local zone) can disagree on which day that
 * UTC instant falls on, React also throws a hydration mismatch for the very
 * same call site.
 *
 * Fix: parse the Y/M/D components directly and construct a **local** Date
 * (`new Date(y, m - 1, d)`), so the same wall-clock date renders identically
 * regardless of which zone reads it back — on EVERY surface that shows a
 * qualifier's date (Qualifiers list, Qualifier Detail, My Qualifiers).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { formatDate as formatDateOnQualifiersList } from '../FairwayQualifiers';
import { formatDate as formatDateOnDetail } from '../FairwayQualifierDetail';
import { formatDate as formatDateOnMyQualifiers } from '../../my-qualifiers/FairwayMyQualifiers';

const FIXED_DATE = '2026-07-16';
const EXPECTED = 'Jul 16, 2026';

// Any US zone (behind UTC) is where `new Date(dateStr)` reads a date-only
// string back as the PRIOR calendar day — the exact regression this guards.
const WESTERN_TIMEZONES = ['America/Los_Angeles', 'America/New_York', 'Pacific/Honolulu'];

describe('qualifier date formatting agrees across every surface (P30/P126)', () => {
  const originalTZ = process.env.TZ;

  afterEach(() => {
    process.env.TZ = originalTZ;
  });

  it.each(WESTERN_TIMEZONES)(
    'renders the same calendar day in %s as in UTC — never one day behind',
    (tz) => {
      process.env.TZ = tz;
      expect(formatDateOnQualifiersList(FIXED_DATE)).toBe(EXPECTED);
      expect(formatDateOnDetail(FIXED_DATE)).toBe(EXPECTED);
      expect(formatDateOnMyQualifiers(FIXED_DATE)).toBe(EXPECTED);
    },
  );

  it('all three surfaces agree with each other for the same input, in UTC too', () => {
    process.env.TZ = 'UTC';
    const a = formatDateOnQualifiersList(FIXED_DATE);
    const b = formatDateOnDetail(FIXED_DATE);
    const c = formatDateOnMyQualifiers(FIXED_DATE);
    expect(a).toBe(EXPECTED);
    expect(b).toBe(EXPECTED);
    expect(c).toBe(EXPECTED);
  });

  it('FairwayQualifierDetail.formatDate honors a null date as an em-dash', () => {
    expect(formatDateOnDetail(null)).toBe('—');
  });
});
