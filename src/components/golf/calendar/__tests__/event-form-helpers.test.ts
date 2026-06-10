import { describe, it, expect } from 'vitest';
import {
  computeAttendeeChanges,
  summarizeAttendeeChanges,
  toDateTimeLocalValue,
  weekdayOfDateString,
  buildRecurrenceRule,
  recurrenceFieldsFromRule,
  MIN_RECURRENCE_COUNT,
  MAX_RECURRENCE_COUNT,
  WEEKDAY_OPTIONS,
  type RecurrenceFormFields,
} from '../event-form-helpers';
import { parseRecurrenceRule, serializeRecurrenceRule } from '@/lib/golf/recurrence';

// ---------------------------------------------------------------------------
// computeAttendeeChanges — the audit-#4 fix. Adds = selected − existing,
// removes = existing − selected. Removals must only ever reflect an explicit
// deselect against a hydrated baseline.
// ---------------------------------------------------------------------------

describe('computeAttendeeChanges', () => {
  it('returns empty deltas when selection matches the baseline', () => {
    expect(computeAttendeeChanges(['a', 'b'], ['a', 'b'])).toEqual({
      addAttendeeIds: [],
      removeAttendeeIds: [],
    });
  });

  it('computes adds as selected minus existing', () => {
    expect(computeAttendeeChanges(['a'], ['a', 'b', 'c'])).toEqual({
      addAttendeeIds: ['b', 'c'],
      removeAttendeeIds: [],
    });
  });

  it('computes removes as existing minus selected', () => {
    expect(computeAttendeeChanges(['a', 'b', 'c'], ['b'])).toEqual({
      addAttendeeIds: [],
      removeAttendeeIds: ['a', 'c'],
    });
  });

  it('handles simultaneous adds and removes', () => {
    expect(computeAttendeeChanges(['a', 'b'], ['b', 'c'])).toEqual({
      addAttendeeIds: ['c'],
      removeAttendeeIds: ['a'],
    });
  });

  it('treats an empty selection against a populated baseline as remove-all (explicit deselect)', () => {
    expect(computeAttendeeChanges(['a', 'b'], [])).toEqual({
      addAttendeeIds: [],
      removeAttendeeIds: ['a', 'b'],
    });
  });

  it('treats a populated selection against an empty baseline as add-all', () => {
    expect(computeAttendeeChanges([], ['a', 'b'])).toEqual({
      addAttendeeIds: ['a', 'b'],
      removeAttendeeIds: [],
    });
  });

  it('deduplicates ids on both sides', () => {
    expect(computeAttendeeChanges(['a', 'a'], ['a', 'b', 'b'])).toEqual({
      addAttendeeIds: ['b'],
      removeAttendeeIds: [],
    });
  });

  it('the regression case: editing without touching attendees must never produce removals', () => {
    // The old bug: edit form seeded attendeeIds: [] and the server deleted
    // everyone else. With hydration, existing === selected → no deltas.
    const existing = ['p1', 'p2', 'p3', 'p4', 'p5'];
    const { addAttendeeIds, removeAttendeeIds } = computeAttendeeChanges(existing, [...existing]);
    expect(addAttendeeIds).toHaveLength(0);
    expect(removeAttendeeIds).toHaveLength(0);
  });
});

describe('summarizeAttendeeChanges', () => {
  it('returns null when there is nothing to report', () => {
    expect(summarizeAttendeeChanges({ addAttendeeIds: [], removeAttendeeIds: [] })).toBeNull();
  });

  it('reports adds with singular/plural', () => {
    expect(summarizeAttendeeChanges({ addAttendeeIds: ['a'], removeAttendeeIds: [] })).toBe('1 player added');
    expect(summarizeAttendeeChanges({ addAttendeeIds: ['a', 'b'], removeAttendeeIds: [] })).toBe('2 players added');
  });

  it('reports removes with singular/plural', () => {
    expect(summarizeAttendeeChanges({ addAttendeeIds: [], removeAttendeeIds: ['a'] })).toBe('1 player removed');
    expect(summarizeAttendeeChanges({ addAttendeeIds: [], removeAttendeeIds: ['a', 'b', 'c'] })).toBe('3 players removed');
  });

  it('reports both, adds first', () => {
    expect(
      summarizeAttendeeChanges({ addAttendeeIds: ['a', 'b'], removeAttendeeIds: ['c'] }),
    ).toBe('2 players added · 1 player removed');
  });
});

