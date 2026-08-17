/**
 * `relativeDays` renders the "last round …" line under the CoachHelm Brief
 * greeting (`CommandOpening.tsx`, via `ProgramPulse.latest_round_at`).
 *
 * `latest_round_at` is `golf_rounds.round_date` — a Postgres `date`, which
 * PostgREST serializes as a bare `YYYY-MM-DD` with no time-of-day and no
 * offset. `new Date('2026-08-02')` parses that as UTC midnight, so formatting
 * it without pinning the formatter to UTC prints the PREVIOUS calendar day in
 * every timezone west of Greenwich — i.e. all of the United States.
 *
 * Observed in production 2026-08-17 as coach Nick Rini (Demo University Golf):
 * the most recent completed round in `golf_rounds` is `round_date = 2026-08-02`,
 * and the Brief rendered "last round Aug 1". The server (UTC) had rendered
 * "Aug 2" moments earlier, so it is also a hydration mismatch — the string
 * changes under the reader.
 *
 * This is the third instance of the class. `src/lib/golf/date-only.ts` exists
 * precisely for it (its docblock cites #916, where two rounds surfaces
 * disagreed about the same `round_date`); this call site just never used it.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { relativeDays } from '@/components/golf/coachhelm/home/CommandOpening';

/** The real production row: Demo University Golf's most recent round. */
const ROUND_DATE = '2026-08-02';

/** 15 days later — far enough past the `days < 14` branch to hit the formatter. */
const NOW = new Date('2026-08-17T04:00:00Z');

afterEach(() => {
  vi.useRealTimers();
});

describe('relativeDays — date-only values must not shift a day', () => {
  it('renders the calendar day that is actually stored, not the local-zone shift', () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);

    // The stored round_date is 2026-08-02. Whatever zone the reader is in,
    // that is the day the round was played.
    expect(relativeDays(ROUND_DATE)).toBe('Aug 2');
  });

  it('is identical across timezones, so SSR and hydration cannot disagree', () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);

    // A single process cannot switch TZ mid-run, so assert the property that
    // makes cross-zone agreement possible: the output is derived from the
    // string's own digits, never from an ambient-zone read. The suite is run
    // under TZ=UTC, America/New_York, Pacific/Kiritimati (+14) and
    // Pacific/Midway (-11) in CI to cover the rest.
    const formatted = relativeDays(ROUND_DATE);
    expect(formatted).toBe('Aug 2');
    expect(formatted).not.toBe('Aug 1'); // the west-of-UTC failure
    expect(formatted).not.toBe('Aug 3'); // the far-east (+13/+14) failure
  });

  it('still reports recent rounds relatively', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-03T12:00:00Z'));
    expect(relativeDays('2026-08-02')).toBe('yesterday');

    vi.setSystemTime(new Date('2026-08-02T12:00:00Z'));
    expect(relativeDays('2026-08-02')).toBe('today');
  });
});
