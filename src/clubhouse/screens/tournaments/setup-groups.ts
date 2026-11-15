import { eventDaySpan } from '@/lib/calendar/timezone';
import { isoDay } from '../../lib/dates';

/**
 * P-5 4.11.3: the calendar's tournament events that aren't tracked yet, grouped for the season home's "Set up from
 * calendar". Consecutive days whose titles share a stem (after a trailing " · R2", " R2", " Round 2" or " Day 2") are
 * one row ("Fall Classic · 3 calendar entries"); everything else stands alone. Newest first. Pure.
 */
export interface ChTourCalendarEvent {
  id: string;
  title: string;
  /** YYYY-MM-DD on the team's clock. */
  date: string;
  /** The entry's own last day (YYYY-MM-DD), for one entry that spans days (F-0025); absent, the entry is its start day. */
  end?: string;
}

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * One calendar row as a set-up entry, its first and last day read as the calendar reads them (`eventDaySpan`, F-0025): a timed entry
 * on the team's clock, an all-day one by its written dates, a row written on the team's own day edges (04:00Z to 03:59Z) by the
 * team's days. A three-day tournament entered once reads 27 to 29 Aug, not 27 Aug.
 */
export function calendarEntryOf(
  row: { id: string; title: string; start_time: string; end_time: string | null; all_day: boolean | null },
  timezone: string,
): Required<ChTourCalendarEvent> {
  // An all-day event is stored at UTC midnight of its date (the calendar's convention): its start is the date as written.
  const date = row.all_day ? row.start_time.slice(0, 10) : isoDay(row.start_time, timezone);
  const span = eventDaySpan({ start_time: row.start_time, end_time: row.end_time, all_day: !!row.all_day }, timezone);
  const last = span ? ymd(span.last) : date;
  return { id: row.id, title: row.title, date, end: last > date ? last : date };
}

export interface ChTourSetupGroup {
  /** Calendar event ids in day order; the first becomes R1. */
  eventIds: string[];
  title: string;
  first: string;
  last: string;
}

export function titleStem(title: string): string {
  return title
    .trim()
    .replace(/\s*(?:·\s*)?(?:R|Round\s+|Day\s+)\d+$/i, '')
    .trim();
}

const nextDay = (d: string) => {
  const t = new Date(`${d}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() + 1);
  return t.toISOString().slice(0, 10);
};

export function setupGroups(events: readonly ChTourCalendarEvent[]): ChTourSetupGroup[] {
  const sorted = [...events].sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
  const groups: ChTourSetupGroup[] = [];
  for (const e of sorted) {
    const stem = titleStem(e.title).toLowerCase();
    const g = groups.find((x) => titleStem(x.title).toLowerCase() === stem && e.date <= nextDay(x.last));
    const end = e.end && e.end > e.date ? e.end : e.date;
    if (g && stem) {
      g.eventIds.push(e.id);
      if (end > g.last) g.last = end;
      g.title = titleStem(g.title);
    } else groups.push({ eventIds: [e.id], title: e.title, first: e.date, last: end });
  }
  return groups.sort((a, b) => b.first.localeCompare(a.first));
}
