import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { chLogServer } from '../lib/track-server';
import { rsvpOf } from './calendar';
import { loadAttendanceCounts, loadInvitedCounts, loadOwnRows } from './attendance-counts';
import { playerMine, playerSeesMeeting, replyClosedAt } from '../screens/calendar/model';
import { CLASS_EVENT_TYPE, isClassEvent } from '@/lib/calendar/class-events';
import { isCoachHelmEnabledForCoach } from '@/lib/coachhelm/v2/gate';
import { isFlagEnabled } from '@/lib/flags/is-enabled';
import { todayIsoInZone } from '@/lib/golf/timezone';
import { isoDay } from '../lib/dates';
import { fullName } from './season';

export interface ChNextEvent {
  id: string;
  title: string;
  /** "Today", "Tomorrow", "In 3 days", resolved in the team's timezone. */
  whenLabel: string;
  /** "Thu, Oct 16 · 8:42 AM · Pinehurst No. 2" */
  metaLabel: string;
  /**
   * Accepted RSVPs of those invited; null with no invitees, when the read failed, or when the event doesn't ask for
   * replies (owner, 2026-10-08: the card then shows when and where, never a confirmed count).
   */
  ready: { accepted: number; invited: number } | null;
  /**
   * A player's card only: `needed` when the event asks for replies, they are invited and haven't answered, and the server
   * would still take one; `going` when they said yes. Null otherwise, and when their own reply didn't load.
   */
  mine?: 'going' | 'needed' | null;
}

export interface ChShellData {
  nextEvent: ChNextEvent | null;
  /** Null when the read failed: the badge hides rather than claiming zero. */
  pendingJoinRequests: number | null;
  /**
   * A coach's Team Hub badge: tasks past their due date (on the team's clock) that a player still has to finish. Coach
   * only, read once with the shell (one head count, no joins to the client); null when unread or for a player, so the
   * badge hides rather than claiming zero.
   */
  overdueTasks?: number | null;
  /** The team's time zone: where the global light's sun is until the course location is set (P001-A1). */
  timezone?: string;
  /** The team's course location (Settings > Team), the global light's place; null until set or before its migration. */
  course?: { lat: number; lng: number } | null;
  /** CoachHelm is on for the signed-in coach (the global, team and coach switches), so the shell offers the Ask sheet. */
  askAvailable?: boolean;
  /** The signed-in player's round in progress, touched in the last 12 hours (P001-C1): the Resume accessory. */
  roundInProgress?: ChRoundInProgress | null;
  /** The signed-in coach is this team's head coach: the identity line says "Head coach". False when unread (plain "Coach"). */
  viewerIsHeadCoach?: boolean;
  /**
   * P-10: `class_awareness_v1` is on. Read once with the shell and handed to the client by context (useClassAwareness),
   * because the flag registry is server-only. Off or absent: no class RPC is called anywhere and no column is sent.
   */
  classAwareness?: boolean;
}

/** One of the coach's players, as the palette lists them: the id it opens and the name it shows. Nothing more. */
export interface ChShellPerson {
  id: string;
  name: string;
}

export interface ChRoundInProgress {
  id: string;
  course: string;
  /** The hole the player is on, when the round has recorded one. */
  hole: number | null;
}

/** A round untouched for this long is not "in progress" for the accessory; the Rounds library still lists it. */
export const ROUND_IN_PROGRESS_FRESH_MS = 12 * 60 * 60_000;

/**
 * The shell's own reads: the sidebar's next-event card, the Roster badge and,
 * for a player, the round in progress. All degrade to "hidden" on failure; the
 * shell must never take a page down.
 */
/**
 * How many of the team's tasks are overdue with work still open: a task due before `today` (the team's date) with at
 * least one assignment not completed. One head count: the inner embed makes the database keep only tasks that have an
 * open assignment, so no rows or ids come back and the 1,000-row cap never applies. RLS scopes it to the coach's team.
 * Null when the read failed. A task nobody was assigned is not counted: there is no one to chase.
 */
