import 'server-only';
import type { createClient } from '@/lib/supabase/server';
import { homeChangeRows, type ChHomeChange } from '../screens/home/change-rows';
import type { ChAgendaRow, ChHomeEvent } from './home';
import type { ChCalChange } from '../screens/calendar/change-view';
import { chLogServer } from '../lib/track-server';

/**
 * The schedule changes Home shows (P-14): one read of the team's events that carry a change mark, from a day ago to three
 * weeks ahead (the newest 50), turned into "Since you last looked" rows and the marks Up next and the agenda wear. The mark
 * rides the row, so it reaches exactly the people who can read the event (the meetings rule included). A player's rows keep
 * only the meetings their week already shows them (`visibleMeetings`), so a meeting they are not invited to is never one.
 */
export async function loadHomeChanges(
  supabase: Awaited<ReturnType<typeof createClient>>,
  input: {
    teamId: string;
    /** The team's timezone; the read does not wait for it, only the wording does. */
    tz: string | Promise<string>;
    now: Date;
    /** The viewer's `golf_coaches.id`: their own changes are never news to them. */
    coachId?: string | null;
    /** A player's Home: the meetings their week shows them (Decision B); any other event is theirs to see. */
    visibleMeetings?: Set<string> | Promise<Set<string>>;
  },
): Promise<{ rows: ChHomeChange[]; byEvent: Map<string, ChCalChange>; error: boolean }> {
  const from = new Date(input.now.getTime() - 86_400_000).toISOString();
  const to = new Date(input.now.getTime() + 21 * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from('golf_events')
    .select('id, title, event_type, start_time, end_time, all_day, location, status, cancellation_reason, change:metadata->change')
    .eq('team_id', input.teamId)
    .neq('event_type', 'class')
    .not('metadata->change', 'is', null)
    .gte('start_time', from)
    .lte('start_time', to)
    .order('start_time', { ascending: true })
    .limit(50);
  if (error) {
    chLogServer('home', 'changes', error);
    return { rows: [], byEvent: new Map(), error: true };
  }
  const [timeZone, visibleMeetings] = await Promise.all([input.tz, input.visibleMeetings]);
  const built = homeChangeRows(
    (data ?? []).map((r) => ({ ...r, change: r.change as unknown })),
    {
      timeZone,
      nowMs: input.now.getTime(),
      coachId: input.coachId ?? null,
      visible: visibleMeetings ? (row) => row.event_type !== 'meeting' || visibleMeetings.has(row.id) : undefined,
    },
  );
  return { ...built, error: false };
}

/** The event with its mark, for Up next and Today; null stays null. */
export function withChange<E extends ChHomeEvent | null>(e: E, byEvent: Map<string, ChCalChange>): E {
  if (!e) return e;
  const change = byEvent.get(e.id);
  return change ? { ...e, change } : e;
}

/** The agenda rows with the old value of a changed event at the head of the detail line. */
export function withWas(rows: ChAgendaRow[], byEvent: Map<string, ChCalChange>): ChAgendaRow[] {
  return rows.map((r) => {
    const c = byEvent.get(r.id);
    const text = c?.was.time ?? c?.was.title ?? c?.was.place;
    return c && text ? { ...r, was: { text, changeId: c.id } } : r;
  });
}
