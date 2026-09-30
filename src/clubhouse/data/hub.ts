import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { chunkIds } from '@/lib/supabase/chunk-ids';
import { CLASS_EVENT_TYPE } from '@/lib/calendar/class-events';
import { getAnnouncementsWithMeta } from '@/app/golf/actions/announcements';
import { getDocuments } from '@/app/golf/actions/documents';
import { getPlayerHubSummaryData } from '@/app/golf/actions/player-hub-data';
import { getPlayerHubAnnouncements } from '@/app/golf/actions/player-notifications';
import { getUnifiedNotifications } from '@/app/golf/actions/unified-notifications';
import { isGolfTaskOverdueInZone } from '@/lib/golf/task-overdue';
import type { GolfAnnouncementMeta } from '@/lib/types/golf';
import { chLogServer } from '../lib/track-server';
import { rsvpOf } from './calendar';
import { homeClock } from './home';
import { fullName } from './season';

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
  documentCount: number;
}

export interface ChHubTrip {
  id: string;
  name: string;
  destination: string | null;
  /** "Mon 3 – Wed 5 Nov" */
  dates: string;
  departDate: string | null;
  /** "Mon 12:00 PM" */
  depart: string | null;
  from: string | null;
  /** "Wed · 5:00 PM" */
  back: string | null;
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
}

export interface ChHubTripEvent {
  id: string;
  title: string;
  /** YYYY-MM-DD, in the team's zone */
  date: string;
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
}

export interface ChHubUpdate {
  id: string;
  title: string;
  body: string | null;
  href: string | null;
  when: string;
  unread: boolean;
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
  tripEvents: { rows: ChHubTripEvent[]; error: boolean };
  announcements: { rows: ChHubAnnouncement[]; error: boolean };
  trips: { rows: ChHubTrip[]; error: boolean };
  tasks: { rows: ChHubTask[]; error: boolean };
  documents: { folders: Array<{ name: string; files: ChHubFile[] }>; error: boolean };
  updates: { rows: ChHubUpdate[]; error: boolean };
}

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

