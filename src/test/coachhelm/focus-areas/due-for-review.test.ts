/**
 * Pkg 9 slice 4 — `focusAreaDueReason` / `computeDueFocusAreas` boundaries.
 *
 * `todayIso` is always an already-resolved `YYYY-MM-DD` string (never a
 * `Date`) — see due-for-review.ts's module doc for why (#1998 review: the
 * original version computed "today" in UTC internally, which read a
 * coach-local `target_date` wrong for hours every evening west of UTC).
 */
import { describe, it, expect } from 'vitest';
import {
  focusAreaDueReason,
  computeDueFocusAreas,
  FOCUS_AREA_DUE_WITHIN_DAYS_DEFAULT,
} from '@/lib/coachhelm/focus-areas/due-for-review';
import { todayIsoInZone } from '@/lib/golf/timezone';

// Fixed "today" so every test is deterministic regardless of when it runs.
const TODAY_ISO = '2026-09-23';

function area(overrides: Partial<{ status: string | null; target_kind: string | null; target_date: string | null }> = {}) {
  return {
    status: 'active',
    target_kind: 'date',
    target_date: '2026-09-23',
    ...overrides,
  };
}

describe('focusAreaDueReason', () => {
  it('is overdue when target_date is before today', () => {
    expect(focusAreaDueReason(area({ target_date: '2026-09-22' }), { todayIso: TODAY_ISO })).toBe('overdue');
  });

  it('is due_soon when target_date is exactly today (inclusive lower boundary)', () => {
    expect(focusAreaDueReason(area({ target_date: '2026-09-23' }), { todayIso: TODAY_ISO })).toBe('due_soon');
  });

  it('is due_soon at exactly the dueWithinDays boundary (inclusive upper boundary)', () => {
    // default window is 7 days -> 2026-09-30 is the last due_soon day
    expect(
      focusAreaDueReason(area({ target_date: '2026-09-30' }), { todayIso: TODAY_ISO }),
    ).toBe('due_soon');
  });

  it('is not due one day past the dueWithinDays boundary', () => {
    expect(focusAreaDueReason(area({ target_date: '2026-10-01' }), { todayIso: TODAY_ISO })).toBeNull();
  });

  it('honors a custom dueWithinDays window', () => {
    expect(
      focusAreaDueReason(area({ target_date: '2026-09-25' }), { todayIso: TODAY_ISO, dueWithinDays: 1 }),
    ).toBeNull();
    expect(
      focusAreaDueReason(area({ target_date: '2026-09-24' }), { todayIso: TODAY_ISO, dueWithinDays: 1 }),
    ).toBe('due_soon');
  });

  it('defaults dueWithinDays to FOCUS_AREA_DUE_WITHIN_DAYS_DEFAULT', () => {
    expect(FOCUS_AREA_DUE_WITHIN_DAYS_DEFAULT).toBe(7);
  });

  it('ignores target_kind "rounds" areas — deferred, not due', () => {
    expect(
      focusAreaDueReason(area({ target_kind: 'rounds', target_date: '2026-09-22' }), { todayIso: TODAY_ISO }),
    ).toBeNull();
  });

  it('ignores a null target_kind (no timeframe set)', () => {
    expect(
      focusAreaDueReason(area({ target_kind: null, target_date: '2026-09-22' }), { todayIso: TODAY_ISO }),
    ).toBeNull();
  });

  it('ignores a missing target_date even when target_kind is "date"', () => {
    expect(
      focusAreaDueReason(area({ target_date: null }), { todayIso: TODAY_ISO }),
    ).toBeNull();
  });

  it('never flags a "proposed" area — not yet accepted, no real window', () => {
    expect(
      focusAreaDueReason(area({ status: 'proposed', target_date: '2026-09-22' }), { todayIso: TODAY_ISO }),
    ).toBeNull();
  });

  it('never flags a "completed" area', () => {
    expect(
      focusAreaDueReason(area({ status: 'completed', target_date: '2026-09-22' }), { todayIso: TODAY_ISO }),
    ).toBeNull();
  });

  it('never flags a "declined" area', () => {
    expect(
      focusAreaDueReason(area({ status: 'declined', target_date: '2026-09-22' }), { todayIso: TODAY_ISO }),
    ).toBeNull();
  });

  it('flags "in_progress" and "paused", not just "active"', () => {
    expect(
      focusAreaDueReason(area({ status: 'in_progress', target_date: '2026-09-22' }), { todayIso: TODAY_ISO }),
    ).toBe('overdue');
    expect(
      focusAreaDueReason(area({ status: 'paused', target_date: '2026-09-22' }), { todayIso: TODAY_ISO }),
    ).toBe('overdue');
  });
});

