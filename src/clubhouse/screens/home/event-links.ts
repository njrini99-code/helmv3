import type { ChHomeEvent } from '../../data/home';
import { getValidTimezone } from '@/lib/calendar/timezone';

/** Home's event links and when-labels: a leaf module, so HomePhone and DayCard share them without an import cycle. */
export const CALENDAR = '/golf/dashboard/calendar';
export const eventHref = (e: ChHomeEvent) => `${CALENDAR}?date=${e.date}&event=${e.id}`;

/** "In 50 min", "Happening now", "Tomorrow · 3:30 PM", "Thu · 8:42 AM". Before the clock is known, the day only. */
export function whenLabel(e: ChHomeEvent, now: Date | null): { text: string; soon: boolean } {
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
  const local = new Intl.DateTimeFormat('en-CA', { timeZone: getValidTimezone(timezone), year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  return Math.round((Date.parse(`${date}T12:00:00Z`) - Date.parse(`${local}T12:00:00Z`)) / 86400000);
}
const WD = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short' });
const weekday = (date: string) => WD.format(new Date(`${date}T12:00:00Z`));
