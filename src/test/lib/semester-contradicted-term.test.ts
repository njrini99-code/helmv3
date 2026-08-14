/**
 * A term label that the class's own start date contradicts.
 *
 * Reproduced from production on 2026-08-13. Four class series in
 * `golf_player_classes` had generated between one and two calendar meetings
 * each, and 26 of 30 synced series carried a null `semester`.
 *
 * The chain: a player imports a schedule screenshot on 6 August. The row stores
 * no term, so every downstream read falls back to `detectSemester('')`, which
 * is a pure function of today's date and returns "Summer 2026" — 6 August is
 * still inside the summer window. The vision parser DID read a real start date
 * off the screenshot: 12 August, the first day of the player's FALL classes.
 * parseSemesterDates then honoured the custom start and the summer end, and
 * produced { 2026-08-12 -> 2026-08-15 }: a three-day semester. The player added
 * their entire fall schedule and saw almost nothing on their calendar.
 *
 * The start date is the stronger evidence — it was read off the schedule, while
 * the label was inferred from whatever day the import happened to run.
 */

import { describe, it, expect } from 'vitest';
import { parseSemesterDates } from '@/lib/golf/semester';

describe('parseSemesterDates — start date contradicting the term label', () => {
  it('overrules a Summer label when the start date is a Fall start (the production case)', () => {
    // Exactly what ran on 2026-08-06 for SPAN-202-F2F / BA-307-BLD1.
    const window = parseSemesterDates('Summer 2026', '2026-08-12');

    expect(window).not.toBeNull();
    expect(window?.start).toBe('2026-08-12');
    // Fall's end, not Summer's 2026-08-15.
    expect(window?.end).toBe('2026-12-15');
  });

  /**
   * Non-vacuity guard. Without this, the assertion above would still pass on an
   * implementation that ignored the label entirely and always used Fall.
   */
  it('leaves a term alone when the start date sits plausibly inside it', () => {
    const window = parseSemesterDates('Summer 2026', '2026-06-03');

    expect(window?.start).toBe('2026-06-03');
    expect(window?.end).toBe('2026-08-15');
  });

  it('leaves the default window alone when no start date is supplied', () => {
    // No custom start means no contradiction to detect — the label is all the
    // information there is, so it must be trusted verbatim.
    expect(parseSemesterDates('Summer 2026')).toEqual({
      start: '2026-06-01',
      end: '2026-08-15',
    });
  });

  it('carries a January start into the prior December’s winter term', () => {
    // Winter spans the year boundary, so the containing term for 5 January 2026
    // is Winter 2025 (15 Dec 2025 -> 15 Jan 2026) — but that leaves only ten
    // days, so Spring 2026 is the plausible answer.
    const window = parseSemesterDates('Winter 2025', '2026-01-05');

    expect(window?.start).toBe('2026-01-05');
    expect(window?.end).toBe('2026-05-15');
  });

  it('still rejects a start date outside the term year entirely', () => {
    // The DS-B4 range check must survive the new branch: a year-0001 start on a
    // Fall term previously produced a five-century occurrence walk.
    expect(parseSemesterDates('Fall 2026', '0001-01-01')).toBeNull();
  });

  it('returns null for an unparseable term regardless of start date', () => {
    expect(parseSemesterDates('', '2026-08-12')).toBeNull();
    expect(parseSemesterDates('Autumn 2026', '2026-08-12')).toBeNull();
  });

  /**
   * A KNOWN AND ACCEPTED tradeoff, pinned here so it is a decision rather than
   * a surprise.
   *
   * A start date of 10 December leaves the labelled Fall term five days, which
   * trips the same contradiction check, and the soonest term with real time
   * left is Winter (15 Dec -> 15 Jan). So the class is extended across the
   * winter break instead of ending with the term.
   *
   * That is the wrong answer for a genuinely late Fall addition, and it is
   * accepted because the two cases are indistinguishable from a start date
   * alone: 12 August before a 20 August Fall and 10 December before a 15
   * December Winter have identical shape. The August case is the one that
   * actually happens — schedules get imported at the START of a term, which is
   * when this feature is used at all, and it is the failure four production
   * series hit. The December case costs some phantom break-week meetings the
   * player can delete; the August case cost them their entire semester.
   *
   * If a real late-term import ever shows up, the fix is a term hint carried
   * from the screenshot rather than a cleverer date heuristic.
   */
  it('extends a late-Fall start into Winter (accepted tradeoff, see comment)', () => {
    const window = parseSemesterDates('Fall 2026', '2026-12-10');

    expect(window?.start).toBe('2026-12-10');
    expect(window?.end).toBe('2027-01-15');
  });
});
