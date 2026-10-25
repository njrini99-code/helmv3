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
    const g = groups.find((x) => titleStem(x.title).toLowerCase() === stem && (x.last === e.date || nextDay(x.last) === e.date));
    if (g && stem) {
      g.eventIds.push(e.id);
      g.last = e.date;
      g.title = titleStem(g.title);
    } else groups.push({ eventIds: [e.id], title: e.title, first: e.date, last: e.date });
  }
  return groups.sort((a, b) => b.first.localeCompare(a.first));
}
