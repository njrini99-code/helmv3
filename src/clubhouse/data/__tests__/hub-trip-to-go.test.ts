import { describe, expect, it } from 'vitest';
import { formatters, tripToGo } from '../hub';

/**
 * F-12 (audit 2026-11-19): at 22:50 ET on 18 Nov, for a trip leaving 20 Nov at 7:00, Home said "1 d 08 h" and Team Hub
 * "2 days to go". Team Hub now counts as Home does: whole days to the departure time.
 */
describe('Team Hub trip countdown', () => {
  const now = new Date('2026-11-19T03:50:00Z'); // 22:50 on 18 Nov in New York
  const f = formatters('America/New_York', now);
  const today = '2026-11-18';

  it('counts whole days to the departure time, as Home does', () => {
    expect(tripToGo({ departure_date: '2026-11-20', departure_time: '07:00:00' }, f, today)).toBe(1);
  });
  it('counts calendar days when no time is saved', () => {
    expect(tripToGo({ departure_date: '2026-11-20', departure_time: null }, f, today)).toBe(2);
  });
  it('is gone once the trip has left or with no date', () => {
    expect(tripToGo({ departure_date: '2026-11-18', departure_time: '07:00:00' }, f, today)).toBeNull();
    expect(tripToGo({ departure_date: null, departure_time: null }, f, today)).toBeNull();
  });
});
