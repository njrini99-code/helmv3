import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { chLogServer } from '../lib/track-server';
import { homeClock } from './home';
import { addDays, termOn, toChClasses, toTeamEvent, weekDates, type ChClassesPage, type ChClassRow, type ChEventRow, type ChTeamEvent } from './classes-shape';

export type * from './classes-shape';

/**
 * Classes (Clubhouse P012; design/handoff/Player - Classes.html, classes.jsx
 * `ClassesPage`). One server read for the player's own classes, and one for
 * the team's events this week, so a class that meets over practice or a trip
 * can say so.
 *
 * `classes.error`: the classes didn't load, and the page says so; it is never
 * shown as "no classes". `week.error`: the events didn't load, and only the
 * overlap parts say so; a class is never called clear of practice on a failed
 * read.
 */

const CLASS_COLUMNS = 'id, class_name, instructor, days, start_time, end_time, building, room, credits, color, notes, semester, created_at';
const EVENT_COLUMNS = 'id, title, event_type, start_time, end_time, all_day, status, location, description';

const log = (what: string, err: unknown) => chLogServer('classes', what, err, 'calendar');

export async function loadClasses(input: { playerId: string; teamId: string }): Promise<ChClassesPage> {
  const supabase = await createClient();
  const now = new Date();
  const clock = await homeClock(supabase, input.teamId, now);
  const todayIso = new Intl.DateTimeFormat('en-CA', { timeZone: clock.tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const dates = weekDates(todayIso);
  // A trip that left a few days before Monday still touches the week; rows are placed by their zoned date below.
  const fromIso = `${addDays(dates[0]!, -3)}T00:00:00Z`;
  const toIso = `${addDays(dates[6]!, 2)}T00:00:00Z`;

  const [classesRes, eventsRes] = await Promise.all([
    supabase.from('golf_player_classes').select(CLASS_COLUMNS).eq('player_id', input.playerId).order('created_at', { ascending: true }).order('id', { ascending: true }).limit(500),
    supabase
      .from('golf_events')
      .select(EVENT_COLUMNS)
      .eq('team_id', input.teamId)
      .neq('event_type', 'class')
      .gte('start_time', fromIso)
      .lt('start_time', toIso)
      .order('start_time', { ascending: true })
      .limit(500),
  ]);
  if (classesRes.error) log('classes', classesRes.error);
  if (eventsRes.error) log('events', eventsRes.error);

  const events = eventsRes.error ? [] : ((eventsRes.data ?? []) as ChEventRow[]).map((r) => toTeamEvent(r, clock.tz)).filter((e): e is ChTeamEvent => e != null);

  const term = termOn(todayIso);
  if (!term) throw new Error('Clubhouse: no academic term for ' + todayIso);

  return {
    todayIso,
    term,
    classes: { list: classesRes.error ? [] : toChClasses((classesRes.data ?? []) as ChClassRow[]), error: !!classesRes.error },
    week: { dates, events, error: !!eventsRes.error },
  };
}
