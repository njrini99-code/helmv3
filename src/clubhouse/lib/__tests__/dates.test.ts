import { describe, expect, it } from 'vitest';
import { hits, ratchet, walk } from '../../__tests__/_scan';
import { formatClock, formatWallClock, isoDay, relativeTime } from '../dates';

const NOW = Date.parse('2026-10-14T18:00:00Z');
const before = (ms: number) => NOW - ms;
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
/** Noon on a calendar day in the runtime's zone: the date label reads the viewer's own day, so a UTC instant would shift it in UTC+14. */
const localNoon = (month: number, day: number) => new Date(2026, month - 1, day, 12).getTime();

describe('lib/dates (CONS-16)', () => {
  it('relative time, short: Now, 9m, 2h, 3d, then the date', () => {
    expect(relativeTime(before(20_000), 'short', NOW)).toBe('Now');
    expect(relativeTime(before(9 * MIN), 'short', NOW)).toBe('9m');
    expect(relativeTime(before(2 * HOUR), 'short', NOW)).toBe('2h');
    expect(relativeTime(before(3 * DAY), 'short', NOW)).toBe('3d');
    expect(relativeTime(localNoon(9, 30), 'short', NOW)).toBe('Sep 30');
  });

  it('relative time, long: Just now, 5 minutes ago, 2 hours ago, Yesterday, then the date', () => {
    expect(relativeTime(before(20_000), 'long', NOW)).toBe('Just now');
    expect(relativeTime(before(MIN), 'long', NOW)).toBe('1 minute ago');
    expect(relativeTime(before(5 * MIN), 'long', NOW)).toBe('5 minutes ago');
    expect(relativeTime(before(2 * HOUR), 'long', NOW)).toBe('2 hours ago');
    expect(relativeTime(before(DAY), 'long', NOW)).toBe('Yesterday');
    expect(relativeTime(localNoon(10, 10), 'long', NOW)).toBe('Oct 10');
    expect(relativeTime('not a date', 'long', NOW)).toBe('');
  });

  it('one clock: 3:30 PM, and a wall time drops its minutes on the hour', () => {
    expect(formatClock('2026-10-14T19:30:00Z', 'UTC')).toBe('7:30 PM');
    expect(formatWallClock('07:00')).toBe('7 AM');
    expect(formatWallClock('15:30')).toBe('3:30 PM');
    expect(formatWallClock('00:00')).toBe('12 AM');
  });

  it('isoDay is the day in the zone', () => {
    expect(isoDay('2026-10-15T02:00:00Z', 'America/New_York')).toBe('2026-10-14');
    expect(isoDay(Date.parse('2026-10-15T02:00:00Z'), 'UTC')).toBe('2026-10-15');
  });
});

/** Every other place that formats a date itself; the counts may only fall as they move into lib/dates. */
const ALLOW_DATES: Record<string, number> = {
  'data/calendar.ts': 2,
  'data/classes-shape.ts': 2,
  'data/coachhelm-chat-thread.ts': 1,
  'data/coachhelm-chat.ts': 1,
  'data/coachhelm-standing-shape.ts': 1,
  'data/coachhelm-track-record-shape.ts': 1,
  'data/home-clock.ts': 1,
  'data/home.ts': 4,
  'data/hub.ts': 4,
  'data/player-home.ts': 1,
  'data/recruiting-calendar.ts': 2,
  'data/recruiting-shape.ts': 3,
  'data/roster.ts': 1,
  'data/round-review-shape.ts': 1,
  'data/season.ts': 2,
  'data/shell.ts': 2,
  'data/stats-common.ts': 1,
  'data/welcome-shape.ts': 3,
  'data/whats-new-shape.ts': 3,
  'lib/light.ts': 1,
  'lib/sun.ts': 1,
  'screens/calendar/Calendar.tsx': 1,
  'screens/calendar/model.ts': 1,
  'screens/home/DayCard.tsx': 3,
  'screens/home/HomePhone.tsx': 1,
  'screens/home/event-links.ts': 1,
  'screens/home/nudge-draft.ts': 1,
  'screens/home/use-day-rollover.ts': 1,
  'screens/messages/announcements.tsx': 2,
  'screens/messages/model.ts': 8,
  'screens/qualifiers/CoursePicker.tsx': 1,
  'screens/qualifiers/QualifierSections.tsx': 2,
  'screens/qualifiers/model.ts': 2,
  'screens/rounds/RoundReview.tsx': 1,
  'screens/rounds/card/card-model.ts': 1,
  'screens/rounds/entry/session.ts': 1,
  'screens/rounds/parts.tsx': 1,
  'screens/rounds/setup/AddCourseSheet.tsx': 2,
  'screens/rounds/setup/CoursePicker.tsx': 2,
  'screens/rounds/setup/HoleConfig.tsx': 2,
  'screens/rounds/setup/RoundSetup.tsx': 1,
  'screens/settings/Golf.tsx': 1,
  'screens/settings/phone/GolfPhone.tsx': 1,
  'screens/stats/PrintHead.tsx': 1,
};

describe('dates format in lib/dates (CONS-16)', () => {
  it('no new local date formatting', () => {
    const found = hits(/toLocale(Date|Time)?String\(|new Intl\.DateTimeFormat\(|Intl\.RelativeTimeFormat/, walk(undefined, /\.tsx?$/)).filter((h) => h.file !== 'lib/dates.ts');
    const r = ratchet(found, ALLOW_DATES);
    expect(r.over).toEqual([]);
    expect(r.stale).toEqual([]);
  });
});
