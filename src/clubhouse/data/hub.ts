import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { chunkIds } from '@/lib/supabase/chunk-ids';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import { CLASS_EVENT_TYPE } from '@/lib/calendar/class-events';
import { getAnnouncementsWithMeta } from '@/app/golf/actions/announcements';
import { getDocuments } from '@/app/golf/actions/documents';
import { getPlayerHubSummaryData } from '@/app/golf/actions/player-hub-data';
import { getPlayerHubAnnouncements } from '@/app/golf/actions/player-notifications';
import { getUnifiedNotifications } from '@/app/golf/actions/unified-notifications';
import { isGolfTaskOverdueInZone } from '@/lib/golf/task-overdue';
import { isSafeInternalPath } from '@/lib/utils/safe-redirect';
import type { GolfAnnouncementMeta } from '@/lib/types/golf';
import { chLogServer } from '../lib/track-server';
import { rsvpOf } from './calendar';
import { homeClock } from './home-clock';
import { currentSeasonLabel, fullName, loadSeasonRounds } from './season';
import { isoDay } from '../lib/dates';

/**
 * Team Hub (Clubhouse; docs/clubhouse/phone/team-hub.md). One server read for
 * either role, final data on first paint. Every section carries its own error
 * flag: a failed read renders a notice in that section, never an empty panel,
 * and never takes the page down. The player's reads go through the same
 * aggregate the player hub always used (getPlayerHubSummaryData), so the two
 * can't drift; the coach's are the team-wide reads the coach pages use.
 */

export type ChHubRole = 'coach' | 'player';
export type ChRsvp = 'accepted' | 'tentative' | 'declined' | 'pending';

export interface ChHubRsvp {
  eventId: string;
  title: string;
  /** Team-local YYYY-MM-DD. */
  date: string;
  /** "Wed" */
  weekday: string;
  day: number;
  /** "3:30 PM · Finley GC" */
  meta: string;
  mandatory: boolean;
  /** Player: their reply (pending until they answer). */
  mine: ChRsvp | null;
  /** Coach: replies so far; null when the replies didn't load. */
  counts: { going: number; maybe: number; no: number; none: number } | null;
}

export type ChHubUrgency = 'low' | 'normal' | 'high' | 'urgent';

export interface ChHubAnnouncement {
  id: string;
  title: string;
  body: string;
  /** Kept as posted: an edit sends it back unchanged (updateAnnouncement requires one; Clubhouse's composer has no control for it). */
  urgency: ChHubUrgency;
  by: string;
  byRole: string | null;
  /** "Today 2:28 PM", "Yesterday", "Oct 9" */
  when: string;
  createdAt: string;
  needAck: boolean;
  /** Player: whether they've acknowledged. */
  acked: boolean;
  /** Coach: acknowledged (or read) out of recipients. */
  ackCount: number;
  recipients: number;
  /**
   * Coach, on a post that asks for acknowledgement: who it went to that hasn't acknowledged yet, by name (players still on
   * the roster). Null or absent when that read failed or the post asks for none: the card then shows the count alone.
   */
  notAcked?: string[] | null;
  documentCount: number;
}

export interface ChHubTrip {
  id: string;
  name: string;
  destination: string | null;
  /** "Mon 3 – Wed 5 Nov" */
  dates: string;
  departDate: string | null;
  /** "Mon · 12:00 PM" */
  depart: string | null;
  /** The departure time as saved (HH:MM), for Edit; `depart` is the same time in words. */
  departTime: string | null;
  from: string | null;
  /** "Wed · 5:00 PM" */
  back: string | null;
  /** The return day (YYYY-MM-DD) and time (HH:MM) as saved, for Edit; `back` is the same in words. */
  returnDate: string | null;
  returnTime: string | null;
  hotel: string | null;
  transport: string | null;
  notes: string | null;
  uniform: string | null;
  gear: string | null;
  rooms: string | null;
  flight: string | null;
  eventId: string | null;
  /** Travelers' names (coach), from the linked event's invitees; null when unknown. */
  travelers: string[] | null;
  /** The same travelers' golf_players ids (coach): the "<trip> travelers" audience. */
  travelerIds: string[] | null;
  travelerCount: number | null;
  /** Player: invited to the linked event. */
  mine: boolean | null;
  upcoming: boolean;
  /** Whole days from today (the team's zone) to departure, 0 on the day; null once it has left or with no date. */
  inDays?: number | null;
}

export interface ChHubTripEvent {
  id: string;
  title: string;
  /** YYYY-MM-DD, in the team's zone */
  date: string;
  /** The last day the event runs (YYYY-MM-DD, inclusive); the trip's dates start from its span until the coach types their own. */
  endDate: string;
  /** "Mon Nov 3" */
  label: string;
  location: string | null;
  invited: string[] | null;
}

export interface ChHubTask {
  id: string;
  title: string;
  /** What it's for: its category or first line. */
  detail: string | null;
  dueDate: string | null;
  /** "Fri 17", "Tomorrow", "Today" */
  due: string | null;
  status: 'pending' | 'overdue' | 'completed';
  /** Coach: completed out of assigned. */
  done: [number, number] | null;
}

export interface ChHubFile {
  id: string;
  title: string;
  /** "PDF" */
  type: string;
  /** "84 KB" */
  size: string | null;
  /** "Oct 10" */
  date: string | null;
  /** Players can open it (`is_public`). A coach-only file is not offered in New announcement: the players it goes to couldn't open it (Q-83). */
  isPublic: boolean;
}

export interface ChHubUpdate {
  id: string;
  title: string;
  body: string | null;
  /** Only a link inside GolfHelm, as the bell follows it (isSafeInternalPath); anything else shows as plain text. */
  href: string | null;
  when: string;
  unread: boolean;
  /** Which feed the row came from, so opening it marks that row read (markNotificationRead), as the bell does. */
  source?: 'notifications' | 'golf_calendar_notifications';
}

/** One event on Home's week strip: any team event this week (a player's meetings only when invited; no classes). */
export interface ChHubWeekEvent {
  /** The calendar event's id: the same id an RSVP row carries, so the strip and the replies agree. */
  id: string;
  title: string;
  /** "3:30 PM", or "All day". */
  time: string;
  place: string | null;
  /** golf_events.event_type ("tournament", "practice", …). */
  kind: string;
}

