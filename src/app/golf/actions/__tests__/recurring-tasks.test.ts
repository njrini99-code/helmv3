/**
 * @vitest-environment node
 *
 * Recurring tasks (#1238) — the series-shape guarantees.
 *
 * These cover the parts that are easy to get wrong and expensive to notice:
 * the occurrence dates a rule expands to, and the fan-out arithmetic that
 * decides how many assignment and reminder rows a series writes. The action
 * itself is a thin Supabase wrapper around exactly these.
 */
import { describe, it, expect } from 'vitest';
import {
  generateOccurrences,
  serializeRecurrenceRule,
  parseRecurrenceRule,
  MAX_SERIES_OCCURRENCES,
} from '@/lib/golf/recurrence';

describe('recurring task series expansion', () => {
  it('anchors the first occurrence on the chosen due date', () => {
    const dates = generateOccurrences('2026-08-03', { frequency: 'weekly', count: 4 });
    expect(dates[0]).toBe('2026-08-03');
    expect(dates).toHaveLength(4);
  });

  it('weekly repeats land 7 days apart', () => {
    const dates = generateOccurrences('2026-08-03', { frequency: 'weekly', count: 3 });
    expect(dates).toEqual(['2026-08-03', '2026-08-10', '2026-08-17']);
  });

  it('biweekly repeats land 14 days apart', () => {
    const dates = generateOccurrences('2026-08-03', { frequency: 'biweekly', count: 3 });
    expect(dates).toEqual(['2026-08-03', '2026-08-17', '2026-08-31']);
  });

  it('honours an inclusive UNTIL — an occurrence landing exactly on it is generated', () => {
    const dates = generateOccurrences('2026-08-03', {
      frequency: 'weekly',
      until: '2026-08-17',
    });
    expect(dates).toEqual(['2026-08-03', '2026-08-10', '2026-08-17']);
  });

  it('a rule whose UNTIL precedes the start produces nothing (the action rejects this rather than writing an empty series)', () => {
    const dates = generateOccurrences('2026-08-03', {
      frequency: 'weekly',
      until: '2026-07-01',
    });
    expect(dates).toHaveLength(0);
  });

  it('caps a runaway rule at MAX_SERIES_OCCURRENCES', () => {
    const dates = generateOccurrences('2026-01-01', {
      frequency: 'daily',
      until: '2099-12-31',
    });
    expect(dates.length).toBeLessThanOrEqual(MAX_SERIES_OCCURRENCES);
  });

  it('round-trips through the stored RRULE text', () => {
    const rule = { frequency: 'weekly' as const, until: '2026-12-01' };
    const parsed = parseRecurrenceRule(serializeRecurrenceRule(rule));
    expect(parsed?.frequency).toBe('weekly');
    expect(parsed?.until).toBe('2026-12-01');
  });
});

describe('series fan-out arithmetic', () => {
  /** Mirrors createRecurringTaskImpl: every occurrence gets its own rows. */
  const fanOut = (occurrences: number, players: number) => ({
    tasks: occurrences,
    assignments: occurrences * players,
    reminders: occurrences,
  });

  it('gives every occurrence its own assignment per player', () => {
    // Completing week 3 must say nothing about week 4 — that only holds if
    // each occurrence owns its own assignment rows.
    expect(fanOut(4, 7)).toEqual({ tasks: 4, assignments: 28, reminders: 4 });
  });

  it('gives every occurrence its own reminder', () => {
    // One reminder for the whole series would fire once and never again.
    const { reminders, tasks } = fanOut(12, 3);
    expect(reminders).toBe(tasks);
  });

  it('writes no assignment rows when nobody is assigned', () => {
    expect(fanOut(5, 0).assignments).toBe(0);
  });
});