export async function countOverdueTasks(supabase: Awaited<ReturnType<typeof createClient>>, teamId: string, today: string): Promise<number | null> {
  const { count, error } = await supabase
    .from('golf_tasks')
    .select('id, golf_task_assignments!inner(id)', { count: 'exact', head: true })
    .eq('team_id', teamId)
    // A QA run's task is hidden on every task surface (loadTeamHub), so the badge must not count it either.
    .eq('is_test', false)
    .is('parent_task_id', null)
    .lt('due_date', today)
    .or('status.is.null,status.neq.completed', { referencedTable: 'golf_task_assignments' });
  if (error) {
    chLogServer('shell', 'overdueTasks', error, 'tasks');
    return null;
  }
  return count ?? 0;
}

/**
 * The coach's players, names and ids only, for the palette (owner, decision 16). Active members only: RLS on
 * golf_players (user_is_coach_of_golf_player) matches active members, so an inactive one would come back empty anyway.
 * RLS scopes it to the coach's own team; a roster is well under the row cap. Each row is rebuilt as `{ id, name }`, so
 * no other column can reach the client. Null on failure.
 *
 * Read only when the palette first opens (data/palette-people.ts), never with the shell: the shell rides
 * every page's HTML, which the site's service worker keeps in Cache Storage, and the decision says in memory only.
 */
export async function loadPalettePeople(supabase: Awaited<ReturnType<typeof createClient>>, teamId: string): Promise<ChShellPerson[] | null> {
  const { data, error } = await supabase
    .from('golf_team_members')
    .select('player:golf_players(id, first_name, last_name)')
    .eq('team_id', teamId)
    .eq('status', 'active')
    .limit(1000);
  if (error) {
    chLogServer('shell', 'palettePeople', error, 'teams');
    return null;
  }
  type P = { id: string; first_name: string | null; last_name: string | null };
  return ((data ?? []) as Array<{ player: P | null }>).flatMap((m) => (m.player?.id ? [{ id: m.player.id, name: fullName(m.player) }] : []));
}