export async function loadTeamHub(input: { role: ChHubRole; teamId: string; userId: string; playerId: string | null }): Promise<ChTeamHub> {
  const supabase = await createClient();
  const now = new Date();
  const { tz } = await homeClock(supabase, input.teamId, now);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const f = formatters(tz, now);

  const [teamRes, rosterRes, docsRes, updatesRes] = await Promise.all([
    supabase.from('golf_teams').select('name, season').eq('id', input.teamId).maybeSingle(),
    supabase.from('golf_team_members').select('player:golf_players(id, first_name, last_name)').eq('team_id', input.teamId).eq('status', 'active'),
    getDocuments(input.teamId).catch((err: unknown) => ({ data: null, error: err instanceof Error ? err.message : 'failed' })),
    getUnifiedNotifications({ limit: 6 }).catch(() => ({ success: false as const, error: 'failed' })),
  ]);
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
    season: teamRes.data?.season ?? null,
    viewerPlayerId: input.role === 'player' ? input.playerId : null,
    playersError: input.role === 'coach' && !!rosterRes.error,
    players: input.role === 'coach' ? roster.map((p) => ({ id: p.id, name: fullName(p) })).sort((a, b) => a.name.localeCompare(b.name)) : [],
    documents: { folders: docsRes.error ? [] : folders(docsRes.data ?? [], f), error: !!docsRes.error },
    updates: {
      rows: updatesRes.success && updatesRes.data
        ? updatesRes.data.items.slice(0, 6).map((n) => ({ id: n.id, title: n.title, body: n.body, href: n.action_url, when: f.ago(n.created_at), unread: !n.read_at }))
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
    const annList = anns ?? (annsFallback?.success ? (annsFallback.data ?? []) : null);
    if (!annList) log('announcements', 'player announcements did not load');
    // A trip is the player's when they're invited to its event.
    const tripEvents = (summary?.trips ?? []).map((t) => (t as { event_id?: string | null }).event_id).filter((id): id is string => !!id);
    // The aggregate lists every team event, with the player's own reply or null when they have no place on its invite
    // list (an attendance row is what invites someone, as in Calendar). Only their own are theirs to answer: a reply to
    // any other would add them to that event's list.
    const replyable = (summary?.events ?? []).filter((e) => e.event_type !== CLASS_EVENT_TYPE && e.rsvp_status != null);
    const [authors, invited, closed] = await Promise.all([
      authorNames(supabase, annList ?? []),
      invitedTo(supabase, tripEvents, playerId),
      closedReplies(supabase, replyable.map((e) => e.event_id), now.getTime()),
    ]);
    return {
      ...base,
      tripEvents: { rows: [], error: false },
      rsvps: {
        // Only events that still take a reply: respondToEvent refuses the rest, so they get no Going / Maybe / Can't.
        rows: replyable
          .filter((e) => !closed.has(e.event_id))
          .map((e) => ({
            eventId: e.event_id,
            title: e.title,
            ...f.day(e.start_time),
            meta: [f.time(e.start_time), e.location].filter(Boolean).join(' · '),
            mandatory: e.is_mandatory,
            mine: (e.rsvp_status ?? 'pending') as ChRsvp,
            counts: null,
          })),
        error: !summary,
      },
      announcements: { rows: (annList ?? []).map((a) => announcement(a, authors, f, 'player')), error: !annList },
      trips: {
        rows: summary
          ? summary.trips.map((t) => {
              const eventId = (t as { event_id?: string | null }).event_id ?? null;
              return trip({ ...(t as unknown as TripRow), event_id: eventId }, f, today, { travelers: null, count: null, mine: eventId ? invited.has(eventId) : null });
            })
          : [],
        error: !summary,
      },
      tasks: {
        rows: (summary?.tasks ?? []).map((t) => ({
          id: t.id,
          title: t.title,
          detail: t.category ?? firstLine(t.description),
          dueDate: t.due_date,
          due: t.due_date ? f.due(t.due_date, today) : null,
          status: t.status as ChHubTask['status'],
          done: null,
        })),
        error: !summary,
      },
    };
  }

  // ── Coach ──
  const weekEnd = addDays(today, 7);
  const [annRes, tripsRes, tasksRes, eventsRes, tripEventsRes] = await Promise.all([
    getAnnouncementsWithMeta(input.teamId, input.userId, true).catch(() => ({ success: false as const, error: 'failed' })),
    supabase.from('golf_travel_itineraries').select(TRIP_COLUMNS).eq('team_id', input.teamId).gte('departure_date', addDays(today, -60)).order('departure_date', { ascending: true }).limit(50),
    supabase.from('golf_tasks').select('id, title, description, due_date, category, status').eq('team_id', input.teamId).is('parent_task_id', null).order('due_date', { ascending: true, nullsFirst: false }).limit(100),
    supabase
      .from('golf_events')
      .select('id, title, event_type, start_time, location')
      .eq('team_id', input.teamId)
      .neq('event_type', CLASS_EVENT_TYPE)
      .is('cancelled_at', null)
      .gte('start_time', now.toISOString())
      .lt('start_time', `${weekEnd}T23:59:59Z`)
      .order('start_time', { ascending: true })
      .limit(50),
    // The trip builder's Event step: the next four months of events a team travels for (not classes or busy time).
    supabase
      .from('golf_events')
      .select('id, title, event_type, start_time, location')
      .eq('team_id', input.teamId)
      .neq('event_type', CLASS_EVENT_TYPE)
      .is('cancelled_at', null)
      .gte('start_time', now.toISOString())
      .lt('start_time', `${addDays(today, 120)}T23:59:59Z`)
      .order('start_time', { ascending: true })
      .limit(40),
  ]);
  if (tripEventsRes.error) log('tripEvents', tripEventsRes.error);
  if (!annRes.success) log('announcements', 'error' in annRes ? annRes.error : 'failed');
  if (tripsRes.error) log('trips', tripsRes.error);
  if (tasksRes.error) log('tasks', tasksRes.error);
  if (eventsRes.error) log('events', eventsRes.error);

  const trips = (tripsRes.data ?? []) as unknown as TripRow[];
  const tasks = tasksRes.data ?? [];
  const events = eventsRes.data ?? [];
  const tripEvents = tripEventsRes.data ?? [];
  // One attendance read for this week's events, the trips' events and the builder's events; one for task completion.
  const [attendance, assignments, authors] = await Promise.all([
    attendanceFor(supabase, [...events.map((e) => e.id), ...trips.map((t) => t.event_id).filter((id): id is string => !!id), ...tripEvents.map((e) => e.id)]),
    assignmentsFor(supabase, tasks.map((t) => t.id)),
    authorNames(supabase, annRes.success ? (annRes.data ?? []) : []),
  ]);

  return {
    ...base,
    rsvps: {
      rows: events.map((e) => {
        const rows = attendance.byEvent.get(e.id) ?? [];
        const count = (s: ChRsvp) => rows.filter((r) => r.status === s).length;
        return {
          eventId: e.id,
          title: e.title,
          ...f.day(e.start_time),
          meta: [f.time(e.start_time), e.location].filter(Boolean).join(' · '),
          // golf_events has no mandatory column (get_player_hub_events returns FALSE too); Q-71.
          mandatory: false,
          mine: null,
          counts: attendance.error ? null : { going: count('accepted'), maybe: count('tentative'), no: count('declined'), none: count('pending') },
        };
      }),
      error: !!eventsRes.error,
    },
    announcements: { rows: annRes.success ? (annRes.data ?? []).map((a) => announcement(a, authors, f, 'coach')) : [], error: !annRes.success },
    tripEvents: {
      rows: tripEvents.map((e) => ({
        id: e.id,
        title: e.title,
        date: f.day(e.start_time).date,
        label: `${f.day(e.start_time).weekday} ${f.short(e.start_time)}`,
        location: e.location,
        invited: attendance.error ? null : (attendance.byEvent.get(e.id) ?? []).map((r) => r.player),
      })),
      error: !!tripEventsRes.error,
    },
    trips: {
      rows: trips.map((t) => {
        const ids = t.event_id && !attendance.error ? (attendance.byEvent.get(t.event_id) ?? []).map((r) => r.player).filter((id) => names.has(id)) : null;
        const who = ids ? ids.map((id) => names.get(id)!) : null;
        return trip(t, f, today, { travelers: who, ids, count: who ? who.length : null, mine: null });
      }),
      error: !!tripsRes.error,
    },
    tasks: {
      rows: tasks.map((t) => {
        const a = assignments.byTask.get(t.id);
        return {
          id: t.id,
          title: t.title,
          detail: t.category ?? firstLine(t.description),
          dueDate: t.due_date,
          due: t.due_date ? f.due(t.due_date, today) : null,
          status: a && a.total > 0 && a.done === a.total ? 'completed' : t.due_date && isGolfTaskOverdueInZone(t.due_date, tz) ? 'overdue' : 'pending',
          done: assignments.error || !a ? null : [a.done, a.total],
        };
      }),
      error: !!tasksRes.error,
    },
  };
}

