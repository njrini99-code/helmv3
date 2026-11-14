import type { ChHomeEvent } from '../../data/home';
import { getValidTimezone } from '@/lib/calendar/timezone';
import { formatClock, isoDay } from '../../lib/dates';
import { dayMonth } from '../../data/home-trips';

/** Home's event links and when-labels: a leaf module, so HomePhone and DayCard share them without an import cycle. */
export const CALENDAR = '/golf/dashboard/calendar';
/** An event opens on Calendar; a trip (F-0001) has no event there, so it opens on Team Hub's Travel, as Calendar's own trip link does. */
export const eventHref = (e: ChHomeEvent) =>
  e.trip ? `/golf/dashboard/team-hub?tab=travel&trip=${encodeURIComponent(e.trip.id)}` : `${CALENDAR}?date=${e.date}&event=${e.id}`;

/** "In 50 min", "Happening now", "Tomorrow · 3:30 PM", "Thu · 8:42 AM". Before the clock is known, the day only. */
export function whenLabel(e: ChHomeEvent, now: Date | null): { text: string; soon: boolean } {
  if (e.trip) return tripWhen(e, e.trip, now);
  if (e.allDay) return { text: now && dayDiff(e.date, now, e.timezone) === 0 ? 'Today · all day' : `${weekday(e.date)} · all day`, soon: false };
  if (!now) return { text: e.startLabel, soon: false };
  const mins = Math.round((Date.parse(e.startIso) - now.getTime()) / 60000);
  const days = dayDiff(e.date, now, e.timezone);
  if (days === 0) {
    const end = e.endIso ? Date.parse(e.endIso) : Date.parse(e.startIso);
    if (mins <= 0 && now.getTime() < end) return { text: 'Happening now', soon: true };
    if (mins < 60) return { text: `In ${Math.max(1, mins)} min`, soon: true };
    return { text: `In ${Math.floor(mins / 60)} h ${mins % 60} min`, soon: false };
  }
  return { text: `${days === 1 ? 'Tomorrow' : weekday(e.date)} · ${e.startLabel}`, soon: false };
}

/** Whole days on the same team clock that produced the event's calendar date. */
function dayDiff(date: string, now: Date, timezone?: string): number {
  const local = isoDay(now, getValidTimezone(timezone));
  return Math.round((Date.parse(`${date}T12:00:00Z`) - Date.parse(`${local}T12:00:00Z`)) / 86400000);
}
const WD = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short' });
const weekday = (date: string) => WD.format(new Date(`${date}T12:00:00Z`));
/** What a countdown runs to: a timed event's start, a trip's departure time (F-0001); null for an all-day event or a trip with no time. */
export const countdownTo = (e: ChHomeEvent): string | null => (e.trip ? e.trip.leaves : e.allDay ? null : e.startIso);

/**
 * The next thing after this week, in words (F-0006): its day, "Tue 17 Nov", and its time, "2:00 PM", "all day", or a trip's
 * "leaves 7:30 AM" (null with no time saved). The day is past this week, so it is named in full, not as a weekday.
 */
export function afterWhen(e: ChHomeEvent): { day: string; time: string | null } {
  const day = dayMonth(e.date);
  if (e.trip) return { day, time: e.trip.leaves ? `leaves ${clockAt(e.trip.leaves, e.timezone)}` : null };
  return { day, time: e.allDay ? 'all day' : e.startLabel };
}

/** "7:30 AM" on the team's clock. */
const clockAt = (iso: string, timezone?: string) => formatClock(iso, getValidTimezone(timezone));

/**
 * A trip's when (F-0001): before it leaves, when it leaves, counting down to its departure time on the day ("Leaves in 2 h 10
 * min", "Leaves tomorrow · 7:30 AM", "Leaves Mon" with no time saved); once gone, "On the road" and when the team is back,
 * through the return day. Before the clock is known, the day it leaves.
 */
function tripWhen(e: ChHomeEvent, trip: NonNullable<ChHomeEvent['trip']>, now: Date | null): { text: string; soon: boolean } {
  const leavesAt = trip.leaves ? ` · ${clockAt(trip.leaves, e.timezone)}` : '';
  if (!now) return { text: `Leaves ${weekday(e.date)}${leavesAt}`, soon: false };
  const toLeave = dayDiff(e.date, now, e.timezone);
  const gone = trip.leaves ? Date.parse(trip.leaves) <= now.getTime() : toLeave <= 0;
  if (gone) {
    const toBack = dayDiff(trip.back, now, e.timezone);
    return { text: `On the road · back ${toBack <= 0 ? 'today' : toBack === 1 ? 'tomorrow' : weekday(trip.back)}`, soon: false };
  }
  if (trip.leaves && toLeave <= 0) {
    const mins = Math.max(1, Math.round((Date.parse(trip.leaves) - now.getTime()) / 60000));
    return mins < 60 ? { text: `Leaves in ${mins} min`, soon: true } : { text: `Leaves in ${Math.floor(mins / 60)} h ${mins % 60} min`, soon: false };
  }
  return { text: `Leaves ${toLeave === 1 ? 'tomorrow' : weekday(e.date)}${leavesAt}`, soon: false };
}

/**
 * The line under the player's greeting (stats-home S-HOMEGAME, `.who`): what is next and where, "Practice at 3:30 PM · Lonnie
 * Poole range", or with the day when it is not today, "Qualifier Fri at 8:42 AM · Pinehurst No. 2". An all-day event has no time.
 * `clock` writes the start in the viewer's 12 or 24 hour choice.
 */
export function nextLine(e: ChHomeEvent, now: Date | null, label: string, clock: (text: string) => string = (t) => t): string {
  const days = now ? dayDiff(e.date, now, e.timezone) : 0;
  const day = days === 0 ? '' : days === 1 ? ' Tomorrow' : ` ${weekday(e.date)}`;
  const when = e.allDay ? `${day || ' Today'} all day` : `${day} at ${clock(e.startLabel)}`;
  return `${label}${when}${e.location ? ` · ${e.location}` : ''}`;
}
