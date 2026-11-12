import type { GolfEventInput } from '@/app/golf/actions/calendar-events';
import { offsetMinutesFor } from '@/lib/golf/timezone';
import { isoDay } from '../../lib/dates';

/**
 * A practice made from the New plan sheet (Q7, owner, 12 Nov: "New plan" creates the practice itself). The coach picks the
 * day, start and end; Create puts it on the calendar through the Calendar's own create (`createGolfEvent`, the editor's
 * path), then plans it. Times are the team's wall clock, `HH:mm`.
 */
export interface NewPractice {
  date: string;
  start: string;
  end: string;
  place: string;
}

export const NEW_PRACTICE_TITLE = 'Practice';

const addDay = (iso: string) => new Date(Date.parse(`${iso}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
const weekend = (iso: string) => [0, 6].includes(new Date(`${iso}T12:00:00Z`).getUTCDay());
const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h! * 60 + m!;
};

/** The first Monday-to-Friday day after today, in the team's zone. */
export function nextWeekday(now: Date, zone: string): string {
  let day = addDay(isoDay(now, zone));
  while (weekend(day)) day = addDay(day);
  return day;
}

/** The sheet's starting practice: the next weekday, 3:00 to 5:00 PM, no place. */
export function defaultNewPractice(now: Date, zone: string): NewPractice {
  return { date: nextWeekday(now, zone), start: '15:00', end: '17:00', place: '' };
}

/** The practice's window in minutes, for Ask CoachHelm's "How long"; null when the end is not after the start. */
export function newPracticeMinutes(p: NewPractice): number | null {
  const m = toMin(p.end) - toMin(p.start);
  return m > 0 ? m : null;
}

/** A new start keeps the practice's length, as the calendar's editor does; an end that would pass midnight stays where it was. */
export function withStart(p: NewPractice, start: string): NewPractice {
  const end = toMin(start) + (newPracticeMinutes(p) ?? 120);
  if (end >= 24 * 60) return { ...p, start };
  return { ...p, start, end: `${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}` };
}

/** What stops Create, said before anything is sent; null when the practice can be made. */
export function newPracticeProblem(p: NewPractice): string | null {
  if (!p.date) return 'Pick a day.';
  return newPracticeMinutes(p) == null ? 'End the practice after it starts.' : null;
}

/**
 * The Calendar's create for this practice, as its editor builds a new one-off: timed (`allDay: false`; the server stores a
 * create without it as all-day, which the sheet could not plan), in the team zone's offset on that day (the editor's
 * `offsetMinutesFor`, positive west of UTC), with the whole roster on it as the editor starts a new practice. No replies
 * are asked, so the server writes their attendance rows and notifies no one (createGolfEvent, sendEventInvitations).
 */
export function newPracticeEvent(p: NewPractice, zone: string, roster: readonly string[] = []): GolfEventInput {
  const place = p.place.trim();
  return {
    title: NEW_PRACTICE_TITLE,
    eventType: 'practice',
    startDate: p.date,
    startTime: p.start,
    endTime: p.end,
    allDay: false,
    location: place || undefined,
    requiresRsvp: false,
    ...(roster.length ? { attendeeIds: [...roster] } : {}),
    timezoneOffset: offsetMinutesFor(p.date, p.start, zone) ?? undefined,
  };
}

/** "Tuesday, Nov 17" and "3:00 to 5:00 PM", for the sheet's line once the practice is on the calendar. */
export function newPracticeWords(p: NewPractice): { day: string; time: string } {
  // The wall clock as written, read in UTC so no zone moves it; the start drops its AM/PM as the practice list's lines do.
  const at = (hhmm: string) => new Date(`${p.date}T${hhmm}:00Z`);
  const clock = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' });
  return {
    day: new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(at('12:00')),
    time: `${clock.format(at(p.start)).replace(/\s?[AP]M$/, '')} to ${clock.format(at(p.end))}`,
  };
}