export async function loadClubhouseShell(teamId: string | undefined, playerId?: string | null, coachId?: string | null): Promise<ChShellData> {
  if (!teamId) return { nextEvent: null, pendingJoinRequests: null };
  const supabase = await createClient();
  // The team's zone is read once and shared: the coach's overdue count needs today's date in it, and runs beside the rest.
  const zoneRead = Promise.resolve(supabase.from('golf_team_settings').select('timezone').eq('team_id', teamId).maybeSingle());
  const [eventRes, joinRes, tzRes, roundRes, askOn, courseRes, staffRes, overdueTasks] = await Promise.all([
    supabase
      .from('golf_events')
      .select('id, title, start_time, all_day, location, event_type, description, requires_rsvp, rsvp_deadline')
      .eq('team_id', teamId)
      // A player's synced class is never "the team's next event" (F-40): it would show one player's timetable to the
      // whole roster. Both class markers are checked, as every team-schedule read does (lib/calendar/class-events).
      .neq('event_type', CLASS_EVENT_TYPE)
      .gte('start_time', new Date().toISOString())
      .is('cancelled_at', null)
      .order('start_time', { ascending: true })
      // Room for the meetings a player isn't invited to, which are passed over (Decision B).
      .limit(10),
    supabase
      .from('golf_team_join_requests')
      .select('id', { count: 'exact', head: true })
      .eq('team_id', teamId)
      .eq('status', 'pending'),
    zoneRead,
    // The player's own round in progress (RLS: a player reads their own rounds). Only a fresh one is a round "on the course".
    playerId
      ? supabase
          .from('golf_rounds')
          .select('id, course_name, current_hole')
          .eq('player_id', playerId)
          .eq('is_test', false)
          .eq('status', 'in_progress')
          .gte('updated_at', new Date(Date.now() - ROUND_IN_PROGRESS_FRESH_MS).toISOString())
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve(null),
    // The coach's Ask sheet follows CoachHelm's own switch (as the Ask page does); a lookup that fails hides the key.
    coachId
      ? isCoachHelmEnabledForCoach(coachId).then(
          (gate) => gate.effectivelyEnabled,
          (err: unknown) => {
            chLogServer('shell', 'coachHelmGate', err, 'coachhelm');
            return false;
          },
        )
      : Promise.resolve(false),
    // The light's place (migration 20261008150000, held for the owner's apply). Its own read, so a missing column only
    // leaves the light on the time zone: it never touches the reads above. The generated types gain the columns at db:types.
    (supabase.from('golf_team_settings') as unknown as CourseQuery)
      .select('course_latitude, course_longitude')
      .eq('team_id', teamId)
      .maybeSingle(),
    // The coach's own staff row on this team (RLS: a coach on the team reads its staff rows), for the identity line.
    coachId
      ? supabase.from('golf_team_coach_staff').select('role').eq('team_id', teamId).eq('coach_id', coachId).limit(5)
      : Promise.resolve(null),
    // A coach's Team Hub badge. A failed zone read falls back to the product default, as below.
    coachId
      ? zoneRead
          .then((zone) => countOverdueTasks(supabase, teamId, todayIsoInZone((!zone.error && zone.data?.timezone) || 'America/New_York')))
          .catch((err: unknown) => {
            chLogServer('shell', 'overdueTasks', err, 'tasks');
            return null;
          })
      : Promise.resolve(null),
  ]);
  // A failed timezone read falls back to the product default, same as dashboard-data.
  const timezone = (!tzRes.error && tzRes.data?.timezone) || 'America/New_York';

  // CH-1207: the next-event card hides; CH-1208: the Roster badge hides. Both are logged.
  if (eventRes.error) {
    chLogServer('shell', 'nextEvent', eventRes.error, 'calendar');
  }
  if (joinRes.error) {
    chLogServer('shell', 'joinRequests', joinRes.error, 'teams');
  }
  if (roundRes?.error) {
    chLogServer('shell', 'roundInProgress', roundRes.error, 'rounds');
  }
  // A failed read leaves the plain "Coach": the label only ever falls back to the lesser title.
  if (staffRes?.error) {
    chLogServer('shell', 'staffRole', staffRes.error, 'teams');
  }
  const round = roundRes && !roundRes.error ? roundRes.data : null;

  const upcoming = eventRes.error ? [] : (eventRes.data ?? []).filter((row) => !isClassEvent(row));
  const forPlayer = !!playerId && !coachId;
  // Decision B (owner, wave 7), as the player's Calendar has it: a player's next event is never a meeting they aren't
  // invited to (their own attendance row, which they read before and after migration 20261017102000); the card would
  // count down to it, by name, and open a calendar that doesn't show it. Only when that read failed does D2-8 decide (a
  // meeting nobody is invited to is the coach's own); when that failed too, no meeting is a player's next event.
  const ownRows = forPlayer && upcoming.length ? await loadOwnRows(supabase, upcoming.map((row) => row.id), playerId, (err) => chLogServer('shell', 'nextEventOwnReply', err, 'calendar')) : null;
  const own = ownRows ? new Map([...ownRows].map(([id, status]) => [id, rsvpOf(status)])) : null;
  const meetingIds = forPlayer && !own ? upcoming.filter((row) => row.event_type === 'meeting').map((row) => row.id) : [];
  const invited = meetingIds.length ? await loadInvitedCounts(supabase, meetingIds, (err) => chLogServer('shell', 'nextEventInvites', err, 'calendar')) : null;
  const e =
    upcoming.find((row) => row.event_type !== 'meeting' || !forPlayer || playerSeesMeeting(own ? own.has(row.id) : null, invited ? (invited.get(row.id) ?? null) : null)) ?? null;
  let ready: ChNextEvent['ready'] = null;
  /** Rows the coach's invitation wrote, for whether the whole team may reply; null when unread. */
  let coachInvited: number | null = null;
  // Only an event that asks for replies has a confirmed count; null (older rows) reads as off.
  if (e && e.requires_rsvp === true) {
    // A player reads the counts, never teammates' rows (migration 20261017102000); until that function exists, and for
    // a coach, the rows are read directly as before.
    const counts = forPlayer ? await loadAttendanceCounts(supabase, [e.id]) : null;
    if (counts?.kind === 'error') chLogServer('shell', 'nextEventAttendance', counts.error, 'calendar');
    else if (counts?.kind === 'ok') {
      const c = counts.byEvent.get(e.id);
      if (c && c.invited > 0) ready = { accepted: c.accepted, invited: c.invited };
      coachInvited = c?.coachInvited ?? 0;
    } else {
      // One event's invitees: at most a roster, well under the row cap.
      const { data, error } = await supabase.from('golf_event_attendance').select('status, notified_at').eq('event_id', e.id).limit(1000);
      if (error) chLogServer('shell', 'nextEventAttendance', error, 'calendar');
      else {
        if (data.length > 0) ready = { accepted: data.filter((a) => rsvpOf(a.status) === 'accepted').length, invited: data.length };
        coachInvited = data.filter((a) => a.notified_at).length;
      }
    }
  }
  // The player's own reply, by Home's rule (playerMine), so the card and Up next never disagree: an event open to the
  // whole team (the coach invited no one) asks them too.
  const mine: ChNextEvent['mine'] = e && own && e.requires_rsvp === true ? playerMine(own.get(e.id), replyClosedAt(e, Date.now()), coachInvited === null ? null : coachInvited === 0) : null;
  // CH-1304: nothing upcoming, so the sidebar shows no card.
  return {
    nextEvent: e ? { ...describeEvent(e, timezone), ready, ...(forPlayer ? { mine } : {}) } : null,
    pendingJoinRequests: joinRes.error ? null : (joinRes.count ?? 0),
    ...(coachId ? { overdueTasks } : {}),
    timezone,
    askAvailable: askOn,
    classAwareness: isFlagEnabled('class_awareness_v1'),
    course: courseOf(courseRes),
    roundInProgress: round ? { id: round.id, course: round.course_name?.trim() || 'Your round', hole: round.current_hole ?? null } : null,
    viewerIsHeadCoach: !!staffRes && !staffRes.error && (staffRes.data ?? []).some((row) => row.role === 'head_coach'),
  };
}

