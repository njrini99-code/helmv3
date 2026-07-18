/**
 * Regression tests for src/lib/calendar/timezone.ts — calendar audit W1
 * (cal-tz): event times shifted ~4h and disagreed between the Agenda row and
 * the Event Detail drawer for the SAME event.
 *
 * ROOT CAUSE: the display call sites used date-fns `format(new Date(iso),
 * 'h:mm a')`, which reads the EXECUTING environment's own local timezone.
 * SSR (Vercel Lambda) runs in UTC while the browser (and this team) is
 * America/New_York, so the exact same start_time rendered ~4-5h apart
 * depending on whether the string came from server-rendered HTML or a
 * client re-render — and because those spans were marked
 * `suppressHydrationWarning`, React never patched the mismatch, so the wrong
 * value could stick indefinitely (hence "non-deterministic across reloads").
 *
 * These tests pin a KNOWN UTC start_time to its expected America/New_York
 * wall-clock time, and — critically — assert the result is IDENTICAL no
 * matter what the process's own ambient `TZ` happens to be at call time
 * (simulating a UTC server vs. an ET/PT/JST browser). That's the property
 * the bug violated and the fix guarantees.
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
  formatEventTime,
  formatEventTimeCompact,
  formatEventDateLabel,
  getValidTimezone,
  DEFAULT_TIMEZONE,
} from '@/lib/calendar/timezone';

const ORIGINAL_TZ = process.env.TZ;

describe('formatEventTime — deterministic team-timezone formatting (audit W1)', () => {
  afterEach(() => {
    process.env.TZ = ORIGINAL_TZ;
  });

  // 2026-07-20T22:00:00Z is 6:00 PM in America/New_York during EDT (UTC-4) —
  // the exact ~4h shift the audit reported.
  const JULY_EVENT_UTC = '2026-07-20T22:00:00Z';
  // 2026-01-15T22:00:00Z is 5:00 PM in America/New_York during EST (UTC-5) —
  // pins the DST-correct offset too, not just a fixed -4h.
  const JANUARY_EVENT_UTC = '2026-01-15T22:00:00Z';

  it('formats the known EDT (summer) instant as 6:00 PM', () => {
    expect(formatEventTime(JULY_EVENT_UTC, 'America/New_York')).toBe('6:00 PM');
  });

  it('formats the known EST (winter) instant as 5:00 PM (DST-correct)', () => {
    expect(formatEventTime(JANUARY_EVENT_UTC, 'America/New_York')).toBe('5:00 PM');
  });

  it('is IDENTICAL regardless of the executing process\'s own local timezone', () => {
    // This is the exact bug: `format(new Date(iso), 'h:mm a')` (date-fns,
    // implicit-local) would produce a DIFFERENT string for each of these —
    // 10:00 PM under UTC, 7:00 AM under Asia/Tokyo, 3:00 PM under
    // America/Los_Angeles — for the SAME instant. An explicit `timeZone`
    // must not vary with the ambient TZ at all.
    const ambientZones = ['UTC', 'America/Los_Angeles', 'America/New_York', 'Asia/Tokyo'];
    const results = ambientZones.map((tz) => {
      process.env.TZ = tz;
      return formatEventTime(JULY_EVENT_UTC, 'America/New_York');
    });
    expect(new Set(results).size).toBe(1);
    expect(results[0]).toBe('6:00 PM');
  });

  it('falls back to DEFAULT_TIMEZONE (America/New_York) for a null/missing team timezone', () => {
    expect(formatEventTime(JULY_EVENT_UTC, null)).toBe(
      formatEventTime(JULY_EVENT_UTC, DEFAULT_TIMEZONE),
    );
  });

  it('falls back to DEFAULT_TIMEZONE for an invalid IANA timezone string', () => {
    expect(formatEventTime(JULY_EVENT_UTC, 'Not/AZone')).toBe(
      formatEventTime(JULY_EVENT_UTC, DEFAULT_TIMEZONE),
    );
  });

  it('a different team timezone renders a genuinely different wall-clock time', () => {
    // Guards against a formatter that silently ignores the `timezone` arg
    // and always renders the ambient/default zone.
    expect(formatEventTime(JULY_EVENT_UTC, 'America/Los_Angeles')).toBe('3:00 PM');
  });
});

describe('formatEventTimeCompact — month-grid chip variant', () => {
  it('strips AM/PM (mirrors the previous date-fns `h:mm` output)', () => {
    expect(formatEventTimeCompact('2026-07-20T22:00:00Z', 'America/New_York')).toBe('6:00');
  });
});

describe('formatEventDateLabel — date-line sibling, same determinism guarantee', () => {
  it('anchors the calendar day to the team timezone, not the ambient one', () => {
    // 11:30 PM ET on the 20th is already 03:30 UTC on the 21st — an
    // implicit-local formatter run on a UTC server would report "the 21st".
    const lateEveningEt = '2026-07-21T03:30:00Z';
    expect(formatEventDateLabel(lateEveningEt, 'America/New_York')).toBe('Monday, July 20');
  });
});

describe('getValidTimezone', () => {
  it('passes through a valid IANA zone', () => {
    expect(getValidTimezone('America/Chicago')).toBe('America/Chicago');
  });

  it('degrades an invalid zone to DEFAULT_TIMEZONE, never throws', () => {
    expect(getValidTimezone('nonsense')).toBe(DEFAULT_TIMEZONE);
    expect(getValidTimezone(null)).toBe(DEFAULT_TIMEZONE);
    expect(getValidTimezone(undefined)).toBe(DEFAULT_TIMEZONE);
  });
});