export interface ChHubLedgerRow {
  id: string;
  name: string;
  replies: Array<{ id: string; title: string }> | null;
  posts: Array<{ id: string; title: string }> | null;
  tasks: Array<{ id: string; title: string; late: boolean }> | null;
  /** Rounds in 30 days and whether one fell in the last 14; null when rounds didn't load. */
  rounds: { n: number; recent: boolean } | null;
}

/** A day of Home's week strip: today and the six days after it, in the team's zone. */
export interface ChHubDay {
  /** YYYY-MM-DD, team-local. */
  date: string;
  weekday: string;
  day: number;
  events: ChHubWeekEvent[];
  /** The trip the team is on, leaving or coming home from that day; null when none. */
  trip: string | null;
}

export interface ChTeamHub {
  role: ChHubRole;
  teamId: string;
  teamName: string;
  season: string | null;
  viewerPlayerId: string | null;
  /** The team's active players (coach: audiences, travelers, assignees). Empty for a player. */
  players: Array<{ id: string; name: string }>;
  /** The coach's roster read failed: `players` is empty because it didn't load, not because the team has none (CH-10208). */
  playersError: boolean;
  rsvps: { rows: ChHubRsvp[]; error: boolean };
  /**
   * Coach: the team's upcoming calendar events a trip can be planned for (the trip builder's Event step), with who is
   * invited (its travelers). `invited` is null when attendance didn't load. Empty for a player.
   */
  tripEvents: { rows: ChHubTripEvent[]; error: boolean; /** How many there are when more than `rows` (the read is capped). */ total?: number | null };
  announcements: { rows: ChHubAnnouncement[]; error: boolean };
  trips: { rows: ChHubTrip[]; error: boolean };
  tasks: { rows: ChHubTask[]; error: boolean; /** How many there are when more than `rows` (the read is capped). */ total?: number | null };
  /**
   * Coach: how much the roster has played, for the head's one-line summary. Null when the rounds read failed (the line
   * leaves it out, never says "no rounds"); absent for a player.
   */
  pulse?: {
    rounds30: number;
    active14: number;
    players: number;
    /** Each active player's rounds in the 30 days, most first, and whether one fell in the last 14 (same read, no extra query). */
    byPlayer?: Array<{ id: string; name: string; rounds: number; recent: boolean }>;
  } | null;
  /**
   * Coach: Home's Waiting on, one row per active player: the replies they owe this week, the posts they haven't
   * acknowledged, their open tasks, and their rounds. A list is null when its read failed (the column says so, never
   * "none"). Absent for a player.
   */
  ledger?: ChHubLedgerRow[];
  /** Home's week strip: the team's events, today and the next six days. */
  week: { days: ChHubDay[]; error: boolean };
  documents: { folders: Array<{ name: string; files: ChHubFile[] }>; error: boolean };
  updates: { rows: ChHubUpdate[]; error: boolean };
}

/** The coach's task list and the trip builder's events are capped reads; each section says how many there are in all. */
export const HUB_TASK_CAP = 100;
export const HUB_TRIP_EVENT_CAP = 40;
/** Event types a team doesn't plan a trip for. */
const NOT_TRAVELED_FOR = ['practice', 'meeting'];

function log(read: string, error: unknown) {
  chLogServer('hub', read, error);
}

const TRIP_COLUMNS =
  'id, event_id, event_name, destination, transportation_type, departure_date, departure_time, departure_location, return_date, return_time, hotel_name, gear_list, room_assignments, notes, flight_info, uniform_requirements';

type TripRow = {
  id: string;
  event_id: string | null;
  event_name: string | null;
  destination: string | null;
  transportation_type: string | null;
  departure_date: string | null;
  departure_time: string | null;
  departure_location: string | null;
  return_date: string | null;
  return_time: string | null;
  hotel_name: string | null;
  gear_list: string[] | string | null;
  room_assignments: unknown;
  notes: string | null;
  flight_info: unknown;
  uniform_requirements: string | null;
};

/** JSON text fields (rooms, flights) as plain text: a string, `{text}`, or nothing. */
export function jsonText(v: unknown): string | null {
  if (v == null || v === '') return null;
  if (typeof v === 'string') return v;
  if (typeof v === 'object' && !Array.isArray(v) && 'text' in (v as Record<string, unknown>)) return String((v as Record<string, unknown>).text);
  return null;
}

/**
 * Rows a team flagged `is_test` (QA runs leave a post, a task, a file and a trip behind): never shown to a coach or a
 * player. Read by id for this team, so the shared reads (the player hub aggregate, getAnnouncementsWithMeta,
 * getDocuments) stay as Fairway reads them. A failed read hides nothing and is logged: a test row shown is better than
 * a real one missing.
 */
export type HiddenTestRows = { announcements: Set<string>; tasks: Set<string>; documents: Set<string>; trips: Set<string> };

async function hiddenTestRows(supabase: Awaited<ReturnType<typeof createClient>>, teamId: string): Promise<HiddenTestRows> {
  const ids = async (table: 'golf_announcements' | 'golf_tasks' | 'golf_documents' | 'golf_travel_itineraries') => {
    const { data, error } = await supabase.from(table).select('id, is_test').eq('team_id', teamId).eq('is_test', true).limit(200);
    if (error) log(`testRows:${table}`, error);
    // The flag is checked again here, so an answer that ignores the filter can never hide a real row.
    return new Set((data ?? []).filter((r) => r.is_test === true).map((r) => r.id));
  };
  const [announcements, tasks, documents, trips] = await Promise.all([ids('golf_announcements'), ids('golf_tasks'), ids('golf_documents'), ids('golf_travel_itineraries')]);
  return { announcements, tasks, documents, trips };
}

const without = <T extends { id: string }>(rows: T[], hidden: Set<string>): T[] => (hidden.size ? rows.filter((r) => !hidden.has(r.id)) : rows);

