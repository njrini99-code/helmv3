/**
 * A class's wall-clock time must resolve in the TEAM's zone, not the runtime's.
 *
 * `expandRecurringClass` built its busy blocks with
 * `new Date(day); d.setHours(h, m)`, which resolves in whatever zone the
 * process is running in. Locally that is the developer's zone and everything
 * looks right; on Vercel it is UTC. So a player's 09:05 class became a busy
 * block at 09:05 UTC — 05:05 in America/New_York, FOUR HOURS EARLY (five in
 * winter) — and the "find a time" slot generator therefore reported the real
 * class hour as free and let a coach schedule practice straight on top of it.
 *
 * All 10 production golf teams carry `timezone = 'America/New_York'`, so the
 * zone was available the whole time; nothing was reading it.
 *
 * These tests pin the runtime to UTC to reproduce Vercel, and assert against
 * the true instant rather than a formatted string.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { wallClockInZone, offsetMinutesFor } from '@/lib/golf/timezone';

const ORIGINAL_TZ = process.env.TZ;

beforeAll(() => {
  // Reproduce the server. Node reads TZ at first use of Date, so set it before
  // any assertion below constructs one.
  process.env.TZ = 'UTC';
});
afterAll(() => {
  process.env.TZ = ORIGINAL_TZ;
});

/** The UTC hour:minute an instant actually lands on. */
function utcHM(d: Date): string {
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

describe('wallClockInZone resolves in the named zone, not the runtime zone', () => {
  it('a 09:05 New York class is 13:05 UTC in summer (EDT, UTC-4)', () => {
    const day = new Date(Date.UTC(2026, 8, 14)); // 14 Sep 2026, a Monday
    const at = wallClockInZone(day, '09:05', 'America/New_York');
    expect(utcHM(at)).toBe('13:05');
  });

  it('the SAME class is 14:05 UTC in winter (EST, UTC-5) — DST is handled per occurrence', () => {
    // 1 Nov 2026 is the US DST change. A series pinned to one offset at save
    // time renders every meeting after it exactly one hour early; this is the
    // check that catches that regression.
    const day = new Date(Date.UTC(2026, 10, 16)); // 16 Nov 2026
    const at = wallClockInZone(day, '09:05', 'America/New_York');
    expect(utcHM(at)).toBe('14:05');
  });

  it('reproduces the bug: without a zone, 09:05 stays 09:05 UTC on a UTC runtime', () => {
    // This is exactly what the old setHours() path produced on Vercel — four
    // hours early. Kept as a NON-VACUITY proof: if this ever equals 13:05, the
    // test above is passing for the wrong reason.
    const day = new Date(Date.UTC(2026, 8, 14));
    const at = wallClockInZone(day, '09:05', null);
    expect(utcHM(at)).toBe('09:05');
    expect(utcHM(at)).not.toBe(utcHM(wallClockInZone(day, '09:05', 'America/New_York')));
  });

  it('an unknown zone falls back rather than throwing or returning Invalid Date', () => {
    const day = new Date(Date.UTC(2026, 8, 14));
    const at = wallClockInZone(day, '09:05', 'Not/AZone');
    expect(Number.isNaN(at.getTime())).toBe(false);
    expect(utcHM(at)).toBe('09:05');
  });

  it('handles HH:MM:SS as stored by Postgres time columns', () => {
    // golf_player_classes.start_time is `time without time zone`, which
    // PostgREST serialises as "09:05:00".
    const day = new Date(Date.UTC(2026, 8, 14));
    expect(utcHM(wallClockInZone(day, '09:05:00', 'America/New_York'))).toBe('13:05');
  });

  it('midnight does not roll to the previous day', () => {
    // Intl renders midnight as hour 24 in some zones; offsetMinutesFor
    // normalises it. A 00:00 class must stay on its own date.
    const day = new Date(Date.UTC(2026, 8, 14));
    const at = wallClockInZone(day, '00:00', 'America/New_York');
    expect(at.getUTCDate()).toBe(14);
    expect(utcHM(at)).toBe('04:00');
  });
});

describe('offsetMinutesFor', () => {
  it('reports minutes WEST of UTC, matching getTimezoneOffset()', () => {
    expect(offsetMinutesFor('2026-09-14', '09:05:00', 'America/New_York')).toBe(240); // EDT
    expect(offsetMinutesFor('2026-11-16', '09:05:00', 'America/New_York')).toBe(300); // EST
  });

  it('returns null for an unknown zone so callers can fall back deliberately', () => {
    expect(offsetMinutesFor('2026-09-14', '09:05:00', 'Not/AZone')).toBeNull();
  });

  it('returns null on an unparseable time rather than an Invalid Date offset', () => {
    expect(offsetMinutesFor('2026-09-14', 'not-a-time', 'America/New_York')).toBeNull();
  });
});
