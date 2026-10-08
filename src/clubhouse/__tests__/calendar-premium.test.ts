import { describe, expect, it } from 'vitest';
import { focusHour } from '../screens/calendar/model';

/** P006 premium pass: the pure rules behind the Week and Day grids. */

describe('Calendar · open on now (P006-B1)', () => {
  const ev = (date: string, start: number | null, allDay = false) => ({ date, start, allDay });
  const week = ['2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10'];

  it('opens on now when today is on show', () => {
    expect(focusHour(week, [ev('2026-10-08', 15.5)], { date: '2026-10-08', hour: 14.25 })).toBe(14.25);
  });

  it('opens on the first event still ahead when today is not on show', () => {
    const next = ['2026-10-11', '2026-10-12'];
    expect(focusHour(next, [ev('2026-10-12', 9), ev('2026-10-11', 16), ev('2026-10-11', 7, true)], { date: '2026-10-08', hour: 14 })).toBe(16);
  });

  it('falls back to the first timed event on a past week, and to null on an empty one', () => {
    const past = ['2026-09-27', '2026-09-28'];
    expect(focusHour(past, [ev('2026-09-28', 8), ev('2026-09-27', 15)], { date: '2026-10-08', hour: 14 })).toBe(15);
    expect(focusHour(past, [], { date: '2026-10-08', hour: 14 })).toBeNull();
  });
});