async function attendanceFor(supabase: Awaited<ReturnType<typeof createClient>>, eventIds: string[]) {
  const byEvent = new Map<string, Array<{ player: string; status: ChRsvp }>>();
  for (const ids of chunkIds([...new Set(eventIds)])) {
    const { data, error } = await supabase.from('golf_event_attendance').select('event_id, player_id, status').in('event_id', ids).limit(2000);
    if (error) {
      log('attendance', error);
      return { byEvent, error: true };
    }
    for (const a of data ?? []) byEvent.set(a.event_id, [...(byEvent.get(a.event_id) ?? []), { player: a.player_id, status: rsvpOf(a.status) as ChRsvp }]);
  }
  return { byEvent, error: false };
}

async function invitedTo(supabase: Awaited<ReturnType<typeof createClient>>, eventIds: string[], playerId: string): Promise<Set<string>> {
  if (!eventIds.length) return new Set();
  const { data, error } = await supabase.from('golf_event_attendance').select('event_id').in('event_id', eventIds).eq('player_id', playerId);
  if (error) log('tripInvites', error);
  return new Set((data ?? []).map((r) => r.event_id));
}

/**
 * The rules respondToEvent enforces (updateRSVP in lib/calendar/rsvp.ts): a cancelled event takes no reply, nor one that
 * has started (an all-day event a day after its stored start), nor one past its RSVP deadline.
 */
export function replyIsClosed(e: { status: string | null; cancelled_at: string | null; all_day: boolean | null; start_time: string | null; rsvp_deadline: string | null }, nowMs: number): boolean {
  if (e.status === 'cancelled' || e.cancelled_at) return true;
  const start = e.start_time ? new Date(e.start_time).getTime() : NaN;
  if (Number.isFinite(start) && (e.all_day ? start + 86400000 : start) <= nowMs) return true;
  return !!e.rsvp_deadline && new Date(e.rsvp_deadline).getTime() < nowMs;
}