export async function loadTeamHub(input: { role: ChHubRole; teamId: string; userId: string; playerId: string | null }): Promise<ChTeamHub> {
  const supabase = await createClient();
  const now = new Date();
  // The team's clock is read in the first wave, beside the reads that don't need it (C2): only what is drawn from them does.
  const [clock, teamRes, rosterRes, docsRes, updatesRes, hidden] = await Promise.all([
    homeClock(supabase, input.teamId, now),
    supabase.from('golf_teams').select('name').eq('id', input.teamId).maybeSingle(),
    supabase.from('golf_team_members').select('player:golf_players(id, first_name, last_name)').eq('team_id', input.teamId).eq('status', 'active'),
    getDocuments(input.teamId).catch((err: unknown) => ({ data: null, error: err instanceof Error ? err.message : 'failed' })),
    getUnifiedNotifications({ limit: 6 }).catch(() => ({ success: false as const, error: 'failed' })),
    hiddenTestRows(supabase, input.teamId),
  ]);
  const { tz } = clock;
  const today = isoDay(now, tz);
  const f = formatters(tz, now);
  if (teamRes.error) log('team', teamRes.error);
  if (rosterRes.error) log('roster', rosterRes.error);
  if (docsRes.error) log('documents', docsRes.error);
  if (!updatesRes.success) log('updates', 'error' in updatesRes ? updatesRes.error : 'failed');

  type P = { id: string; first_name: string | null; last_name: string | null };
  const roster = ((rosterRes.data ?? []) as Array<{ player: P | null }>).map((m) => m.player).filter((p): p is P => !!p);
  const names = new Map(roster.map((p) => [p.id, fullName(p)]));

  const base = {
    role: input.role,
    teamId: input.teamId,
    teamName: teamRes.data?.name ?? 'Your team',
    // Computed from 1 August in the team's zone, never the stored free text (F-0002).
    season: currentSeasonLabel(now, tz),
    viewerPlayerId: input.role === 'player' ? input.playerId : null,
    playersError: input.role === 'coach' && !!rosterRes.error,
    players: input.role === 'coach' ? roster.map((p) => ({ id: p.id, name: fullName(p) })).sort((a, b) => a.name.localeCompare(b.name)) : [],
    documents: { folders: docsRes.error ? [] : folders(without(docsRes.data ?? [], hidden.documents), f), error: !!docsRes.error },
    updates: {
      rows: updatesRes.success && updatesRes.data
        ? updatesRes.data.items.slice(0, 6).map((n) => ({
            id: n.id,
            title: n.title,
            body: n.body,
            href: isSafeInternalPath(n.action_url) ? n.action_url : null,
            when: f.ago(n.created_at),
            unread: !n.read_at,
            source: n.source,
          }))
        : [],
      error: !updatesRes.success,
    },
  };

  if (input.role === 'player') {
    const playerId = input.playerId!;
    let summary: Awaited<ReturnType<typeof getPlayerHubSummaryData>> | null = null;
    try {
      summary = await getPlayerHubSummaryData(input.teamId, playerId);
    } catch (err) {
      // The aggregate throws on a failed events, travel or tasks read: those three sections say so.
      log('playerSummary', err);
    }
    const anns = summary && !summary.announcementsLoadError ? summary.announcements : null;
    const annsFallback = summary ? null : await getPlayerHubAnnouncements(input.teamId, playerId).catch(() => null);
    const annList = ((a) => (a ? without(a, hidden.announcements) : a))(anns ?? (annsFallback?.success ? (annsFallback.data ?? []) : null));
    if (!annList) log('announcements', 'player announcements did not load');
    // A trip is the player's when they're invited to its event. The aggregate's trips carry no event_id (its select
    // leaves it out), so the link is read here, for those trips only; a failed read leaves every trip unknown (C-19).
    const playerTrips = without(summary?.trips ?? [], hidden.trips);
    const tripLinks = await tripEventIds(supabase, playerTrips.map((t) => t.id));
    const tripEvents = tripLinks ? [...new Set(tripLinks.values())] : [];
    // The aggregate lists every team event, with the player's own reply or null when they have no place on its invite
    // list (an attendance row is what invites someone, as in Calendar). Only their own are theirs to answer: a reply to
    // any other would add them to that event's list.
    const replyable = (summary?.events ?? []).filter((e) => e.event_type !== CLASS_EVENT_TYPE && e.rsvp_status != null);
    const [authors, invited, closed] = await Promise.all([
      authorNames(supabase, annList ?? []),
      tripLinks ? invitedTo(supabase, tripEvents, playerId) : Promise.resolve(null),
      closedReplies(supabase, replyable.map((e) => e.event_id), now.getTime()),
    ]);
    const playerTripRows = summary
      ? playerTrips.map((t) => {
          const eventId = tripLinks?.get(t.id) ?? null;
          // No event: nobody is invited to anything, so whether the player travels is unknown, not "Not traveling".
          return trip({ ...(t as unknown as TripRow), event_id: eventId }, f, today, { travelers: null, count: null, mine: eventId && invited ? invited.has(eventId) : null });
        })
      : [];
    return {
      ...base,
      tripEvents: { rows: [], error: false },
      rsvps: {
        // Only events that still take a reply: respondToEvent refuses the rest, so they get no Going / Maybe / Can't.
        // An event that doesn't ask for replies is never listed (owner, 2026-10-08); when that couldn't be read, the
        // section says so rather than offering replies the coach never asked for.
        rows: replyable
          .filter((e) => !closed.error && !closed.has(e.event_id))
          .map((e) => ({
            eventId: e.event_id,
            title: e.title,
            ...f.day(e.start_time),
            meta: [closed.allDay.has(e.event_id) ? 'All day' : f.time(e.start_time), e.location].filter(Boolean).join(' · '),
            mandatory: e.is_mandatory,
            mine: (e.rsvp_status ?? 'pending') as ChRsvp,
            counts: null,
          })),
        error: !summary || closed.error,
      },
      announcements: { rows: (annList ?? []).map((a) => announcement(a, authors, f, 'player')), error: !annList },
      trips: { rows: playerTripRows, error: !summary },
      // The aggregate's events are the team's (a meeting only when the player is invited); classes are left out.
      week: {
        days: weekOf(
          today,
          f,
          (summary?.events ?? []).filter((e) => e.event_type !== CLASS_EVENT_TYPE).map((e) => ({ ...e, id: e.event_id, all_day: closed.allDay.has(e.event_id) })),
          playerTripRows,
        ),
        error: !summary,
      },
      tasks: {
        rows: taskOrder(without(summary?.tasks ?? [], hidden.tasks).map((t) => ({
          id: t.id,
          title: t.title,
          detail: t.category ?? firstLine(t.description),
          dueDate: t.due_date,
          due: t.due_date ? f.due(t.due_date, today) : null,
          status: t.status as ChHubTask['status'],
          done: null,
        }))),
        error: !summary,
      },
    };
  }

  // ── Coach ──
  const weekEnd = addDays(today, 7);
  const [annRes, tripsRes, tasksRes, eventsRes, tripEventsRes, weekRes] = await Promise.all([
    getAnnouncementsWithMeta(input.teamId, input.userId, true).catch(() => ({ success: false as const, error: 'failed' })),
    supabase.from('golf_travel_itineraries').select(TRIP_COLUMNS).eq('team_id', input.teamId).gte('departure_date', addDays(today, -60)).order('departure_date', { ascending: true }).limit(50),
    // Capped (C-20): the latest due and the undated are kept, so the cap drops the oldest, not this week's; the section
    // says how many there are in all.
    supabase
      .from('golf_tasks')
      .select('id, title, description, due_date, category, status', { count: 'exact' })
      .eq('team_id', input.teamId)
      .is('parent_task_id', null)
      .order('due_date', { ascending: false, nullsFirst: true })
      .limit(HUB_TASK_CAP),
    // The RSVPs section: this week's events that ask for replies (owner, 2026-10-08: off unless the coach turns it on).
    supabase
      .from('golf_events')
      .select('id, title, event_type, start_time, all_day, location')
      .eq('team_id', input.teamId)
      .neq('event_type', CLASS_EVENT_TYPE)
      .eq('requires_rsvp', true)
      .is('cancelled_at', null)
      .gte('start_time', now.toISOString())
      .lt('start_time', `${weekEnd}T23:59:59Z`)
      .order('start_time', { ascending: true })
      .limit(50),
    // The trip builder's Event step: the next four months of events a team travels for. Classes, practices and
    // meetings are left out (C-20): a season's practices filled the cap before the tournaments were reached.
    supabase
      .from('golf_events')
      .select('id, title, event_type, start_time, end_time, all_day, location', { count: 'exact' })
      .eq('team_id', input.teamId)
      .not('event_type', 'in', `(${[CLASS_EVENT_TYPE, ...NOT_TRAVELED_FOR].join(',')})`)
      .is('cancelled_at', null)
      .gte('start_time', now.toISOString())
      .lt('start_time', `${addDays(today, 120)}T23:59:59Z`)
      .order('start_time', { ascending: true })
      .limit(HUB_TRIP_EVENT_CAP),
    // Home's week strip: every team event from the start of today to the end of the sixth day after it (classes are a
    // player's own timetable and never the team's). Wide by a day each side of UTC; weekOf keeps the team-local days.
    supabase
      .from('golf_events')
      .select('id, title, event_type, start_time, all_day, location')
      .eq('team_id', input.teamId)
      .neq('event_type', CLASS_EVENT_TYPE)
      .is('cancelled_at', null)
      .gte('start_time', `${addDays(today, -1)}T00:00:00Z`)
      .lt('start_time', `${addDays(today, 8)}T00:00:00Z`)
      .order('start_time', { ascending: true })
      .limit(100),
  ]);
  if (weekRes.error) log('week', weekRes.error);
  if (tripEventsRes.error) log('tripEvents', tripEventsRes.error);
  if (!annRes.success) log('announcements', 'error' in annRes ? annRes.error : 'failed');
  if (tripsRes.error) log('trips', tripsRes.error);
  if (tasksRes.error) log('tasks', tasksRes.error);
  if (eventsRes.error) log('events', eventsRes.error);

  const trips = without((tripsRes.data ?? []) as unknown as TripRow[], hidden.trips);
  // Soonest due first, the undated last; the rows are put in their shown order (`taskOrder`) once their status is known.
  const tasks = without(tasksRes.data ?? [], hidden.tasks).slice().sort((a, b) => (a.due_date ?? '\uffff').localeCompare(b.due_date ?? '\uffff'));
  const events = eventsRes.data ?? [];
  const tripEvents = tripEventsRes.data ?? [];
  // One attendance read for this week's events, the trips' events and the builder's events; one for task completion.
  const anns = annRes.success ? without(annRes.data ?? [], hidden.announcements) : [];
  const owedPosts = new Map<string, string[]>();
  const [attendance, assignments, authors, waiting, pulse] = await Promise.all([
    attendanceFor(supabase, [...events.map((e) => e.id), ...trips.map((t) => t.event_id).filter((id): id is string => !!id), ...tripEvents.map((e) => e.id)]),
    assignmentsFor(supabase, tasks.map((t) => t.id)),
    authorNames(supabase, anns),
    // An all-team post's audience is the roster: without it, who is left is unknown.
    rosterRes.error ? null : notAckedFor(supabase, anns.filter((a) => a.requires_acknowledgement).map((a) => a.id), names, owedPosts),
    rosterRes.error ? Promise.resolve(null) : rosterPulse(supabase, names, today),
  ]);

  // Waiting on: built from reads already made above (attendance, acknowledgements, assignments, rounds); no new query.
  const taskRows = new Map(tasks.map((t) => [t.id, t]));
  const annTitles = new Map(anns.map((a) => [a.id, a.title]));
  const rounds = new Map((pulse?.byPlayer ?? []).map((p) => [p.id, p]));
  const ledger: ChHubLedgerRow[] = rosterRes.error
    ? []
    : roster
        .map((p) => ({
          id: p.id,
          name: fullName(p),
          replies: attendance.error
            ? null
            : events.filter((e) => (attendance.byEvent.get(e.id) ?? []).some((r) => r.player === p.id && r.status === 'pending')).map((e) => ({ id: e.id, title: e.title })),
          posts: waiting ? (owedPosts.get(p.id) ?? []).map((id) => ({ id, title: annTitles.get(id) ?? 'Post' })) : null,
          tasks: assignments.error
            ? null
            : (assignments.openByPlayer.get(p.id) ?? [])
                .map((id) => taskRows.get(id))
                .filter((t): t is NonNullable<typeof t> => !!t)
                .map((t) => ({ id: t.id, title: t.title, late: !!t.due_date && isGolfTaskOverdueInZone(t.due_date, tz) })),
          rounds: pulse ? { n: rounds.get(p.id)?.rounds ?? 0, recent: rounds.get(p.id)?.recent ?? false } : null,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

  const tripRows = trips.map((t) => {
    // Travelers are named from the roster: without it they are unknown (null), never "0 travelers" (CH-10208).
    const ids = t.event_id && !attendance.error && !rosterRes.error ? (attendance.byEvent.get(t.event_id) ?? []).map((r) => r.player).filter((id) => names.has(id)) : null;
    const who = ids ? ids.map((id) => names.get(id)!) : null;
    return trip(t, f, today, { travelers: who, ids, count: who ? who.length : null, mine: null });
  });

  return {
    ...base,
    rsvps: {
      rows: events.map((e) => {
        const rows = attendance.byEvent.get(e.id) ?? [];
        return {
          eventId: e.id,
          title: e.title,
          ...f.day(e.start_time),
          // An all-day event has no clock time: its midnight start read "12:00 AM" (swap audit F-53).
          meta: [e.all_day ? 'All day' : f.time(e.start_time), e.location].filter(Boolean).join(' · '),
          // golf_events has no mandatory column (get_player_hub_events returns FALSE too); Q-71.
          mandatory: false,
          mine: null,
          counts: attendance.error ? null : rsvpCounts(rows),
        };
      }),
      error: !!eventsRes.error,
    },
    announcements: {
      rows: anns.map((a) => {
        const row = announcement(a, authors, f, 'coach');
        return a.requires_acknowledgement ? { ...row, notAcked: waiting ? (waiting.get(a.id) ?? []) : null } : row;
      }),
      error: !annRes.success,
    },
    tripEvents: {
      rows: tripEvents.map((e) => {
        const span = eventSpan(e, f);
        return {
          id: e.id,
          title: e.title,
          date: span.from,
          endDate: span.to,
          label: `${span.weekday} ${span.short}`,
          location: e.location,
          invited: attendance.error ? null : (attendance.byEvent.get(e.id) ?? []).map((r) => r.player),
        };
      }),
      error: !!tripEventsRes.error,
      total: tripEventsRes.count ?? null,
    },
    trips: { rows: tripRows, error: !!tripsRes.error },
    week: { days: weekOf(today, f, weekRes.data ?? [], tripRows), error: !!weekRes.error },
    ledger,
    tasks: {
      rows: taskOrder(tasks.map((t) => {
        const a = assignments.byTask.get(t.id);
        return {
          id: t.id,
          title: t.title,
          detail: t.category ?? firstLine(t.description),
          dueDate: t.due_date,
          due: t.due_date ? f.due(t.due_date, today) : null,
          status: taskStatus(t.due_date, a, tz),
          done: assignments.error || !a ? null : [a.done, a.total],
        };
      })),
      error: !!tasksRes.error,
      total: tasksRes.count == null ? null : Math.max(0, tasksRes.count - hidden.tasks.size),
    },
    pulse,
  };
}

/** Coach: rounds the roster logged in 30 days and how many players logged one in 14, or null when the read failed. */
async function rosterPulse(supabase: Awaited<ReturnType<typeof createClient>>, names: Map<string, string>, today: string): Promise<NonNullable<ChTeamHub['pulse']> | null> {
  const playerIds = [...names.keys()];
  if (!playerIds.length) return { rounds30: 0, active14: 0, players: 0, byPlayer: [] };
  const res = await loadSeasonRounds(supabase, playerIds, { surface: 'hub', since: addDays(today, -30) });
  if (res.error) return null;
  const since14 = addDays(today, -14);
  const active = new Set(res.rounds.filter((r) => r.round_date.slice(0, 10) >= since14).map((r) => r.player_id));
  const count = new Map<string, number>();
  for (const r of res.rounds) count.set(r.player_id, (count.get(r.player_id) ?? 0) + 1);
  const byPlayer = playerIds
    .map((id) => ({ id, name: names.get(id) ?? 'Player', rounds: count.get(id) ?? 0, recent: active.has(id) }))
    .sort((a, b) => b.rounds - a.rounds || a.name.localeCompare(b.name));
  return { rounds30: res.rounds.length, active14: active.size, players: playerIds.length, byPlayer };
}

/**
 * Home's week strip: today and the next six days, each with its events (soonest first) and the trip it falls in. The
 * events come from a read the caller already made; trips mark the days from leaving to coming home.
 */
export function weekOf(
  today: string,
  f: ReturnType<typeof formatters>,
  events: Array<{ id: string; title: string; start_time: string; all_day?: boolean | null; location: string | null; event_type: string }>,
  trips: ChHubTrip[],
): ChHubDay[] {
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(today, i);
    const todays = events
      // An all-day event is stored at UTC midnight: read its date as written, never a day early west of UTC (eventSpan).
      .filter((e) => (e.all_day ? e.start_time.slice(0, 10) : f.day(e.start_time).date) === date)
      .sort((a, b) => a.start_time.localeCompare(b.start_time))
      .map((e) => ({ id: e.id, title: e.title, time: e.all_day ? 'All day' : f.time(e.start_time), place: e.location, kind: e.event_type }));
    const on = trips.find((t) => t.departDate && t.departDate <= date && (t.returnDate ?? t.departDate) >= date);
    return { date, weekday: f.wd(date), day: Number(date.slice(8, 10)), events: todays, trip: on?.name ?? null };
  });
}

/** An event's replies so far, by answer (the coach's RSVPs section); `none` is who hasn't replied. */
export function rsvpCounts(rows: ReadonlyArray<{ status: ChRsvp }>): NonNullable<ChHubRsvp['counts']> {
  const count = (s: ChRsvp) => rows.filter((r) => r.status === s).length;
  return { going: count('accepted'), maybe: count('tentative'), no: count('declined'), none: count('pending') };
}

/** A coach's task: completed when every assignee has done it, overdue when its due day has passed in the team's zone, else pending. */
export function taskStatus(dueDate: string | null, assigned: { done: number; total: number } | undefined, tz: string): ChHubTask['status'] {
  return assigned && assigned.total > 0 && assigned.done === assigned.total ? 'completed' : dueDate && isGolfTaskOverdueInZone(dueDate, tz) ? 'overdue' : 'pending';
}

/**
 * Replies still missing (Coach Home's "Waiting on you", the same number as the Hub's "no reply"): over the RSVPs rows,
 * the players who haven't answered, on each event still taking a reply (`open`; the Hub's rows are listed only while
 * they ask for one, so a row without the flag counts). Null when any row's replies didn't load: the count is unknown,
 * never a short one.
 */
export function rsvpQueue(rows: ReadonlyArray<Pick<ChHubRsvp, 'eventId' | 'counts'> & { open?: boolean }>): { missing: number; events: Array<{ eventId: string; missing: number }> } | null {
  if (rows.some((r) => r.counts == null)) return null;
  const events = rows.filter((r) => r.open !== false && r.counts!.none > 0).map((r) => ({ eventId: r.eventId, missing: r.counts!.none }));
  return { missing: events.reduce((a, e) => a + e.missing, 0), events };
}

/** Tasks past their due day and not done by everyone they were set for (the Hub's Overdue rows). */
export function overdueTaskCount(rows: ReadonlyArray<Pick<ChHubTask, 'status'>>): number {
  return rows.filter((t) => t.status === 'overdue').length;
}

/** Posts asking for an acknowledgement that someone they went to hasn't given yet (the Hub's "waiting on" posts). Null when who is left didn't load. */
export function unackedPostCount(rows: ReadonlyArray<Pick<ChHubAnnouncement, 'needAck' | 'notAcked'>>): number | null {
  const asking = rows.filter((a) => a.needAck);
  if (asking.some((a) => a.notAcked == null)) return null;
  return asking.filter((a) => a.notAcked!.length > 0).length;
}

export async function attendanceFor(supabase: Awaited<ReturnType<typeof createClient>>, eventIds: string[]) {
  const byEvent = new Map<string, Array<{ player: string; status: ChRsvp }>>();
  for (const ids of chunkIds([...new Set(eventIds)])) {
    // Paged: a season's events times a full roster passes PostgREST's 1000-row cap.
    const { data, error } = await fetchAllRowsResult((from, to) =>
      supabase.from('golf_event_attendance').select('event_id, player_id, status').in('event_id', ids).order('id', { ascending: true }).range(from, to),
    );
    if (error) {
      log('attendance', error);
      return { byEvent, error: true };
    }
    for (const a of data ?? []) byEvent.set(a.event_id, [...(byEvent.get(a.event_id) ?? []), { player: a.player_id, status: rsvpOf(a.status) as ChRsvp }]);
  }
  return { byEvent, error: false };
}

/**
 * Each trip's calendar event, by trip id (trips with none are left out), or null when the read failed. The player hub
 * aggregate (getPlayerHubSummaryData) selects no event_id, so without this a player's pass always read "—".
 */
export async function tripEventIds(supabase: Awaited<ReturnType<typeof createClient>>, tripIds: string[]): Promise<Map<string, string> | null> {
  const out = new Map<string, string>();
  for (const ids of chunkIds([...new Set(tripIds)])) {
    const { data, error } = await supabase.from('golf_travel_itineraries').select('id, event_id').in('id', ids);
    if (error) {
      log('tripLinks', error);
      return null;
    }
    for (const r of data ?? []) if (r.event_id) out.set(r.id, r.event_id);
  }
  return out;
}

/** The trips' events the player is invited to, or null when the read failed: unknown, never "Not traveling" (C-19). */
async function invitedTo(supabase: Awaited<ReturnType<typeof createClient>>, eventIds: string[], playerId: string): Promise<Set<string> | null> {
  if (!eventIds.length) return new Set();
  const { data, error } = await supabase.from('golf_event_attendance').select('event_id').in('event_id', eventIds).eq('player_id', playerId);
  if (error) {
    log('tripInvites', error);
    return null;
  }
  return new Set((data ?? []).map((r) => r.event_id));
}

/**
 * The rules respondToEvent enforces (updateRSVP in lib/calendar/rsvp.ts): a cancelled event takes no reply, nor one that
 * has started (an all-day event a day after its stored start), nor one past its RSVP deadline. And an event that doesn't
 * ask for replies takes none (owner, 2026-10-08: RSVP is off unless the coach turns it on; null reads as off).
 */
export function replyIsClosed(
  e: { status: string | null; cancelled_at: string | null; all_day: boolean | null; start_time: string | null; rsvp_deadline: string | null; requires_rsvp?: boolean | null },
  nowMs: number,
): boolean {
  if (e.requires_rsvp !== true) return true;
  if (e.status === 'cancelled' || e.cancelled_at) return true;
  const start = e.start_time ? new Date(e.start_time).getTime() : NaN;
  if (Number.isFinite(start) && (e.all_day ? start + 86400000 : start) <= nowMs) return true;
  return !!e.rsvp_deadline && new Date(e.rsvp_deadline).getTime() < nowMs;
}

/**
 * Which of these events take no reply, and which are all day (the hub summary carries no all_day, F-53). A read that
 * fails sets `error`: whether an event asks for replies is unknown then, so the caller lists none and says so.
 */
async function closedReplies(
  supabase: Awaited<ReturnType<typeof createClient>>,
  eventIds: string[],
  nowMs: number,
): Promise<Set<string> & { allDay: Set<string>; error: boolean }> {
  const closed = Object.assign(new Set<string>(), { allDay: new Set<string>(), error: false });
  for (const ids of chunkIds([...new Set(eventIds)])) {
    const { data, error } = await supabase.from('golf_events').select('id, status, cancelled_at, all_day, start_time, rsvp_deadline, requires_rsvp').in('id', ids);
    if (error) {
      log('eventReplyRules', error);
      closed.error = true;
      continue;
    }
    for (const e of data ?? []) {
      if (replyIsClosed(e, nowMs)) closed.add(e.id);
      if (e.all_day) closed.allDay.add(e.id);
    }
  }
  return closed;
}

export async function assignmentsFor(supabase: Awaited<ReturnType<typeof createClient>>, taskIds: string[]) {
  const byTask = new Map<string, { done: number; total: number }>();
  /** Each player's tasks not yet completed (Home's Waiting on), from the same rows. */
  const openByPlayer = new Map<string, string[]>();
  for (const ids of chunkIds(taskIds)) {
    // Paged: tasks times players passes PostgREST's 1000-row cap.
    const { data, error } = await fetchAllRowsResult((from, to) =>
      supabase.from('golf_task_assignments').select('task_id, player_id, status').in('task_id', ids).order('id', { ascending: true }).range(from, to),
    );
    if (error) {
      log('assignments', error);
      return { byTask, openByPlayer, error: true };
    }
    for (const a of data ?? []) {
      const cur = byTask.get(a.task_id) ?? { done: 0, total: 0 };
      const finished = a.status === 'completed';
      byTask.set(a.task_id, { done: cur.done + (finished ? 1 : 0), total: cur.total + 1 });
      if (!finished && a.player_id) (openByPlayer.get(a.player_id) ?? openByPlayer.set(a.player_id, []).get(a.player_id)!).push(a.task_id);
    }
  }
  return { byTask, openByPlayer, error: false };
}

/**
 * Coach: who each post asking for acknowledgement went to and hasn't acknowledged, by name, sorted. A post with recipient
 * rows went to those players; one without went to the active roster (`names`), as getAnnouncementsWithMeta counts it.
 * A player who has left the roster has no name here and is not listed. Both reads page (a season of posts times the roster
 * passes PostgREST's 1000-row cap, and a short ack read would list players who did acknowledge). Either read failing
 * returns null, and the cards keep the count alone.
 */
export async function notAckedFor(
  supabase: Awaited<ReturnType<typeof createClient>>,
  announcementIds: string[],
  names: Map<string, string>,
  /** Filled, when given, with each player still to acknowledge and the posts they owe (Home's Waiting on). */
  byPlayer?: Map<string, string[]>,
): Promise<Map<string, string[]> | null> {
  const out = new Map<string, string[]>();
  if (!announcementIds.length) return out;
  const to = new Map<string, Set<string>>();
  const acked = new Map<string, Set<string>>();
  const add = (m: Map<string, Set<string>>, k: string, v: string) => (m.get(k) ?? m.set(k, new Set()).get(k)!).add(v);
  for (const ids of chunkIds(announcementIds)) {
    const [recipients, acks] = await Promise.all([
      fetchAllRowsResult((from, last) =>
        supabase.from('golf_announcement_recipients').select('announcement_id, player_id').in('announcement_id', ids).order('id', { ascending: true }).range(from, last),
      ),
      fetchAllRowsResult((from, last) =>
        supabase.from('golf_announcement_acknowledgements').select('announcement_id, player_id').in('announcement_id', ids).order('id', { ascending: true }).range(from, last),
      ),
    ]);
    if (recipients.error || acks.error) {
      log('announcementAcks', recipients.error ?? acks.error);
      return null;
    }
    for (const r of recipients.data ?? []) add(to, r.announcement_id, r.player_id);
    for (const a of acks.data ?? []) add(acked, a.announcement_id, a.player_id);
  }
  for (const id of announcementIds) {
    const audience = to.get(id) ?? new Set(names.keys());
    const done = acked.get(id);
    const left = [...audience].filter((p) => !done?.has(p) && names.has(p));
    if (byPlayer) for (const p of left) (byPlayer.get(p) ?? byPlayer.set(p, []).get(p)!).push(id);
    out.set(id, left.map((p) => names.get(p)!).sort((a, b) => a.localeCompare(b)));
  }
  return out;
}

/** Announcement authors: coaches by user id, with their title. */
async function authorNames(supabase: Awaited<ReturnType<typeof createClient>>, anns: GolfAnnouncementMeta[]) {
  const ids = [...new Set(anns.map((a) => a.created_by).filter((id): id is string => !!id))];
  const out = new Map<string, { name: string; title: string | null }>();
  if (!ids.length) return out;
  const { data, error } = await supabase.from('golf_coaches').select('user_id, full_name, title').in('user_id', ids);
  if (error) log('authors', error);
  for (const c of data ?? []) if (c.user_id) out.set(c.user_id, { name: c.full_name?.trim() || 'Coach', title: c.title?.trim() || null });
  return out;
}

function announcement(a: GolfAnnouncementMeta, authors: Map<string, { name: string; title: string | null }>, f: ReturnType<typeof formatters>, role: ChHubRole): ChHubAnnouncement {
  const who = a.created_by ? authors.get(a.created_by) : undefined;
  const at = a.published_at ?? a.created_at ?? '';
  return {
    id: a.id,
    title: a.title,
    body: a.body ?? '',
    urgency: a.urgency === 'low' || a.urgency === 'high' || a.urgency === 'urgent' ? a.urgency : 'normal',
    by: who?.name ?? 'Coach',
    byRole: who?.title ?? null,
    when: at ? f.ago(at) : '',
    createdAt: at,
    needAck: !!a.requires_acknowledgement,
    acked: !!a.has_player_acknowledged,
    // Read receipts are the coach's. The player's data has none: the announcements read gives them team-wide counts, and
    // the screen would only hide them, so they never leave the server for a player (100802).
    ackCount: role === 'coach' ? (a.acknowledged_count ?? 0) : 0,
    recipients: role === 'coach' ? (a.total_recipients ?? a.recipient_count ?? 0) : 0,
    documentCount: a.document_count ?? 0,
  };
}

export function trip(t: TripRow, f: ReturnType<typeof formatters>, today: string, who: { travelers: string[] | null; ids?: string[] | null; count: number | null; mine: boolean | null }): ChHubTrip {
  const gear = Array.isArray(t.gear_list) ? t.gear_list.join(', ') : t.gear_list;
  return {
    id: t.id,
    name: t.event_name || t.destination || 'Team trip',
    destination: t.destination,
    dates: f.range(t.departure_date, t.return_date),
    departDate: t.departure_date,
    // Written as `back` is, so the pass and the plan read both the same way.
    depart: t.departure_date ? [f.wd(t.departure_date), t.departure_time ? f.clock(t.departure_time) : null].filter(Boolean).join(' · ') : null,
    // `time` columns come back as HH:MM:SS; the time field takes HH:MM.
    departTime: t.departure_time ? t.departure_time.slice(0, 5) : null,
    from: t.departure_location,
    back: t.return_date ? [f.wd(t.return_date), t.return_time ? f.clock(t.return_time) : null].filter(Boolean).join(' · ') : null,
    returnDate: t.return_date,
    returnTime: t.return_time ? t.return_time.slice(0, 5) : null,
    hotel: t.hotel_name,
    transport: t.transportation_type,
    notes: t.notes,
    uniform: t.uniform_requirements,
    gear: gear || null,
    rooms: jsonText(t.room_assignments),
    flight: jsonText(t.flight_info),
    eventId: t.event_id,
    travelers: who.travelers,
    travelerIds: who.ids ?? null,
    travelerCount: who.count,
    mine: who.mine,
    upcoming: !!t.departure_date && (t.return_date ?? t.departure_date) >= today,
    inDays: t.departure_date && t.departure_date >= today ? f.daysBetween(today, t.departure_date) : null,
  };
}

const TYPE_OF: Record<string, string> = { pdf: 'PDF', doc: 'DOC', docx: 'DOC', xls: 'XLS', xlsx: 'XLS', csv: 'XLS', png: 'IMG', jpg: 'IMG', jpeg: 'IMG', gif: 'IMG', webp: 'IMG', heic: 'IMG', txt: 'TXT', md: 'TXT' };

/** A stored MIME type's short name, for the types a team shares (production stores the MIME; older rows an extension). */
const KIND_OF_MIME: Record<string, string> = {
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'text/plain': 'txt',
  'text/markdown': 'md',
  'text/csv': 'csv',
};

/**
 * The file's kind as TYPE_OF reads it: from a MIME type (`application/pdf` -> `pdf`, an image -> `png`), from an
 * extension stored in its place, else from the file's address. A Word file's `application/vnd.openxml…` read "VND."
 */
export function fileKind(fileType: string | null, fileUrl: string): string {
  const t = (fileType ?? '').trim().toLowerCase();
  if (t.includes('/')) {
    if (KIND_OF_MIME[t]) return KIND_OF_MIME[t];
    const sub = t.split('/')[1]!.split(/[;+]/)[0]!;
    if (TYPE_OF[sub] || t.startsWith('image/')) return TYPE_OF[sub] ? sub : 'png';
  } else if (t) return t;
  const fromUrl = fileUrl.split('?')[0]!.split('/').pop() ?? '';
  return fromUrl.includes('.') ? fromUrl.split('.').pop()!.toLowerCase() : '';
}

/** Folders in first-seen order ("Team" for none), files newest first. */
export function folders(docs: Array<{ id: string; title: string; folder: string | null; file_type: string | null; file_url: string; file_size: number | null; updated_at: string | null; created_at: string | null; is_public?: boolean | null }>, f: ReturnType<typeof formatters>) {
  const out = new Map<string, ChHubFile[]>();
  const sorted = [...docs].sort((a, b) => (b.updated_at ?? b.created_at ?? '').localeCompare(a.updated_at ?? a.created_at ?? ''));
  for (const d of sorted) {
    const name = d.folder?.trim() || 'Team';
    const ext = fileKind(d.file_type, d.file_url);
    out.set(name, [
      ...(out.get(name) ?? []),
      {
        id: d.id,
        title: d.title,
        type: TYPE_OF[ext] ?? (ext.slice(0, 4).toUpperCase() || 'FILE'),
        size: d.file_size ? bytes(d.file_size) : null,
        date: d.updated_at || d.created_at ? f.short(d.updated_at ?? d.created_at!) : null,
        // The policy reads `is_public = true` for a player: anything else (false, null, not read) is coach-only.
        isPublic: d.is_public === true,
      },
    ]);
  }
  return [...out.entries()].map(([name, files]) => ({ name, files }));
}

export function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** The order a task list is shown in: the open ones first, then soonest due, the undated last (wave 7: a done task never sits above an open one). */
export function taskOrder(rows: ChHubTask[]): ChHubTask[] {
  const open = (t: ChHubTask) => (t.status === 'completed' ? 1 : 0);
  return [...rows].sort((a, b) => open(a) - open(b) || (a.dueDate ?? '\uffff').localeCompare(b.dueDate ?? '\uffff'));
}

function firstLine(s: string | null): string | null {
  const line = s?.split('\n')[0]?.trim();
  return line ? (line.length > 60 ? `${line.slice(0, 57)}…` : line) : null;
}

/**
 * The days an event runs, in the team's zone. An all-day event is stored at UTC midnight, so its date is the one written
 * (zoning it would put it a day early west of UTC), and its `end_time` is the inclusive last day. A timed event's days are
 * the ones its start and end fall on. A missing or inverted end is the start's own day.
 */
export function eventSpan(e: { start_time: string; end_time?: string | null; all_day?: boolean | null }, f: ReturnType<typeof formatters>) {
  const from = e.all_day ? e.start_time.slice(0, 10) : f.day(e.start_time).date;
  const end = e.end_time ? (e.all_day ? e.end_time.slice(0, 10) : f.day(e.end_time).date) : from;
  const anchor = e.all_day ? `${from}T12:00:00Z` : e.start_time;
  return { from, to: end < from ? from : end, weekday: e.all_day ? f.wd(from) : f.day(e.start_time).weekday, short: e.all_day ? f.short(anchor) : f.short(e.start_time) };
}

function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + n)).toISOString().slice(0, 10);
}