function dayNumber(d: Date, timezone: string): number {
  const [y, m, day] = isoDay(d, timezone)
    .split('-')
    .map(Number);
  return Date.UTC(y ?? 1970, (m ?? 1) - 1, day ?? 1) / 86_400_000;
}

function describeEvent(
  e: { id: string; title: string; start_time: string; all_day: boolean | null; location: string | null },
  timezone: string,
): Omit<ChNextEvent, 'ready'> {
  const start = new Date(e.start_time);
  const days = dayNumber(start, timezone) - dayNumber(new Date(), timezone);
  const whenLabel = days <= 0 ? 'Today' : days === 1 ? 'Tomorrow' : `In ${days} days`;
  const date = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short', month: 'short', day: 'numeric' }).format(start);
  const time = e.all_day
    ? 'All day'
    : new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: 'numeric', minute: '2-digit' }).format(start);
  const metaLabel = [date, time, e.location].filter(Boolean).join(' \u00b7 ');
  return { id: e.id, title: e.title, whenLabel, metaLabel };
}

type CourseRow = { course_latitude: number | null; course_longitude: number | null };
type CourseQuery = {
  select(cols: string): { eq(c: string, v: string): { maybeSingle(): Promise<{ data: CourseRow | null; error: { code?: string; message?: string } | null }> } };
};

/** The course point, or null: unset, unread, or the columns not there yet (42703 / PGRST204, logged only when it is something else). */
function courseOf(res: { data: CourseRow | null; error: { code?: string; message?: string } | null }): { lat: number; lng: number } | null {
  if (res.error) {
    const missing = res.error.code === '42703' || res.error.code === 'PGRST204';
    if (!missing) chLogServer('shell', 'courseLocation', res.error, 'teams');
    return null;
  }
  const lat = res.data?.course_latitude;
  const lng = res.data?.course_longitude;
  return lat != null && lng != null ? { lat, lng } : null;
}
