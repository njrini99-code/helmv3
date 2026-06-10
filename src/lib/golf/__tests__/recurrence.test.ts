/**
 * Unit suite for the shared recurrence rule library (2026-06-10 calendar
 * audit, P2 expressiveness + P0 regression guards).
 *
 * Expectations are hand-derived:
 *   - 2026-06-01 is a Monday; June 2026 Mondays: 1, 8, 15, 22, 29.
 *   - 2026-06-29 Mon, 2026-06-30 Tue, 2026-07-01 Wed, 2026-07-03 Fri,
 *     2026-07-06 Mon, 2026-07-08 Wed, 2026-07-10 Fri.
 */
import { describe, it, expect } from 'vitest';
import {
  parseRecurrenceRule,
  serializeRecurrenceRule,
  describeRecurrenceRule,
  generateOccurrences,
  MAX_SERIES_OCCURRENCES,
  DEFAULT_SERIES_OCCURRENCES,
  type RecurrenceRule,
} from '../recurrence';

// ---------------------------------------------------------------------------
// parseRecurrenceRule
// ---------------------------------------------------------------------------

describe('parseRecurrenceRule', () => {
  it('parses the legacy stored format unchanged', () => {
    expect(parseRecurrenceRule('RRULE:FREQ=WEEKLY;INTERVAL=1;COUNT=10')).toEqual({
      frequency: 'weekly',
      count: 10,
    });
    expect(parseRecurrenceRule('RRULE:FREQ=DAILY;INTERVAL=1;COUNT=30')).toEqual({
      frequency: 'daily',
      count: 30,
    });
    expect(parseRecurrenceRule('RRULE:FREQ=MONTHLY;INTERVAL=1;COUNT=6')).toEqual({
      frequency: 'monthly',
      count: 6,
    });
  });

  it('accepts rules without the RRULE: prefix and with lowercase keys', () => {
    expect(parseRecurrenceRule('FREQ=MONTHLY;COUNT=6')).toEqual({ frequency: 'monthly', count: 6 });
    expect(parseRecurrenceRule('freq=weekly;count=4')).toEqual({ frequency: 'weekly', count: 4 });
  });

  it('normalizes FREQ=WEEKLY;INTERVAL=2 to biweekly', () => {
    expect(parseRecurrenceRule('RRULE:FREQ=WEEKLY;INTERVAL=2')).toEqual({ frequency: 'biweekly' });
    expect(parseRecurrenceRule('RRULE:FREQ=WEEKLY;INTERVAL=2;COUNT=8')).toEqual({
      frequency: 'biweekly',
      count: 8,
    });
  });

  it('parses multi-weekday BYDAY into sorted getDay numbers', () => {
    expect(parseRecurrenceRule('RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,WE,FR;COUNT=6')).toEqual({
      frequency: 'weekly',
      weekdays: [1, 3, 5],
      count: 6,
    });
    // Unsorted + duplicate tokens normalize.
    expect(parseRecurrenceRule('RRULE:FREQ=WEEKLY;BYDAY=FR,MO,FR')?.weekdays).toEqual([1, 5]);
  });

  it('parses UNTIL in all three accepted shapes (inclusive ISO date out)', () => {
    expect(parseRecurrenceRule('RRULE:FREQ=WEEKLY;UNTIL=20260815')?.until).toBe('2026-08-15');
    expect(parseRecurrenceRule('RRULE:FREQ=WEEKLY;UNTIL=2026-08-15')?.until).toBe('2026-08-15');
    expect(parseRecurrenceRule('RRULE:FREQ=WEEKLY;UNTIL=20260815T000000Z')?.until).toBe('2026-08-15');
  });

  it('preserves exotic intervals via the interval passthrough', () => {
    expect(parseRecurrenceRule('RRULE:FREQ=WEEKLY;INTERVAL=3;COUNT=4')).toEqual({
      frequency: 'weekly',
      count: 4,
      interval: 3,
    });
  });

  it('returns null for empty / null / FREQ-less strings', () => {
    expect(parseRecurrenceRule(null)).toBeNull();
    expect(parseRecurrenceRule(undefined)).toBeNull();
    expect(parseRecurrenceRule('')).toBeNull();
    expect(parseRecurrenceRule('RRULE:COUNT=5')).toBeNull();
    expect(parseRecurrenceRule('garbage')).toBeNull();
  });

  it('ignores invalid COUNT / INTERVAL / BYDAY values', () => {
    expect(parseRecurrenceRule('RRULE:FREQ=DAILY;COUNT=0')).toEqual({ frequency: 'daily' });
    expect(parseRecurrenceRule('RRULE:FREQ=DAILY;INTERVAL=abc')).toEqual({ frequency: 'daily' });
    expect(parseRecurrenceRule('RRULE:FREQ=WEEKLY;BYDAY=XX')).toEqual({ frequency: 'weekly' });
  });
});

