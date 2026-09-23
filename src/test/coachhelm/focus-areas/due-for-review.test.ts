/**
 * Pkg 9 slice 4 — `focusAreaDueReason` / `computeDueFocusAreas` boundaries.
 */
import { describe, it, expect } from 'vitest';
import {
  focusAreaDueReason,
  computeDueFocusAreas,
  FOCUS_AREA_DUE_WITHIN_DAYS_DEFAULT,
} from '@/lib/coachhelm/focus-areas/due-for-review';

// Fixed "today" so every test is deterministic regardless of when it runs.
const TODAY = new Date('2026-09-23T12:00:00.000Z');

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
    expect(focusAreaDueReason(area({ target_date: '2026-09-22' }), { today: TODAY })).toBe('overdue');
  });

  it('is due_soon when target_date is exactly today (inclusive lower boundary)', () => {
    expect(focusAreaDueReason(area({ target_date: '2026-09-23' }), { today: TODAY })).toBe('due_soon');
  });

  it('is due_soon at exactly the dueWithinDays boundary (inclusive upper boundary)', () => {
    // default window is 7 days -> 2026-09-30 is the last due_soon day
    expect(
      focusAreaDueReason(area({ target_date: '2026-09-30' }), { today: TODAY }),
    ).toBe('due_soon');
  });

  it('is not due one day past the dueWithinDays boundary', () => {
    expect(focusAreaDueReason(area({ target_date: '2026-10-01' }), { today: TODAY })).toBeNull();
  });

  it('honors a custom dueWithinDays window', () => {
    expect(
      focusAreaDueReason(area({ target_date: '2026-09-25' }), { today: TODAY, dueWithinDays: 1 }),
    ).toBeNull();
    expect(
      focusAreaDueReason(area({ target_date: '2026-09-24' }), { today: TODAY, dueWithinDays: 1 }),
    ).toBe('due_soon');
  });

  it('defaults dueWithinDays to FOCUS_AREA_DUE_WITHIN_DAYS_DEFAULT', () => {
    expect(FOCUS_AREA_DUE_WITHIN_DAYS_DEFAULT).toBe(7);
  });

  it('ignores target_kind "rounds" areas — deferred, not due', () => {
    expect(
      focusAreaDueReason(area({ target_kind: 'rounds', target_date: '2026-09-22' }), { today: TODAY }),
    ).toBeNull();
  });

  it('ignores a null target_kind (no timeframe set)', () => {
    expect(
      focusAreaDueReason(area({ target_kind: null, target_date: '2026-09-22' }), { today: TODAY }),
    ).toBeNull();
  });

  it('ignores a missing target_date even when target_kind is "date"', () => {
    expect(
      focusAreaDueReason(area({ target_date: null }), { today: TODAY }),
    ).toBeNull();
  });

  it('never flags a "proposed" area — not yet accepted, no real window', () => {
    expect(
      focusAreaDueReason(area({ status: 'proposed', target_date: '2026-09-22' }), { today: TODAY }),
    ).toBeNull();
  });

  it('never flags a "completed" area', () => {
    expect(
      focusAreaDueReason(area({ status: 'completed', target_date: '2026-09-22' }), { today: TODAY }),
    ).toBeNull();
  });

  it('never flags a "declined" area', () => {
    expect(
      focusAreaDueReason(area({ status: 'declined', target_date: '2026-09-22' }), { today: TODAY }),
    ).toBeNull();
  });

  it('flags "in_progress" and "paused", not just "active"', () => {
    expect(
      focusAreaDueReason(area({ status: 'in_progress', target_date: '2026-09-22' }), { today: TODAY }),
    ).toBe('overdue');
    expect(
      focusAreaDueReason(area({ status: 'paused', target_date: '2026-09-22' }), { today: TODAY }),
    ).toBe('overdue');
  });
});

describe('computeDueFocusAreas', () => {
  it('returns an empty array for an empty input (empty state)', () => {
    expect(computeDueFocusAreas([], { today: TODAY })).toEqual([]);
  });

  it('returns an empty array when nothing in the input is due (empty state)', () => {
    const areas = [
      { id: 'a1', player_id: 'p1', ...area({ status: 'completed', target_date: '2026-09-22' }) },
      { id: 'a2', player_id: 'p2', ...area({ target_kind: 'rounds', target_date: '2026-09-22' }) },
      { id: 'a3', player_id: 'p3', ...area({ target_date: '2026-12-01' }) },
    ];
    expect(computeDueFocusAreas(areas, { today: TODAY })).toEqual([]);
  });

  it('sorts overdue before due_soon, then by soonest target_date within each bucket', () => {
    const areas = [
      { id: 'due-later', player_id: 'p1', ...area({ target_date: '2026-09-29' }) },
      { id: 'overdue-older', player_id: 'p2', ...area({ target_date: '2026-09-10' }) },
      { id: 'due-sooner', player_id: 'p3', ...area({ target_date: '2026-09-24' }) },
      { id: 'overdue-newer', player_id: 'p4', ...area({ target_date: '2026-09-20' }) },
      { id: 'not-due', player_id: 'p5', ...area({ target_date: '2026-12-01' }) },
    ];
    const result = computeDueFocusAreas(areas, { today: TODAY });
    expect(result.map((r) => r.area.id)).toEqual([
      'overdue-older',
      'overdue-newer',
      'due-sooner',
      'due-later',
    ]);
    expect(result.map((r) => r.reason)).toEqual(['overdue', 'overdue', 'due_soon', 'due_soon']);
  });
});
