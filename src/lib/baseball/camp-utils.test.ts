/**
 * Regression tests for camp capacity counting (#443) and date display (#447).
 */
import { describe, it, expect } from 'vitest';
import { activeCampCountsByCamp, isActiveCampRegistration, formatCampDate } from './camp-utils';

describe('activeCampCountsByCamp — excludes cancelled (#443)', () => {
  it('counts only non-cancelled registrations per camp', () => {
    const counts = activeCampCountsByCamp([
      { camp_id: 'a', status: 'registered' },
      { camp_id: 'a', status: 'confirmed' },
      { camp_id: 'a', status: 'attended' },
      { camp_id: 'a', status: 'cancelled' },
      { camp_id: 'b', status: 'registered' },
    ]);
    expect(counts.get('a')).toBe(3);
    expect(counts.get('b')).toBe(1);
  });

  it('drops the count when a registration is cancelled', () => {
    const before = activeCampCountsByCamp([
      { camp_id: 'a', status: 'registered' },
      { camp_id: 'a', status: 'registered' },
    ]);
    const after = activeCampCountsByCamp([
      { camp_id: 'a', status: 'registered' },
      { camp_id: 'a', status: 'cancelled' },
    ]);
    expect(before.get('a')).toBe(2);
    expect(after.get('a')).toBe(1);
  });

  it('treats a missing status as active (registration exists)', () => {
    expect(isActiveCampRegistration(null)).toBe(true);
    expect(isActiveCampRegistration('cancelled')).toBe(false);
  });
});

describe('formatCampDate — local-noon anchor (#447)', () => {
  it('renders the stored day (not the prior day) for date-only values', () => {
    // Anchored at local noon, so no timezone west of UTC can roll it back a day.
    expect(formatCampDate('2026-07-15')).toBe('Jul 15, 2026');
  });

  it('honors custom options (e.g. weekday on the detail page)', () => {
    const out = formatCampDate('2026-07-15', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    expect(out).toContain('Jul 15');
    expect(out).toContain('2026');
  });
});
