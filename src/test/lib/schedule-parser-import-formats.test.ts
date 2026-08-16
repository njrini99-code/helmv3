import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { parseScheduleText, detectSemester } from '@/lib/utils/schedule-parser';

/**
 * Format matrix for the class-schedule importer.
 *
 * WHY A MATRIX. Every defect this file pins was found by feeding a REAL export
 * shape the previous tests did not cover — not by reading the parser. The
 * delimited-export bug (#1446: start and end in separate columns, the second
 * silently discarded) and the four found on 2026-08-15 all hid behind
 * "the one shape the tests happen to use". So the unit of testing here is the
 * SHAPE, and every shape asserts the same expected class, so a format that
 * quietly loses a field fails instead of passing differently.
 *
 * The canonical expectation for the two-class fixtures:
 *   CHEM 101  MWF  09:00–09:50
 *   MATH 220  TR   13:00–14:15
 */

// Pinned so a term-boundary change cannot silently rewrite what these fixtures
// mean. Mid-October is unambiguously Fall for every rule we have had.
const FIXED_NOW = new Date('2026-10-14T12:00:00Z');
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(FIXED_NOW); });
afterEach(() => { vi.useRealTimers(); });

const TWO_CLASS_SHAPES: Array<{ shape: string; text: string }> = [
  {
    shape: 'space-columnar with an inline time range',
    text:
      'CHEM 101 General Chemistry MWF 9:00 AM - 9:50 AM Smith Hall 201\n' +
      'MATH 220 Calculus II TR 1:00 PM - 2:15 PM Wilson 105',
  },
  {
    shape: 'tab-delimited, separate start and end columns (#1446)',
    text:
      'CHEM 101\tGeneral Chemistry\tMWF\t9:00 AM\t9:50 AM\tSmith Hall 201\n' +
      'MATH 220\tCalculus II\tTR\t1:00 PM\t2:15 PM\tWilson 105',
  },
  {
    shape: 'comma-delimited',
    text:
      'CHEM 101,General Chemistry,MWF,9:00 AM,9:50 AM,Smith Hall 201\n' +
      'MATH 220,Calculus II,TR,1:00 PM,2:15 PM,Wilson 105',
  },
  {
    shape: 'pipe-delimited',
    text:
      'CHEM 101 | General Chemistry | MWF | 9:00 AM | 9:50 AM | Smith Hall 201\n' +
      'MATH 220 | Calculus II | TR | 1:00 PM | 2:15 PM | Wilson 105',
  },
  {
    shape: '24-hour clock',
    text:
      'CHEM 101 General Chemistry MWF 09:00 - 09:50 Smith Hall 201\n' +
      'MATH 220 Calculus II TR 13:00 - 14:15 Wilson 105',
  },
  {
    shape: 'long weekday names',
    text:
      'CHEM 101 General Chemistry Monday, Wednesday, Friday 9:00 AM - 9:50 AM\n' +
      'MATH 220 Calculus II Tuesday, Thursday 1:00 PM - 2:15 PM',
  },
  {
    shape: 'tab-delimited WITH a bare Start/End header row',
    text:
      'Course\tTitle\tDays\tStart\tEnd\tRoom\n' +
      'CHEM 101\tGeneral Chemistry\tMWF\t9:00 AM\t9:50 AM\tSmith Hall 201\n' +
      'MATH 220\tCalculus II\tTR\t1:00 PM\t2:15 PM\tWilson 105',
  },
  {
    shape: 'tab-delimited with "Start Time"/"End Time" headers',
    text:
      'Course\tTitle\tDays\tStart Time\tEnd Time\tRoom\n' +
      'CHEM 101\tGeneral Chemistry\tMWF\t9:00 AM\t9:50 AM\tSmith Hall 201\n' +
      'MATH 220\tCalculus II\tTR\t1:00 PM\t2:15 PM\tWilson 105',
  },
];

describe('schedule parser — every export shape yields the same two classes', () => {
  for (const { shape, text } of TWO_CLASS_SHAPES) {
    it(shape, () => {
      const out = parseScheduleText(text);
      expect(out).toHaveLength(2);

      const chem = out.find((c) => c.course_code === 'CHEM 101');
      const math = out.find((c) => c.course_code === 'MATH 220');
      expect(chem, `no CHEM 101 in "${shape}"`).toBeTruthy();
      expect(math, `no MATH 220 in "${shape}"`).toBeTruthy();

      // Days AND end time both present. Each was dropped by a real bug.
      expect(chem!.days).toEqual(['M', 'W', 'F']);
      expect(chem!.start_time).toBe('09:00');
      expect(chem!.end_time).toBe('09:50');

      expect(math!.days).toEqual(['T', 'Th']);
      expect(math!.start_time).toBe('13:00');
      expect(math!.end_time).toBe('14:15');
    });
  }
});