/** Every label in the team's timezone. */
export function formatters(tz: string, now: Date) {
  const ymd = (d: Date) => isoDay(d, tz);
  const today = ymd(now);
  const utcDay = (date: string) => new Date(`${date.slice(0, 10)}T12:00:00Z`);
  const wdFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short' });
  const shortFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' });
  const timeFmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' });
  const days = (a: string, b: string) => Math.round((utcDay(b).getTime() - utcDay(a).getTime()) / 86400000);
  return {
    /** Whole days from one YYYY-MM-DD to another (negative when `b` is earlier). */
    daysBetween: days,
    wd: (date: string) => wdFmt.format(utcDay(date)),
    short: (iso: string) => shortFmt.format(utcDay(ymd(new Date(iso)))),
    time: (iso: string) => timeFmt.format(new Date(iso)),
    /** "15:30:00" → "3:30 PM" */
    clock: (hms: string) => {
      const [h, m] = hms.split(':').map(Number);
      const hh = h ?? 0;
      return `${hh % 12 || 12}:${String(m ?? 0).padStart(2, '0')} ${hh < 12 ? 'AM' : 'PM'}`;
    },
    day: (iso: string) => {
      const date = ymd(new Date(iso));
      return { date, weekday: wdFmt.format(utcDay(date)), day: Number(date.slice(8, 10)) };
    },
    range: (from: string | null, to: string | null) => {
      if (!from) return 'Dates to be set';
      const a = utcDay(from);
      const fmt = (d: Date, month: boolean) => `${wdFmt.format(d)} ${d.getUTCDate()}${month ? ` ${new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short' }).format(d)}` : ''}`;
      if (!to || to === from) return fmt(a, true);
      const b = utcDay(to);
      return `${fmt(a, a.getUTCMonth() !== b.getUTCMonth())} – ${fmt(b, true)}`;
    },
    due: (date: string, ref: string) => {
      const n = days(ref, date);
      if (n === 0) return 'Today';
      if (n === 1) return 'Tomorrow';
      if (n === -1) return 'Yesterday';
      return `${wdFmt.format(utcDay(date))} ${utcDay(date).getUTCDate()}`;
    },
    ago: (iso: string) => {
      const date = ymd(new Date(iso));
      const n = days(date, today);
      if (n === 0) return `Today ${timeFmt.format(new Date(iso))}`;
      if (n === 1) return 'Yesterday';
      if (n < 7) return wdFmt.format(utcDay(date));
      return shortFmt.format(utcDay(date));
    },
  };
}