// ---------------------------------------------------------------------------
// toDateTimeLocalValue — datetime-local prefill in the USER'S local wall
// clock (the old prefill rendered UTC wall-time in a local-time input).
// ---------------------------------------------------------------------------

describe('toDateTimeLocalValue', () => {
  it('returns null for null/undefined/empty', () => {
    expect(toDateTimeLocalValue(null)).toBeNull();
    expect(toDateTimeLocalValue(undefined)).toBeNull();
    expect(toDateTimeLocalValue('')).toBeNull();
  });

  it('returns null for garbage input', () => {
    expect(toDateTimeLocalValue('not-a-date')).toBeNull();
  });

  it('produces the LOCAL wall-clock, matching what new Date() resolves locally', () => {
    const iso = '2026-06-15T22:00:00.000Z';
    const expected = (() => {
      const d = new Date(iso);
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    })();
    expect(toDateTimeLocalValue(iso)).toBe(expected);
  });

  it('emits the YYYY-MM-DDTHH:mm shape datetime-local expects', () => {
    expect(toDateTimeLocalValue('2026-01-02T03:04:00.000Z')).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });

  it('round-trips an offset timestamp consistently with Date parsing', () => {
    const iso = '2026-06-15T18:00:00-04:00';
    const d = new Date(iso);
    const out = toDateTimeLocalValue(iso)!;
    expect(out.startsWith(String(d.getFullYear()))).toBe(true);
    expect(Number(out.slice(11, 13))).toBe(d.getHours());
    expect(Number(out.slice(14, 16))).toBe(d.getMinutes());
  });
});

// ---------------------------------------------------------------------------
// weekdayOfDateString — local-safe weekday (no UTC-midnight shift).
// ---------------------------------------------------------------------------