describe('schedule parser — weekday spellings', () => {
  const DAY_CASES: Array<[string, string[]]> = [
    ['MWF', ['M', 'W', 'F']],
    ['MW', ['M', 'W']],
    ['TR', ['T', 'Th']],
    ['TTh', ['T', 'Th']],
    ['TuTh', ['T', 'Th']],
    ['Monday, Wednesday, Friday', ['M', 'W', 'F']],
    ['Tuesday, Thursday', ['T', 'Th']],
    // Three-letter days. These fell through to the character scan, where R is
    // Thursday — and "FRI" contains an R.
    ['Mon, Wed, Fri', ['M', 'W', 'F']],
    ['Mon Wed Fri', ['M', 'W', 'F']],
    ['Mon/Wed/Fri', ['M', 'W', 'F']],
    ['Tue, Thu', ['T', 'Th']],
    ['Mon, Tue, Wed, Thu, Fri', ['M', 'T', 'W', 'Th', 'F']],
    // Compact registrar codes must keep using the character scan, where the
    // R in TR/MTWRF genuinely does mean Thursday.
    ['MTWRF', ['M', 'T', 'W', 'Th', 'F']],
    ['MTWF', ['M', 'T', 'W', 'F']],
    ['F', ['F']],
  ];
  for (const [spelling, expected] of DAY_CASES) {
    it(`"${spelling}" -> ${JSON.stringify(expected)}`, () => {
      const out = parseScheduleText(`MATH 220 Calculus II ${spelling} 1:00 PM - 2:15 PM`);
      expect(out).toHaveLength(1);
      expect(out[0]!.days).toEqual(expected);
      // A day spelling must never cost the times.
      expect(out[0]!.start_time).toBe('13:00');
      expect(out[0]!.end_time).toBe('14:15');
    });
  }
});

describe('schedule parser — no phantom DAYS', () => {
  // A phantom weekday is worse than a missing one: it silently books a
  // recurring event on a day the class never meets, for the whole term.
  const NEVER_THURSDAY = ['Fri', 'Mon, Wed, Fri', 'Mon Wed Fri', 'Friday', 'Wed, Fri'];
  for (const spelling of NEVER_THURSDAY) {
    it(`"${spelling}" does not produce a Thursday`, () => {
      const out = parseScheduleText(`MATH 220 Calculus II ${spelling} 1:00 PM - 2:15 PM`);
      expect(out[0]!.days).not.toContain('Th');
    });
  }

  it('parses no more days than the source names', () => {
    const out = parseScheduleText('MATH 220 Calculus II Mon, Wed, Fri 1:00 PM - 2:15 PM');
    expect(out[0]!.days).toHaveLength(3);
  });
});

describe('schedule parser — no phantom classes', () => {
  it('a location line under a class does not become its own class', () => {
    // COURSE_CODE_RE and LOCATION_RE match the same shape (2-5 letters + 3-4
    // digits), so "Smith Hall 201" parsed as a course and produced a second,
    // empty class called "HALL 201".
    const out = parseScheduleText(
      'CHEM 101 - General Chemistry\n' +
      '  MWF 9:00 AM - 9:50 AM\n' +
      '  Smith Hall 201',
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.course_code).toBe('CHEM 101');
    expect(out[0]!.days).toEqual(['M', 'W', 'F']);
  });

  it('a location line does not become the course NAME either', () => {
    const out = parseScheduleText(
      'CHEM 101 - General Chemistry\n  MWF 9:00 AM - 9:50 AM\n  Smith Hall 201',
    );
    expect(out[0]!.course_name).not.toMatch(/hall/i);
  });

  it('trailing document metadata does not become the course name', () => {
    const out = parseScheduleText(
      'CHEM 101 General Chemistry MWF 9:00 AM - 9:50 AM\n' +
      '\n' +
      'Total credits: 15\n' +
      'Advisor: Dr. Jones',
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.course_name).not.toMatch(/advisor|credits/i);
  });

  it('a header row does not become a class', () => {
    const out = parseScheduleText(
      'Course\tTitle\tDays\tStart\tEnd\tRoom\n' +
      'CHEM 101\tGeneral Chemistry\tMWF\t9:00 AM\t9:50 AM\tSmith Hall 201',
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.course_code).toBe('CHEM 101');
  });

  it('empty and whitespace-only input yield nothing', () => {
    expect(parseScheduleText('')).toEqual([]);
    expect(parseScheduleText('   \n\n  \t \n')).toEqual([]);
  });

  it('prose with no schedule in it yields nothing', () => {
    expect(parseScheduleText('Please see your advisor before registering.')).toEqual([]);
  });

  it('a numbered list still starts classes', () => {
    const out = parseScheduleText(
      '1. CHEM 101 General Chemistry MWF 9:00 AM - 9:50 AM\n' +
      '2. MATH 220 Calculus II TR 1:00 PM - 2:15 PM',
    );
    expect(out.map((c) => c.course_code).sort()).toEqual(['CHEM 101', 'MATH 220']);
  });
});

describe('schedule parser — a class with no meeting pattern is not invented', () => {
  it('an async/online row gets no fabricated days or times', () => {
    const out = parseScheduleText('ENGL 200 Composition ONLINE Asynchronous');
    // It may or may not be surfaced as a class, but it must never claim a
    // meeting pattern that is not in the source — calendar-sync reports such a
    // class as `noMeetings` rather than silently writing nothing.
    for (const c of out) {
      expect(c.days).toEqual([]);
      expect(c.start_time).toBe('');
      expect(c.end_time).toBe('');
    }
  });
});

describe('schedule parser — the stated term wins over the inferred one', () => {
  it('honours a term written in the document', () => {
    const out = parseScheduleText('Fall 2026 Schedule\nCHEM 101 General Chemistry MWF 9:00 AM - 9:50 AM');
    expect(out[0]!.semester).toBe('Fall 2026');
    expect(detectSemester('Fall 2026 Schedule')).toBe('Fall 2026');
  });

  it('falls back to the current academic term when none is stated', () => {
    // FIXED_NOW is mid-October.
    expect(detectSemester('CHEM 101 MWF 9:00 AM')).toBe('Fall 2026');
  });

  it('a stated term with an explicit year beats the clock', () => {
    expect(detectSemester('Spring 2028 Schedule')).toBe('Spring 2028');
  });
});
