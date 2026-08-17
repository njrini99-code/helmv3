/**
 * `formatShortDate` had NO test, and it is a shared helper whose entire purpose
 * is to be reached for by new call sites — its docblock says so: "centralizes
 * the one-liner so call sites reach for the product's actual convention".
 *
 * It formats via `new Date(value)` then `toLocaleDateString('en-US', …)`. For a
 * full timestamp that is correct and is what all three current callers pass
 * (`feed.last_synced_at`, `feed.created_at`, `ev.start_time` — all timestamptz).
 *
 * For a bare `YYYY-MM-DD` it is off by one west of Greenwich, because
 * `new Date('2026-01-05')` is UTC midnight and the formatter renders it in the
 * runtime zone:
 *
 *     TZ=America/New_York
 *     new Date('2026-01-05').toLocaleDateString('en-US', {month:'short', day:'numeric'})
 *       -> 'Jan 4'
 *
 * No current caller passes a date-only value, so this was latent rather than
 * live. It is fixed rather than merely commented because the trap is one import
 * away: `golf_travel_itineraries.departure_date` and `return_date` are both
 * `date` columns, the travel modal already imports this helper (for a
 * timestamp), and the same shape shipped for four months in
 * `task-reminders.ts`, where three sites rendered a task's due date a day early
 * in any non-UTC runtime.
 *
 * Every assertion below is written against the STORED calendar day, so it means
 * the same thing under TZ=UTC, Pacific/Kiritimati (+14) and Pacific/Midway (-11)
 * — the zones that expose the error in both directions.
 */
import { describe, it, expect } from 'vitest';
import { formatShortDate } from '@/lib/golf/format-date';

describe('formatShortDate — a bare date keeps its own calendar day', () => {
  it('formats the day that was stored, not an instant near it', () => {
    expect(formatShortDate('2026-01-05')).toBe('Jan 5');
    expect(formatShortDate('2026-12-31')).toBe('Dec 31');
    expect(formatShortDate('2026-03-01')).toBe('Mar 1');
  });

  it('does not shift across a month boundary', () => {
    // The failure this exists to catch: UTC midnight on the 1st reads as the
    // last day of the previous month anywhere west of Greenwich.
    expect(formatShortDate('2026-07-01')).toBe('Jul 1');
    expect(formatShortDate('2026-01-01')).toBe('Jan 1');
  });
});

describe('formatShortDate — timestamps are unchanged', () => {
  it('renders a Date in the house short style', () => {
    // Locally-constructed so the expectation holds in any runtime zone.
    expect(formatShortDate(new Date(2026, 0, 5, 14, 30))).toBe('Jan 5');
  });

  it('renders an epoch number', () => {
    const d = new Date(2026, 5, 9, 8, 0);
    expect(formatShortDate(d.getTime())).toBe('Jun 9');
  });

  it('keeps the local calendar day of a full ISO timestamp', () => {
    // A real instant carries a zone; the answer is whatever day it is locally,
    // which is the existing behaviour every current caller relies on.
    const iso = new Date(2026, 8, 14, 12, 0).toISOString();
    expect(formatShortDate(iso)).toBe('Sep 14');
  });

  it('uses the en-US house style, not the runtime locale default', () => {
    // The reason the helper exists at all — "Jan 5", never "1/5/2026".
    expect(formatShortDate('2026-01-05')).toMatch(/^[A-Z][a-z]{2} \d{1,2}$/);
  });
});
