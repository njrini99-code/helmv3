/**
 * Class-schedule parser: the formats students actually paste.
 *
 * Every case here failed when the parser was stressed across formats on
 * 2026-08-13. They are cheap to assert and each one corresponded to wrong data
 * reaching the calendar, so they are pinned rather than left to be rediscovered.
 */

import { describe, it, expect } from 'vitest';
import { parseScheduleText } from '@/lib/utils/schedule-parser';

const only = (text: string) => {
  const out = parseScheduleText(text);
  expect(out.length).toBeGreaterThan(0);
  return out[0]!;
};

describe('schedule parser — delimited exports keep the end time', () => {
  /**
   * Delimited exports put start and end in SEPARATE columns. The single-time
   * branch was guarded on `!classData.start_time`, so the first column set the
   * start and the second was dropped — every tab/CSV/pipe schedule produced a
   * class with no end time, which syncs as a zero-duration calendar event.
   */
  it('tab-delimited', () => {
    const c = only('CHEM 1110\tGeneral Chemistry\tMWF\t8:00 AM\t8:50 AM\tChem 101');
    expect(c.start_time).toBe('08:00');
    expect(c.end_time).toBe('08:50');
  });

  it('comma-delimited, PM times', () => {
    const c = only('PSYC 1030,Intro to Psychology,MW,2:00 PM,3:15 PM,Psych 140');
    expect(c.start_time).toBe('14:00');
    expect(c.end_time).toBe('15:15');
  });

  it('pipe-delimited', () => {
    const c = only('ACCT 2110 | Principles of Accounting | TR | 9:30 AM | 10:45 AM | Business 305');
    expect(c.start_time).toBe('09:30');
    expect(c.end_time).toBe('10:45');
  });

  /** A range in ONE column still works — the original path, not a regression. */
  it('single-column time range is unaffected', () => {
    const c = only('BIOL 1010  Introduction to Biology  MWF  9:05 AM - 9:55 AM  Science Hall 210');
    expect(c.start_time).toBe('09:05');
    expect(c.end_time).toBe('09:55');
  });
});

describe('schedule parser — space-separated weekday names', () => {
  /**
   * FULL_DAY_RE's separator class was `[/,&]`, so "Monday Wednesday Friday"
   * matched only "Monday" and the class was saved Monday-only — two thirds of
   * its meetings silently missing from the calendar.
   */
  it('"Monday Wednesday Friday" is all three days', () => {
    const c = only('PHYS 2110  University Physics  Monday Wednesday Friday  13:00 - 13:50  Physics 200');
    expect(c.days).toEqual(['M', 'W', 'F']);
  });

  it('comma and slash separators still work', () => {
    expect(only('KINE 1164\nWeight Training\nMon, Wed\n7:00 AM - 7:50 AM').days).toEqual(['M', 'W']);
    expect(only('ART 1010  Drawing  Tuesday/Thursday  10:00 AM - 11:15 AM').days).toEqual(['T', 'Th']);
  });

  /** Non-vacuity: a lone day must NOT be widened. */
  it('a single weekday stays a single day', () => {
    expect(only('LAB 1010  Chemistry Lab  Thursday  2:00 PM - 4:50 PM').days).toEqual(['Th']);
  });
});

describe('schedule parser — a stated term beats the date guess', () => {
  /**
   * parseMultiLineFormat took `semester` as a parameter and never wrote it onto
   * the class, so a schedule that names its own term came back with
   * semester:'' and the caller fell back to detectSemester(''), a guess from
   * whatever day the import ran. That guess is what produced three-day
   * semesters in production.
   */
  it('keeps "Fall 2026" from the document heading', () => {
    const c = only('Fall 2026 Schedule\nBIOL 1010  Introduction to Biology  MWF  9:05 AM - 9:55 AM');
    expect(c.semester).toBe('Fall 2026');
  });

  it('keeps a term for a year that is not the current one', () => {
    const c = only('Spring 2027\nCHEM 1110  General Chemistry  MWF  8:00 AM - 8:50 AM');
    expect(c.semester).toBe('Spring 2027');
  });
});

describe('schedule parser — junk in, nothing out', () => {
  it.each(['', '   ', 'Hello world', '???', 'Name: Cole Bennett\nMajor: Biology'])(
    'invents no classes from %j',
    (junk) => {
      expect(parseScheduleText(junk)).toEqual([]);
    },
  );
});