/** Which of these events no longer take a reply. A read that fails closes nothing: the row stays and the server still decides. */
async function closedReplies(supabase: Awaited<ReturnType<typeof createClient>>, eventIds: string[], nowMs: number): Promise<Set<string>> {
  const closed = new Set<string>();
  for (const ids of chunkIds([...new Set(eventIds)])) {
    const { data, error } = await supabase.from('golf_events').select('id, status, cancelled_at, all_day, start_time, rsvp_deadline').in('id', ids);
    if (error) {
      log('eventReplyRules', error);
      continue;
    }
    for (const e of data ?? []) if (replyIsClosed(e, nowMs)) closed.add(e.id);
  }
  return closed;
}

async function assignmentsFor(supabase: Awaited<ReturnType<typeof createClient>>, taskIds: string[]) {
  const byTask = new Map<string, { done: number; total: number }>();
  for (const ids of chunkIds(taskIds)) {
    const { data, error } = await supabase.from('golf_task_assignments').select('task_id, status').in('task_id', ids).limit(5000);
    if (error) {
      log('assignments', error);
      return { byTask, error: true };
    }
    for (const a of data ?? []) {
      const cur = byTask.get(a.task_id) ?? { done: 0, total: 0 };
      byTask.set(a.task_id, { done: cur.done + (a.status === 'completed' ? 1 : 0), total: cur.total + 1 });
    }
  }
  return { byTask, error: false };
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

function trip(t: TripRow, f: ReturnType<typeof formatters>, today: string, who: { travelers: string[] | null; ids?: string[] | null; count: number | null; mine: boolean | null }): ChHubTrip {
  const gear = Array.isArray(t.gear_list) ? t.gear_list.join(', ') : t.gear_list;
  return {
    id: t.id,
    name: t.event_name || t.destination || 'Team trip',
    destination: t.destination,
    dates: f.range(t.departure_date, t.return_date),
    departDate: t.departure_date,
    depart: t.departure_date ? [f.wd(t.departure_date), t.departure_time ? f.clock(t.departure_time) : null].filter(Boolean).join(' ') : null,
    from: t.departure_location,
    back: t.return_date ? [f.wd(t.return_date), t.return_time ? f.clock(t.return_time) : null].filter(Boolean).join(' · ') : null,
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
  };
}

const TYPE_OF: Record<string, string> = { pdf: 'PDF', doc: 'DOC', docx: 'DOC', xls: 'XLS', xlsx: 'XLS', csv: 'XLS', png: 'IMG', jpg: 'IMG', jpeg: 'IMG', gif: 'IMG', webp: 'IMG', heic: 'IMG', txt: 'TXT', md: 'TXT' };

/** Folders in first-seen order ("Team" for none), files newest first. */
export function folders(docs: Array<{ id: string; title: string; folder: string | null; file_type: string | null; file_url: string; file_size: number | null; updated_at: string | null; created_at: string | null }>, f: ReturnType<typeof formatters>) {
  const out = new Map<string, ChHubFile[]>();
  const sorted = [...docs].sort((a, b) => (b.updated_at ?? b.created_at ?? '').localeCompare(a.updated_at ?? a.created_at ?? ''));
  for (const d of sorted) {
    const name = d.folder?.trim() || 'Team';
    const ext = (d.file_type ?? d.file_url.split('?')[0]!.split('.').pop() ?? '').toLowerCase().replace(/^.*\//, '');
    out.set(name, [
      ...(out.get(name) ?? []),
      { id: d.id, title: d.title, type: TYPE_OF[ext] ?? (ext.slice(0, 4).toUpperCase() || 'FILE'), size: d.file_size ? bytes(d.file_size) : null, date: d.updated_at || d.created_at ? f.short(d.updated_at ?? d.created_at!) : null },
    ]);
  }
  return [...out.entries()].map(([name, files]) => ({ name, files }));
}

export function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function firstLine(s: string | null): string | null {
  const line = s?.split('\n')[0]?.trim();
  return line ? (line.length > 60 ? `${line.slice(0, 57)}…` : line) : null;
}

function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + n)).toISOString().slice(0, 10);
}

/** Every label in the team's timezone. */
export function formatters(tz: string, now: Date) {
  const ymd = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  const today = ymd(now);
  const utcDay = (date: string) => new Date(`${date.slice(0, 10)}T12:00:00Z`);
  const wdFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short' });
  const shortFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' });
  const timeFmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' });
  const days = (a: string, b: string) => Math.round((utcDay(b).getTime() - utcDay(a).getTime()) / 86400000);
  return {
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
