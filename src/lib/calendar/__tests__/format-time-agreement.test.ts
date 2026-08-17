/**
 * Two `formatTime` implementations, both feeding the golf calendar, neither
 * tested. They agree on every valid input and diverge on garbage — where one of
 * them invents a time.
 *
 *   lib/calendar/premium-utils.ts   PremiumEventBlock, PlayerRSVPCard
 *   lib/calendar/event-styles.ts    EventCard, MobileEventCard
 *
 * `event-styles` reads its parts with `parts[1] ?? 0`, and `??` only catches
 * null/undefined — `Number('abc')` is NaN, which passes straight through. So an
 * unparseable value does not fall back, it becomes midnight:
 *
 *     formatTime('abc')  ->  '12:00 AM'
 *
 * and an empty string skips the time-only branch entirely and reaches
 * `new Date('')`, which renders to the user as:
 *
 *     formatTime('')     ->  'Invalid Date'
 *
 * `premium-utils` returns the raw string in both cases, which is the honest
 * answer and matches this repo's standing rule against fabricated values — a
 * calendar showing "12:00 AM" for data it could not read is exactly the failure
 * that rule exists to prevent, because 12:00 AM is a time a real event can have.
 *
 * Same class as the ten `formatToPar` copies consolidated in f4bfa3a10: a
 * duplicated helper whose copies drift, found by asking whether they agree
 * rather than whether either one works.
 */
import { describe, it, expect } from 'vitest';
import { formatTime as premium } from '@/lib/calendar/premium-utils';
import { formatTime as styles } from '@/lib/calendar/event-styles';

describe('formatTime — the two calendar implementations agree', () => {
  it('agrees on every well-formed time-only value', () => {
    for (const t of ['00:00', '00:15', '09:30', '12:00', '12:45', '13:05', '23:59', '07:00:00']) {
      expect(styles(t), t).toBe(premium(t));
    }
  });

  it('agrees on a full timestamp', () => {
    // Locally constructed so the expectation holds in any runtime zone.
    const iso = new Date(2026, 4, 12, 15, 30).toISOString();
    expect(styles(iso)).toBe(premium(iso));
  });

  it('does not invent midnight from an unparseable value', () => {
    expect(styles('abc')).not.toBe('12:00 AM');
    expect(styles('abc')).toBe(premium('abc'));
  });

  it('does not render "Invalid Date" to the user for an empty value', () => {
    expect(styles('')).not.toMatch(/Invalid/i);
    expect(styles('')).toBe(premium(''));
  });
});

describe('formatTime — the surviving contract', () => {
  it('renders the 12-hour clock with a padded minute', () => {
    expect(premium('09:30')).toBe('9:30 AM');
    expect(premium('13:05')).toBe('1:05 PM');
  });

  it('renders midnight and noon on the right side of the meridiem', () => {
    expect(premium('00:15')).toBe('12:15 AM');
    expect(premium('12:00')).toBe('12:00 PM');
  });

  it('hands back what it was given rather than guessing', () => {
    expect(premium('abc')).toBe('abc');
    expect(premium('')).toBe('');
    expect(premium(null)).toBe('');
  });

  it('does not render a NaN minute', () => {
    // The guard checked isNaN(hours) and not isNaN(minutes), so a value with a
    // readable hour and an unreadable minute produced "9:NaN AM" on the
    // calendar rather than falling back.
    expect(premium('09:abc')).toBe('09:abc');
    expect(premium('09:abc')).not.toContain('NaN');
    expect(styles('09:abc')).not.toContain('NaN');
  });
});
