import type { ChHomeEvent } from '../../data/home';

const WEEKDAY = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'long' });

/** The nudge's draft: what it's about and when, in the coach's voice. The coach reads it and presses Send. */
export function nudgeDraft(e: ChHomeEvent, today: string | null): string {
  const day = e.date === today ? 'today' : WEEKDAY.format(new Date(`${e.date}T12:00:00Z`));
  const at = e.allDay ? day : `${day} at ${e.startLabel}`;
  return `Can you let me know if you’re coming to ${e.title} (${at})? You can reply on the event in Calendar.`;
}