// ---------------------------------------------------------------------------
// serializeRecurrenceRule
// ---------------------------------------------------------------------------

describe('serializeRecurrenceRule', () => {
  it('writes the legacy format for simple rules', () => {
    expect(serializeRecurrenceRule({ frequency: 'weekly', count: 10 })).toBe(
      'RRULE:FREQ=WEEKLY;INTERVAL=1;COUNT=10',
    );
    expect(serializeRecurrenceRule({ frequency: 'daily' })).toBe('RRULE:FREQ=DAILY;INTERVAL=1');
  });

  it('writes biweekly as standard FREQ=WEEKLY;INTERVAL=2', () => {
    expect(
      serializeRecurrenceRule({ frequency: 'biweekly', weekdays: [5, 1, 3], until: '2026-08-15' }),
    ).toBe('RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE,FR;UNTIL=20260815');
  });

  it('round-trips through parseRecurrenceRule', () => {
    const rules: RecurrenceRule[] = [
      { frequency: 'weekly', count: 10 },
      { frequency: 'daily', count: 30 },
      { frequency: 'biweekly', weekdays: [1, 3, 5], until: '2026-08-15' },
      { frequency: 'weekly', weekdays: [2, 4], count: 12 },
      { frequency: 'monthly', count: 6 },
      { frequency: 'weekly', interval: 3, count: 4 },
    ];
    for (const rule of rules) {
      expect(parseRecurrenceRule(serializeRecurrenceRule(rule))).toEqual(rule);
    }
  });
});

// ---------------------------------------------------------------------------
// describeRecurrenceRule
// ---------------------------------------------------------------------------

describe('describeRecurrenceRule', () => {
  it('labels common rules', () => {
    expect(describeRecurrenceRule({ frequency: 'weekly', count: 10 })).toBe('Weekly, 10 times');
    expect(describeRecurrenceRule({ frequency: 'monthly' })).toBe('Monthly');
    expect(describeRecurrenceRule({ frequency: 'daily', count: 1 })).toBe('Daily, once');
    expect(
      describeRecurrenceRule({ frequency: 'biweekly', weekdays: [1, 3, 5], until: '2026-08-15' }),
    ).toBe('Every 2 weeks on Mon, Wed, Fri until Aug 15, 2026');
  });
});

// ---------------------------------------------------------------------------
// generateOccurrences
// ---------------------------------------------------------------------------

