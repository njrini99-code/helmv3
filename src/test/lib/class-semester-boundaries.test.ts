/**
 * `detectSemester` must agree with the windows `parseSemesterDates` generates.
 *
 * These two functions are the whole class-calendar contract: the first picks a
 * term string, the second turns it into the date range the sync walks. They
 * lived in different files with no shared constant, and they disagreed.
 *
 * detectSemester bucketed on CALENDAR MONTH — June, July and all of August were
 * "Summer". parseSemesterDates ends Summer on 15 August. So:
 *   - a class added 6 Aug got "Summer <year>", a window closing in 9 days
 *   - a class added 20 Aug got a window that had ALREADY CLOSED, generating
 *     zero future occurrences
 * Both render to the player as "I added my classes and my calendar is empty",
 * with no error anywhere — and late August is precisely when a college roster
 * enters its fall schedule, so this failed at the exact moment it was used.
 *
 * Reported live 2026-08-06.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { detectSemester } from '@/lib/utils/schedule-parser';
import { parseSemesterDates } from '@/lib/golf/semester';

function at(iso: string): void {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(iso));
}

afterEach(() => {
  vi.useRealTimers();
});

describe('detectSemester picks a term whose window has not already closed', () => {
  const DAYS = [
    '2026-01-05', '2026-02-14', '2026-03-30', '2026-04-22',
    '2026-05-10', '2026-05-20', '2026-06-01', '2026-07-15',
    '2026-08-06', '2026-08-14', '2026-08-16', '2026-08-31',
    '2026-09-02', '2026-10-15', '2026-11-30', '2026-12-10',
  ];

  it.each(DAYS)('on %s, the detected term still has days left in it', (day) => {
    at(`${day}T12:00:00Z`);
    const term = detectSemester('');
    const window = parseSemesterDates(term);

    // The term must parse at all — a term string detectSemester can emit but
    // parseSemesterDates rejects would abort the sync outright.
    expect(window, `detectSemester returned "${term}", which parseSemesterDates rejects`).not.toBeNull();

    const end = new Date(`${window!.end}T23:59:59Z`).getTime();
    const now = new Date(`${day}T12:00:00Z`).getTime();
    expect(
      end,
      `on ${day} detectSemester chose "${term}", which ended ${window!.end} — ` +
        `the sync would generate zero future class occurrences`,
    ).toBeGreaterThan(now);
  });

  it('rolls to Fall in the second half of August, not September', () => {
    // The specific boundary that was wrong. Summer's window ends 15 Aug.
    at('2026-08-14T12:00:00Z');
    expect(detectSemester('')).toBe('Summer 2026');
    at('2026-08-16T12:00:00Z');
    expect(detectSemester('')).toBe('Fall 2026');
  });

  it('rolls to Summer in the second half of May, not June', () => {
    // Same class of boundary at the other end: Spring's window ends 15 May.
    at('2026-05-14T12:00:00Z');
    expect(detectSemester('')).toBe('Spring 2026');
    at('2026-05-20T12:00:00Z');
    expect(detectSemester('')).toBe('Summer 2026');
  });

  it('an explicit term in the text still wins over the date', () => {
    // Unchanged behaviour — the parser reads the term off an uploaded schedule.
    at('2026-08-20T12:00:00Z');
    expect(detectSemester('Spring 2027 schedule')).toBe('Spring 2027');
    expect(detectSemester('FALL 2026')).toBe('Fall 2026');
  });

  it('the guard is non-vacuous — the OLD month-only rule fails it', () => {
    // Reproduces the replaced implementation to prove the assertion above has
    // teeth rather than passing on any plausible bucketing.
    const oldRule = (now: Date): string => {
      const y = now.getUTCFullYear();
      const m = now.getUTCMonth();
      if (m >= 0 && m <= 4) return `Spring ${y}`;
      if (m >= 5 && m <= 7) return `Summer ${y}`;
      return `Fall ${y}`;
    };
    const when = new Date('2026-08-20T12:00:00Z');
    const window = parseSemesterDates(oldRule(when));
    expect(window).not.toBeNull();
    // Already over: this is the dead window players were getting.
    expect(new Date(`${window!.end}T23:59:59Z`).getTime()).toBeLessThan(when.getTime());
  });
});
