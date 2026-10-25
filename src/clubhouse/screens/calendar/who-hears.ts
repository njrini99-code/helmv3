/**
 * P-4: who a move tells, for the notice ("9 players will be told."). Today players hear of an event update only when
 * it asks for replies and has invitees (notifyEventUpdate returns early otherwise, lib/calendar/rsvp.ts), and only in
 * the Bell. P-14 replaces the rule; the notice reads only this, and never claims a push.
 */
import type { ChCalEvent, ChCalPerson } from './model';

export function whoHears(e: Pick<ChCalEvent, 'rsvpRequired' | 'people'>, people: Map<string, ChCalPerson>): { count: number; first: string | null } {
  if (!e.rsvpRequired || e.people.length === 0) return { count: 0, first: null };
  const one = people.get(e.people[0]!)?.name.split(' ')[0] ?? null;
  return { count: e.people.length, first: one };
}

/** "Jonah will be told.", "9 players will be told.", or nothing when nobody is. */
export function whoHearsLine(w: { count: number; first: string | null }): string | null {
  if (w.count === 0) return null;
  if (w.count === 1) return w.first ? `${w.first} will be told.` : '1 player will be told.';
  return `${w.count} players will be told.`;
}