describe('weekdayOfDateString', () => {
  it('returns the correct local weekday for a plain date string', () => {
    // 2026-06-15 is a Monday in every timezone when parsed as local Y/M/D.
    expect(weekdayOfDateString('2026-06-15')).toBe(1);
    expect(weekdayOfDateString('2026-06-14')).toBe(0); // Sunday
    expect(weekdayOfDateString('2026-06-20')).toBe(6); // Saturday
  });

  it('returns null for malformed input', () => {
    expect(weekdayOfDateString('June 15')).toBeNull();
    expect(weekdayOfDateString('')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// buildRecurrenceRule / recurrenceFieldsFromRule — form ↔ rule mapping.
// ---------------------------------------------------------------------------

function fields(overrides: Partial<RecurrenceFormFields> = {}): RecurrenceFormFields {
  return {
    recurrence: 'weekly',
    recurrenceCount: 10,
    recurrenceWeekdays: [],
    recurrenceEndMode: 'count',
    recurrenceUntil: null,
    ...overrides,
  };
}

describe('buildRecurrenceRule', () => {
  it('returns null when the event does not repeat', () => {
    expect(buildRecurrenceRule(fields({ recurrence: 'none' }), '2026-06-15')).toBeNull();
  });

  it('builds a weekly count rule, defaulting weekdays to the start date weekday', () => {
    const rule = buildRecurrenceRule(fields(), '2026-06-15'); // Monday
    expect(rule).toEqual({ frequency: 'weekly', weekdays: [1], count: 10 });
  });

  it('honors an explicit MWF weekday selection (sorted, deduped, bounds-filtered)', () => {
    const rule = buildRecurrenceRule(
      fields({ recurrenceWeekdays: [5, 1, 3, 3, 9, -1] }),
      '2026-06-15',
    );
    expect(rule?.weekdays).toEqual([1, 3, 5]);
  });

  it('supports biweekly with weekdays', () => {
    const rule = buildRecurrenceRule(
      fields({ recurrence: 'biweekly', recurrenceWeekdays: [2, 4] }),
      '2026-06-15',
    );
    expect(rule).toEqual({ frequency: 'biweekly', weekdays: [2, 4], count: 10 });
  });

  it('does not attach weekdays to daily/monthly rules', () => {
    expect(buildRecurrenceRule(fields({ recurrence: 'daily' }), '2026-06-15')).toEqual({
      frequency: 'daily',
      count: 10,
    });
    expect(buildRecurrenceRule(fields({ recurrence: 'monthly', recurrenceWeekdays: [1] }), '2026-06-15')).toEqual({
      frequency: 'monthly',
      count: 10,
    });
  });

  it('uses until instead of count when end mode is until and a date is set', () => {
    const rule = buildRecurrenceRule(
      fields({ recurrenceEndMode: 'until', recurrenceUntil: '2026-08-15' }),
      '2026-06-15',
    );
    expect(rule?.until).toBe('2026-08-15');
    expect(rule?.count).toBeUndefined();
  });

  it('falls back to count when end mode is until but no date is set', () => {
    const rule = buildRecurrenceRule(
      fields({ recurrenceEndMode: 'until', recurrenceUntil: null }),
      '2026-06-15',
    );
    expect(rule?.count).toBe(10);
    expect(rule?.until).toBeUndefined();
  });

  it('clamps count into the 2–52 band and recovers from NaN', () => {
    expect(buildRecurrenceRule(fields({ recurrenceCount: 0 }), '2026-06-15')?.count).toBe(MIN_RECURRENCE_COUNT);
    expect(buildRecurrenceRule(fields({ recurrenceCount: 999 }), '2026-06-15')?.count).toBe(MAX_RECURRENCE_COUNT);
    expect(buildRecurrenceRule(fields({ recurrenceCount: Number.NaN }), '2026-06-15')?.count).toBe(MIN_RECURRENCE_COUNT);
  });

  it('produces rules that serialize to valid RRULE strings and round-trip through the parser', () => {
    const rule = buildRecurrenceRule(
      fields({ recurrence: 'biweekly', recurrenceWeekdays: [1, 3, 5], recurrenceEndMode: 'until', recurrenceUntil: '2026-08-15' }),
      '2026-06-15',
    )!;
    const serialized = serializeRecurrenceRule(rule);
    expect(serialized).toBe('RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE,FR;UNTIL=20260815');
    expect(parseRecurrenceRule(serialized)).toEqual(rule);
  });
});

describe('recurrenceFieldsFromRule', () => {
  it('maps null to a non-repeating default', () => {
    expect(recurrenceFieldsFromRule(null)).toEqual({
      recurrence: 'none',
      recurrenceCount: 10,
      recurrenceWeekdays: [],
      recurrenceEndMode: 'count',
      recurrenceUntil: null,
    });
  });

  it('maps a count rule onto count mode', () => {
    expect(recurrenceFieldsFromRule({ frequency: 'weekly', weekdays: [3, 1], count: 8 })).toEqual({
      recurrence: 'weekly',
      recurrenceCount: 8,
      recurrenceWeekdays: [1, 3],
      recurrenceEndMode: 'count',
      recurrenceUntil: null,
    });
  });

  it('maps an until rule onto until mode', () => {
    expect(recurrenceFieldsFromRule({ frequency: 'biweekly', until: '2026-08-15' })).toEqual({
      recurrence: 'biweekly',
      recurrenceCount: 10,
      recurrenceWeekdays: [],
      recurrenceEndMode: 'until',
      recurrenceUntil: '2026-08-15',
    });
  });

  it('round-trips with buildRecurrenceRule for a stored series rule', () => {
    const stored = parseRecurrenceRule('RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,WE,FR;COUNT=12')!;
    const formFields = recurrenceFieldsFromRule(stored);
    const rebuilt = buildRecurrenceRule(formFields, '2026-06-15');
    expect(rebuilt).toEqual(stored);
  });
});

describe('WEEKDAY_OPTIONS', () => {
  it('covers Sunday(0) through Saturday(6) in getDay order', () => {
    expect(WEEKDAY_OPTIONS.map((d) => d.value)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(WEEKDAY_OPTIONS[1]).toMatchObject({ short: 'M', long: 'Monday' });
  });
});