describe('computeDueFocusAreas', () => {
  it('returns an empty array for an empty input (empty state)', () => {
    expect(computeDueFocusAreas([], { todayIso: TODAY_ISO })).toEqual([]);
  });

  it('returns an empty array when nothing in the input is due (empty state)', () => {
    const areas = [
      { id: 'a1', player_id: 'p1', ...area({ status: 'completed', target_date: '2026-09-22' }) },
      { id: 'a2', player_id: 'p2', ...area({ target_kind: 'rounds', target_date: '2026-09-22' }) },
      { id: 'a3', player_id: 'p3', ...area({ target_date: '2026-12-01' }) },
    ];
    expect(computeDueFocusAreas(areas, { todayIso: TODAY_ISO })).toEqual([]);
  });

  it('sorts overdue before due_soon, then by soonest target_date within each bucket', () => {
    const areas = [
      { id: 'due-later', player_id: 'p1', ...area({ target_date: '2026-09-29' }) },
      { id: 'overdue-older', player_id: 'p2', ...area({ target_date: '2026-09-10' }) },
      { id: 'due-sooner', player_id: 'p3', ...area({ target_date: '2026-09-24' }) },
      { id: 'overdue-newer', player_id: 'p4', ...area({ target_date: '2026-09-20' }) },
      { id: 'not-due', player_id: 'p5', ...area({ target_date: '2026-12-01' }) },
    ];
    const result = computeDueFocusAreas(areas, { todayIso: TODAY_ISO });
    expect(result.map((r) => r.area.id)).toEqual([
      'overdue-older',
      'overdue-newer',
      'due-sooner',
      'due-later',
    ]);
    expect(result.map((r) => r.reason)).toEqual(['overdue', 'overdue', 'due_soon', 'due_soon']);
  });
});

/**
 * #1998 review — the actual bug: a UTC-based "today" read a coach-local
 * `target_date` wrong for hours every evening west of UTC. These tests
 * exercise the FULL fixed path — `todayIsoInZone` resolving an explicit IANA
 * zone, feeding straight into `focusAreaDueReason` — with a UTC instant late
 * enough in the evening that the old `new Date()`-in-UTC bug would have
 * already rolled over to the next UTC day.
 */
describe('timezone integration (#1998 review — evening-US-time regression)', () => {
  // 2026-09-24T02:00:00Z is 7:00 PM on 2026-09-23 in America/Los_Angeles
  // (PDT, UTC-7) — the exact kind of instant the old UTC-day comparison got
  // wrong: UTC has already rolled over to the 24th while it's still the
  // evening of the 23rd on the West Coast.
  const EVENING_PACIFIC_UTC_INSTANT = new Date('2026-09-24T02:00:00.000Z');

  it('todayIsoInZone resolves the LOCAL calendar day, not the UTC day, for an evening Pacific instant', () => {
    const todayIso = todayIsoInZone('America/Los_Angeles', EVENING_PACIFIC_UTC_INSTANT);
    expect(todayIso).toBe('2026-09-23');
    // Sanity: the naive UTC read (the old, buggy behavior) would have said the 24th.
    expect(EVENING_PACIFIC_UTC_INSTANT.toISOString().slice(0, 10)).toBe('2026-09-24');
  });

  it('an area due TODAY (Pacific) is due_soon, never overdue, at 7pm Pacific', () => {
    const todayIso = todayIsoInZone('America/Los_Angeles', EVENING_PACIFIC_UTC_INSTANT);
    const reason = focusAreaDueReason(area({ target_date: '2026-09-23' }), { todayIso });
    expect(reason).toBe('due_soon');
    expect(reason).not.toBe('overdue');
  });

  it('a genuinely overdue area (due yesterday, Pacific) is still overdue at 7pm Pacific', () => {
    const todayIso = todayIsoInZone('America/Los_Angeles', EVENING_PACIFIC_UTC_INSTANT);
    expect(
      focusAreaDueReason(area({ target_date: '2026-09-22' }), { todayIso }),
    ).toBe('overdue');
  });

  it('the same instant resolves a DIFFERENT (correct) calendar day for an east-of-UTC zone', () => {
    // At 2026-09-24T02:00Z it's already 2026-09-24 10:00 in Europe/London.
    const londonToday = todayIsoInZone('Europe/London', EVENING_PACIFIC_UTC_INSTANT);
    expect(londonToday).toBe('2026-09-24');
    expect(
      focusAreaDueReason(area({ target_date: '2026-09-23' }), { todayIso: londonToday }),
    ).toBe('overdue');
  });
});