describe('generateOccurrences', () => {
  it('expands a plain weekly count rule (legacy behavior)', () => {
    expect(generateOccurrences('2026-06-01', { frequency: 'weekly', count: 3 })).toEqual([
      '2026-06-01',
      '2026-06-08',
      '2026-06-15',
    ]);
  });

  it('expands daily across a month boundary', () => {
    expect(generateOccurrences('2026-06-29', { frequency: 'daily', count: 3 })).toEqual([
      '2026-06-29',
      '2026-06-30',
      '2026-07-01',
    ]);
  });

  it('expands Mon/Wed/Fri correctly across a month boundary', () => {
    expect(
      generateOccurrences('2026-06-29', { frequency: 'weekly', weekdays: [1, 3, 5], count: 6 }),
    ).toEqual(['2026-06-29', '2026-07-01', '2026-07-03', '2026-07-06', '2026-07-08', '2026-07-10']);
  });

  it('skips a start date that does not match the weekday pattern', () => {
    // 2026-06-30 is a Tuesday — first MWF occurrence is Wed Jul 1.
    expect(
      generateOccurrences('2026-06-30', { frequency: 'weekly', weekdays: [1, 3, 5], count: 3 }),
    ).toEqual(['2026-07-01', '2026-07-03', '2026-07-06']);
  });

  it('expands biweekly as a 14-day stride', () => {
    expect(generateOccurrences('2026-06-01', { frequency: 'biweekly', count: 3 })).toEqual([
      '2026-06-01',
      '2026-06-15',
      '2026-06-29',
    ]);
  });

  it('expands biweekly multi-weekday by alternating whole weeks', () => {
    expect(
      generateOccurrences('2026-06-01', { frequency: 'biweekly', weekdays: [1, 3], count: 5 }),
    ).toEqual(['2026-06-01', '2026-06-03', '2026-06-15', '2026-06-17', '2026-06-29']);
  });

  it('treats until as INCLUSIVE', () => {
    expect(generateOccurrences('2026-06-01', { frequency: 'weekly', until: '2026-06-15' })).toEqual([
      '2026-06-01',
      '2026-06-08',
      '2026-06-15',
    ]);
    expect(generateOccurrences('2026-06-01', { frequency: 'weekly', until: '2026-06-14' })).toEqual([
      '2026-06-01',
      '2026-06-08',
    ]);
  });

  it('lets an until-only rule run past the open-ended default budget', () => {
    // 2026-06-01 → 2026-08-01 inclusive = 62 daily occurrences (> 52 default).
    const dates = generateOccurrences('2026-06-01', { frequency: 'daily', until: '2026-08-01' });
    expect(dates).toHaveLength(62);
    expect(dates[0]).toBe('2026-06-01');
    expect(dates[dates.length - 1]).toBe('2026-08-01');
  });

  it('stops at whichever of count / until hits first', () => {
    expect(
      generateOccurrences('2026-06-01', { frequency: 'weekly', count: 2, until: '2026-12-31' }),
    ).toEqual(['2026-06-01', '2026-06-08']);
    expect(
      generateOccurrences('2026-06-01', { frequency: 'weekly', count: 50, until: '2026-06-08' }),
    ).toEqual(['2026-06-01', '2026-06-08']);
  });

  it('applies the historical defaults when no count/until is given', () => {
    expect(generateOccurrences('2026-06-01', { frequency: 'weekly' })).toHaveLength(
      DEFAULT_SERIES_OCCURRENCES,
    );
    // Monthly hits the 12-month horizon first.
    expect(generateOccurrences('2026-06-01', { frequency: 'monthly' })).toHaveLength(12);
  });

  it('hard-caps runaway rules at MAX_SERIES_OCCURRENCES', () => {
    const dates = generateOccurrences('2026-06-01', {
      frequency: 'daily',
      count: 9999,
      until: '2030-01-01',
    });
    expect(dates).toHaveLength(MAX_SERIES_OCCURRENCES);
  });

  it('honors weekly interval passthrough (every 3 weeks)', () => {
    expect(
      generateOccurrences('2026-06-01', { frequency: 'weekly', interval: 3, count: 3 }),
    ).toEqual(['2026-06-01', '2026-06-22', '2026-07-13']);
  });

  it('returns [] for invalid start dates and non-positive budgets', () => {
    expect(generateOccurrences('not-a-date', { frequency: 'weekly', count: 3 })).toEqual([]);
    expect(generateOccurrences('2026-06-01', { frequency: 'daily', count: 0 })).toEqual([]);
  });
});
