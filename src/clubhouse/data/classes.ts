import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { fromUntyped } from '@/lib/supabase/untyped';
import { chLogServer } from '../lib/track-server';
import { loadInvitedCounts, loadOwnRows } from './attendance-counts';
import { playerSeesMeeting } from '../screens/calendar/model';
import { homeClock } from './home';
import { addDays, termOn, toChClasses, toTeamEvent, weekDates, type ChClassesPage, type ChClassRow, type ChEventRow, type ChTeamEvent } from './classes-shape';
import { isoDay } from '../lib/dates';

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

/**
 * The meetings this player doesn't see, as their Calendar decides it (data/calendar.ts, playerSeesMeeting): Decision B
 * (owner, wave 7), a meeting is theirs only when they are on its invite list (their own attendance row, read before and
 * after migration 20261017102000), so no class is said to meet over a teammate's 1:1 and its title is never on this
 * page. When their own rows didn't load, D2-8 decides (a meeting nobody is invited to is the coach's own); when that
 * failed too, every meeting is left out (fail closed). Each failed read is logged.
 */
async function hiddenMeetings(supabase: Awaited<ReturnType<typeof createClient>>, rows: ChEventRow[], playerId: string): Promise<Set<string>> {
  const ids = rows.filter((r) => r.event_type === 'meeting').map((r) => r.id);
  if (!ids.length) return new Set();
  const own = await loadOwnRows(supabase, ids, playerId, (err) => log('ownInvites', err));
  const invited = own ? null : await loadInvitedCounts(supabase, ids, (err) => log('meetingInvites', err));
  return new Set(ids.filter((id) => !playerSeesMeeting(own ? own.has(id) : null, invited?.get(id) ?? null)));
}

export async function loadClasses(input: { playerId: string; teamId: string; /** P-10: ask for `status_enabled` too (the flag is on). */ classAwareness?: boolean }): Promise<ChClassesPage> {
  const supabase = await createClient();
  const now = new Date();
  const clock = await homeClock(supabase, input.teamId, now);
  const todayIso = isoDay(now, clock.tz);
  const dates = weekDates(todayIso);
  // A trip that left a few days before Monday still touches the week; rows are placed by their zoned date below.
  const fromIso = `${addDays(dates[0]!, -3)}T00:00:00Z`;
  const toIso = `${addDays(dates[6]!, 2)}T00:00:00Z`;

  // With class awareness on the rows carry `status_enabled`. If the column is not there yet (the migration is held) the read
  // is repeated without it, so the page never loses its classes to a column that has not arrived.
  const readClasses = async (columns: string) => fromUntyped(supabase, 'golf_player_classes').select(columns).eq('player_id', input.playerId).order('created_at', { ascending: true }).order('id', { ascending: true }).limit(500);
  const readClassesAware = async () => {
    const first = await readClasses(`${CLASS_COLUMNS}, status_enabled`);
    return first.error?.code === '42703' ? readClasses(CLASS_COLUMNS) : first;
  };
  const [classesRes, eventsRes] = await Promise.all([
    input.classAwareness ? readClassesAware() : readClasses(CLASS_COLUMNS),
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

  const rows = eventsRes.error ? [] : ((eventsRes.data ?? []) as ChEventRow[]);
  const hidden = await hiddenMeetings(supabase, rows, input.playerId);
  const events = rows.filter((r) => !hidden.has(r.id)).map((r) => toTeamEvent(r, clock.tz)).filter((e): e is ChTeamEvent => e != null);

  const term = termOn(todayIso);
  if (!term) throw new Error('Clubhouse: no academic term for ' + todayIso);

  return {
    todayIso,
    term,
    classes: { list: classesRes.error ? [] : toChClasses((classesRes.data ?? []) as ChClassRow[]), error: !!classesRes.error },
    week: { dates, events, error: !!eventsRes.error },
  };
}
