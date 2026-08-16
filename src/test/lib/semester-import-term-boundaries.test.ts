import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { parseSemesterDates, inferTermForImport } from '@/lib/golf/semester';
import { detectSemester } from '@/lib/utils/schedule-parser';

/**
 * Term selection for an import, day by day across every boundary.
 *
 * THE FAILURE THIS PINS. A schedule pasted with no term of its own gets one
 * inferred from the clock. The inference used its own month buckets, separate
 * from the windows `parseSemesterDates` actually generates, and the two
 * disagreed at the edges: on 15 August it returned "Summer 2026", whose window
 * ENDS 2026-08-15. Every generated meeting was therefore in the past, the
 * calendar stayed empty, and the toast said "Synced to your calendar". Same on
 * 15 May, the last day of spring. Two days a year — both inside an enrolment
 * rush, which is when this feature is actually used.
 *
 * The rule now: never infer a term whose last day is today or earlier, because
 * such a term has no date left to put a meeting on. A term with only a FEW days
 * left is still legitimate (a student really can be in the last week of summer
 * session), so the test walks each boundary day by day rather than asserting a
 * single date.
 */

const at = (iso: string) => vi.setSystemTime(new Date(iso));
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

/** Every window in TERM_WINDOWS, as the source of truth for the assertions. */
const WINDOWS: Record<string, { start: string; end: string }> = {
  'Spring 2026': { start: '2026-01-15', end: '2026-05-15' },
  'Summer 2026': { start: '2026-06-01', end: '2026-08-15' },
  'Fall 2026': { start: '2026-08-20', end: '2026-12-15' },
  'Winter 2026': { start: '2026-12-15', end: '2027-01-15' },
};

describe('parseSemesterDates — the published windows', () => {
  for (const [term, window] of Object.entries(WINDOWS)) {
    it(`${term} -> ${window.start}..${window.end}`, () => {
      expect(parseSemesterDates(term)).toEqual(window);
    });
  }
});

describe('inferTermForImport — never returns a term with no days left', () => {
  // Walks both boundaries a day at a time. The invariant is the point: whatever
  // term comes back, its window must still contain a future date.
  const DAYS_TO_WALK = [
    '2026-05-13', '2026-05-14', '2026-05-15', '2026-05-16', '2026-05-31', '2026-06-01',
    '2026-08-13', '2026-08-14', '2026-08-15', '2026-08-16', '2026-08-19', '2026-08-20',
    '2026-12-14', '2026-12-15', '2026-12-16', '2027-01-14', '2027-01-15', '2027-01-16',
  ];
  for (const today of DAYS_TO_WALK) {
    it(`${today}: the inferred term still has a future date`, () => {
      const term = inferTermForImport(today);
      expect(term, `no term inferred for ${today}`).toBeTruthy();
      const window = parseSemesterDates(term!);
      expect(window, `"${term}" did not parse`).toBeTruthy();
      expect(
        window!.end > today,
        `on ${today} inferred "${term}" ending ${window!.end} — nothing left to schedule`,
      ).toBe(true);
    });
  }

  it('15 May does NOT return Spring, whose window ends that day', () => {
    expect(inferTermForImport('2026-05-15')).not.toBe('Spring 2026');
  });

  it('15 August does NOT return Summer, whose window ends that day', () => {
    expect(inferTermForImport('2026-08-15')).not.toBe('Summer 2026');
  });

  it('14 August still returns Summer — one day left is a real day', () => {
    // Deliberately NOT "a term needs meaningful runway". Narrowing the fix to
    // "no days left" keeps a genuine late-summer import working.
    expect(inferTermForImport('2026-08-14')).toBe('Summer 2026');
  });

  it('the gap between terms rolls forward to the next one', () => {
    // 16-19 August sits after summer ends and before fall begins.
    expect(inferTermForImport('2026-08-17')).toBe('Fall 2026');
  });
});

describe('detectSemester — same rule, reached through the parser', () => {
  it('does not hand back an ended term on 15 August', () => {
    at('2026-08-15T12:00:00Z');
    const term = detectSemester('CHEM 101 MWF 9:00 AM - 9:50 AM');
    const window = parseSemesterDates(term)!;
    expect(window.end > '2026-08-15').toBe(true);
  });

  it('does not hand back an ended term on 15 May', () => {
    at('2026-05-15T12:00:00Z');
    const term = detectSemester('CHEM 101 MWF 9:00 AM - 9:50 AM');
    const window = parseSemesterDates(term)!;
    expect(window.end > '2026-05-15').toBe(true);
  });

  it('a term stated in the document always wins over the clock', () => {
    at('2026-08-15T12:00:00Z');
    expect(detectSemester('Spring 2027 Schedule\nCHEM 101 MWF 9:00 AM')).toBe('Spring 2027');
  });
});

describe('parseSemesterDates — a custom start is bounded by its own term', () => {
  it('a start months BEFORE the label re-derives the term instead of stretching it', () => {
    // ('Fall 2026', '2026-01-20') used to return {2026-01-20 .. 2026-12-15}:
    // a 329-day "Fall" generating ~140 meetings for a ~50-meeting class.
    const window = parseSemesterDates('Fall 2026', '2026-01-20')!;
    const days = (Date.parse(window.end) - Date.parse(window.start)) / 86_400_000;
    expect(days).toBeLessThan(200);
  });

  const NEVER_ABSURD: Array<[string, string]> = [
    ['Fall 2026', '2026-01-20'],
    ['Winter 2026', '2026-06-01'],
    ['Summer 2026', '2026-01-02'],
    ['Spring 2026', '2026-02-01'],
    ['Fall 2026', '2026-09-01'],
  ];
  for (const [term, start] of NEVER_ABSURD) {
    it(`${term} + ${start} stays inside one term's length`, () => {
      const window = parseSemesterDates(term, start);
      expect(window).toBeTruthy();
      const days = (Date.parse(window!.end) - Date.parse(window!.start)) / 86_400_000;
      expect(days).toBeGreaterThan(0);
      // The longest legitimate window is winter's ~120 days plus grace.
      expect(days, `${term} + ${start} produced a ${days}-day term`).toBeLessThanOrEqual(200);
    });
  }

  it('a start that leaves the labelled term nearly over re-derives forward', () => {
    // The pre-existing contradicted-label rule, still intact.
    const window = parseSemesterDates('Spring 2026', '2026-05-10')!;
    expect(window.end > '2026-05-15').toBe(true);
  });

  it('a legitimately early start inside the grace window is kept verbatim', () => {
    const window = parseSemesterDates('Fall 2026', '2026-08-18')!;
    expect(window.start).toBe('2026-08-18');
    expect(window.end).toBe('2026-12-15');
  });
});

describe('parseSemesterDates — rejections', () => {
  const BAD: Array<[string, string | undefined]> = [
    ['Fall 9999', undefined],
    ['Fall 1999', undefined],
    ['', undefined],
    ['Autumn 2026', undefined],
    ['Fall', undefined],
    ['Fall 2026', '0001-01-01'],
    ['Fall 2026', 'not-a-date'],
    ['Fall 2026', '2026-13-45'],
  ];
  for (const [term, start] of BAD) {
    it(`(${JSON.stringify(term)}, ${JSON.stringify(start)}) -> null`, () => {
      expect(parseSemesterDates(term, start)).toBeNull();
    });
  }

  it('null and undefined are rejected without throwing', () => {
    expect(parseSemesterDates(null)).toBeNull();
    expect(parseSemesterDates(undefined)).toBeNull();
  });
});
