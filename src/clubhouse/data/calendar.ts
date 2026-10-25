import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import { getValidTimezone } from '@/lib/calendar/timezone';
import { classIdFromDescription, isClassEvent, stripClassTag } from '@/lib/calendar/class-events';
import { describeRecurrenceRule, parseRecurrenceRule } from '@/lib/golf/recurrence';
import { chLogServer } from '../lib/track-server';
import type { MarkEntries } from '../lib/marks-cookie';
import { whenPhrase } from '@/lib/calendar/change-mark';
import { buildChangeMarks, type ChMovedAway } from '../screens/calendar/change-view';
import { classYearLabel, fullName } from './season';
import { parseAvailability } from './availability';
import { loadAttendanceCounts } from './attendance-counts';
import { loadRoundRefs } from './calendar-rounds';
import { isFlagEnabled } from '@/lib/flags/is-enabled';
import {
  addDays,
  expandBusyDates,
  hhmmToHour,
  monthCells,
  playerSeesMeeting,
  type ChCalEvent,
  type ChCalPerson,
  type ChCalType,
  type ChCalView,
  type ChRsvp,
} from '../screens/calendar/model';

export interface ChCalendarData {
  role: 'coach' | 'player';
  teamId: string;
  viewerPlayerId: string | null;
  teamName: string | null;
  timezone: string;
  /** Short zone name for copy, for example "Eastern time". */
  zoneLabel: string;
  today: string;
  nowHour: number;
  view: ChCalView;
  anchor: string;
  range: { from: string; to: string };
  events: ChCalEvent[];
  people: ChCalPerson[];
  eventsError: boolean;
  /** A coach's team has never scheduled anything (CH-6309); false for a player or when the count didn't load. */
  firstRun: boolean;
  rsvpError: boolean;
  classesError: boolean;
  settingsError: boolean;
  /** The roster didn't load: `people` is unknown, not an empty team (C-21). */
  membersError?: boolean;
  /** Coach only: their own blocked time failed to load (shown as a notice, never as "free"). */
  busyError: boolean;
  /** P-5: golf_tournaments_v1 is on, so the editor offers the tournament section and rounds carry refs. */
  tournamentsEnabled?: boolean;
  /** P-5: the round refs failed to load: tournament events show their stored titles and can't be moved */
  roundRefsFailed?: boolean;
  /** Which change marks this device has seen (`s`) or cleared (`g`), from the `ch_marks` cookie, newest first (P-14). */
  marks?: MarkEntries;
  /** Events that left a day of the window for another (live marks only): a quiet row on the old day, linking to the new one. */
  movedAway?: ChMovedAway[];
}

type ClassRow = { id: string; player_id: string; instructor: string | null; days: string[] | null; semester: string | null; building: string | null; room: string | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const TYPES: ReadonlySet<string> = new Set(['practice', 'qualifier', 'tournament', 'meeting', 'travel', 'class', 'other']);

export function parseView(v: string | undefined): ChCalView {
  return v === 'day' || v === 'month' || v === 'agenda' ? v : 'week';
}
/** A new event's type from the URL: one a coach can create, else none (the editor's default). */
export function parseNewType(v: string | undefined): ChCalType | undefined {
  return v === 'practice' || v === 'qualifier' || v === 'tournament' || v === 'meeting' || v === 'travel' || v === 'other' ? v : undefined;
}
/** A real calendar date from the URL, else `fallback`. 2026-02-30 is not one (Date.parse alone would roll it to 2 March). */
export function parseDate(v: string | undefined, fallback: string): string {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return fallback;
  const t = Date.parse(`${v}T12:00:00Z`);
  return Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== v ? fallback : v;
}

/** Map the RSVP column (which still carries legacy values) onto four replies. */
export function rsvpOf(status: string | null | undefined): ChRsvp {
  switch (status) {
    case 'accepted':
    case 'attending':
      return 'accepted';
    case 'tentative':
    case 'maybe':
      return 'maybe';
    case 'declined':
    case 'not_attending':
    case 'excused':
    case 'unexcused':
      return 'declined';
    default:
      return 'pending';
  }
}

/** Wall-clock date and decimal hour of an instant in a zone. */
export function zoned(iso: string, timeZone: string): { date: string; hour: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(new Date(iso));
  const p: Record<string, string> = {};
  for (const x of parts) p[x.type] = x.value;
  return { date: `${p.year}-${p.month}-${p.day}`, hour: (Number(p.hour) % 24) + Number(p.minute) / 60 };
}

function zoneLabel(timeZone: string): string {
  const name = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'long' }).formatToParts(new Date()).find((p) => p.type === 'timeZoneName')?.value ?? timeZone;
  // "Eastern Daylight Time" -> "Eastern time"; the season changes, the zone doesn't.
  const m = name.match(/^(.*?)\s+(Standard|Daylight|Summer)\s+Time$/);
  return m ? `${m[1]} time` : name;
}

/** The loaded window: the anchor's month grid, padded so week, day and agenda views near the edges are complete. */
export function windowFor(anchor: string): { from: string; to: string } {
  const cells = monthCells(anchor);
  const first = cells[0]!.date;
  const last = cells[cells.length - 1]!.date;
  const from = addDays(anchor, -14) < first ? addDays(anchor, -14) : first;
  const to = addDays(anchor, 42) > last ? addDays(anchor, 42) : last;
  return { from, to };
}

const DAY_NAMES: Record<string, string> = { M: 'Mon', T: 'Tue', W: 'Wed', R: 'Thu', F: 'Fri', S: 'Sat', U: 'Sun' };
function classPattern(days: string[] | null): string | null {
  if (!days?.length) return null;
  return days.map((d) => DAY_NAMES[d] ?? d.slice(0, 3)).join(', ');
}

export async function loadCalendar(input: {
  role: 'coach' | 'player';
  teamId: string;
  viewerPlayerId: string | null;
  /** The coach's own id, for their blocked time and for "By you" on a change mark. */
  coachId?: string | null;
  /** The device's seen and cleared change marks (phone-hint.ts `marksHint`). */
  marks?: MarkEntries;
  view: ChCalView;
  date?: string;
  /**
   * `?event=<id>` without a date (every notification, reminder and the shell's next-event card link that way): the
   * calendar opens on that event's own day, so an event weeks out is in the loaded window and opens (CAL-03).
   */
  event?: string;
}): Promise<ChCalendarData> {
  const supabase = await createClient();

  const [settingsRes, teamRes, membersRes] = await Promise.all([
    supabase.from('golf_team_settings').select('timezone').eq('team_id', input.teamId).maybeSingle(),
    supabase.from('golf_teams').select('name').eq('id', input.teamId).maybeSingle(),
    supabase
      .from('golf_team_members')
      // A coach also sees who is injured or away beside a name; a player's page never carries it (availability, v1).
      .select(input.role === 'coach' ? 'availability, player:golf_players(id, first_name, last_name, graduation_year)' : 'player:golf_players(id, first_name, last_name, graduation_year)')
      .eq('team_id', input.teamId)
      .eq('status', 'active')
      .limit(200),
  ]);
  if (settingsRes.error) chLogServer('calendar', 'teamSettings', settingsRes.error, 'calendar');
  if (teamRes.error) chLogServer('calendar', 'team', teamRes.error, 'teams');
  if (membersRes.error) chLogServer('calendar', 'members', membersRes.error, 'teams');

  const timezone = getValidTimezone(settingsRes.data?.timezone ?? null);
  const nowZ = zoned(new Date().toISOString(), timezone);
  const today = nowZ.date;
  let eventDate: string | undefined;
  if (!input.date && input.event && UUID.test(input.event)) {
    // Only its day is read, from the same team-scoped table the window reads, so it shows nothing the window wouldn't.
    const { data: target, error } = await supabase.from('golf_events').select('start_time, all_day').eq('id', input.event).eq('team_id', input.teamId).maybeSingle();
    if (error) chLogServer('calendar', 'deepLinkEvent', error, 'calendar');
    if (target?.start_time) eventDate = target.all_day ? target.start_time.slice(0, 10) : zoned(target.start_time, timezone).date;
  }
  const anchor = parseDate(input.date ?? eventDate, today);
  const range = windowFor(anchor);

  type PlayerRow = { id: string; first_name: string | null; last_name: string | null; graduation_year: number | null };
  const people: ChCalPerson[] = (membersRes.data ?? [])
    .map((m) => m as unknown as { availability?: string | null; player: PlayerRow | null })
    .filter((m): m is { availability?: string | null; player: PlayerRow } => !!m.player)
    .map((m) => ({
      id: m.player.id,
      name: fullName(m.player),
      year: classYearLabel(m.player.graduation_year, undefined, timezone),
      ...(input.role === 'coach' ? { availability: parseAvailability(m.availability) } : {}),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Pad the instant bounds by a day on each side; rows are bucketed by their zoned date below.
  const fromIso = `${addDays(range.from, -1)}T00:00:00Z`;
  const toIso = `${addDays(range.to, 2)}T00:00:00Z`;
  // Every event that OVERLAPS the window: it starts before the window ends, and ends on or after its start (or, with no
  // end, starts inside it). A tournament that began the day before the window still holds the window's first days; a
  // read by start alone left it out (as Fairway's still does, page.tsx).
  const overlapsWindow = `end_time.gte.${fromIso},start_time.gte.${fromIso}`;

  // RSVPs are read beside the events (audit A-03: they waited for the event ids, a third round trip on every load), by
  // the same team and window through the event they belong to; the rows of events that aren't shown are dropped below.
  const attendanceRead = fetchAllRowsResult((from, to) =>
    supabase
      .from('golf_event_attendance')
      .select('id, event_id, player_id, status, notified_at, golf_events!inner(id)')
      .eq('golf_events.team_id', input.teamId)
      .lt('golf_events.start_time', toIso)
      .or(overlapsWindow, { referencedTable: 'golf_events' })
      .order('id', { ascending: true })
      .range(from, to),
  );
  const [eventsRes, classesRes, busyRes, everRes] = await Promise.all([
    fetchAllRowsResult((from, to) =>
      supabase
        .from('golf_events')
        .select('id, title, event_type, start_time, end_time, location, course_id, description, status, all_day, recurrence_rule, parent_event_id, requires_rsvp, rsvp_deadline, updated_at, cancellation_reason, cancelled_at, change:metadata->change')
        .eq('team_id', input.teamId)
        .lt('start_time', toIso)
        .or(overlapsWindow)
        .order('start_time', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to),
    ),
    // RLS scopes this: a coach reads every rostered player's classes, a player only their own.
    supabase.from('golf_player_classes').select('id, player_id, instructor, days, semester, building, room').eq('team_id', input.teamId).limit(1000),
    // The coach's own blocked time is read with the events, not after them. Only a coach's, and only their own
    // (`coach_id`): a player never reads any (60802).
    input.role === 'coach' && input.coachId
      ? supabase
          .from('golf_coach_blocked_time')
          .select('id, title, reason, description, start_date, end_date, start_time, end_time, all_day, recurrence_rule')
          .eq('coach_id', input.coachId)
          .lte('start_date', range.to)
          .limit(500)
      : null,
    // CH-6309: has this team ever scheduled anything? A count, no rows; a coach's question only.
    input.role === 'coach' ? supabase.from('golf_events').select('id', { count: 'exact', head: true }).eq('team_id', input.teamId) : null,
  ]);
  if (everRes?.error) chLogServer('calendar', 'eventCount', everRes.error, 'calendar');
  const firstRun = !!everRes && !everRes.error && everRes.count === 0;
  if (eventsRes.error) chLogServer('calendar', 'events', eventsRes.error, 'calendar');
  if (classesRes.error) chLogServer('calendar', 'classes', classesRes.error, 'calendar');

  const classById = new Map<string, ClassRow>((classesRes.data ?? []).map((c) => [c.id, c]));
  const rows = eventsRes.data ?? [];
  const ids = rows.filter((r) => !isClassEvent(r)).map((r) => r.id);

  const rsvp = new Map<string, Record<string, ChRsvp>>();
  const invited = new Map<string, string[]>();
  /** Rows the coach's invitation wrote (`notified_at`, sendEventInvitations); a player's own reply to an open event has none. */
  const coachInvited = new Map<string, number>();
  let rsvpError = false;
  const shown = new Set(ids);
  // A player's attendance read returns only their own rows once migration 20261017102000 is applied, so the counts are
  // read beside the rows: they tell a player that an event asking for replies invites no one, so the whole team may reply
  // (production allows it: golf_event_attendance_insert_self), and, only when the rows failed, whether a meeting invites
  // anyone at all (D2-8, below). Until that function exists (`missing`) the rows answer both, as before.
  const meetingIds = input.role === 'player' ? rows.filter((r) => !isClassEvent(r) && (r.event_type === 'meeting' || r.requires_rsvp === true)).map((r) => r.id) : [];
  // Paged (fetchAllRowsResult): 200 events x a full roster passes PostgREST's 1,000-row cap.
  const [{ data: attendance, error: attendanceError }, meetingCounts] = await Promise.all([
    attendanceRead,
    meetingIds.length ? loadAttendanceCounts(supabase, meetingIds) : null,
  ]);
  if (meetingCounts?.kind === 'error') chLogServer('calendar', 'meetingInvites', meetingCounts.error, 'calendar');
  if (attendanceError) {
    chLogServer('calendar', 'attendance', attendanceError, 'calendar');
    rsvpError = true;
  } else {
    for (const a of attendance ?? []) {
      if (!shown.has(a.event_id)) continue;
      const r = rsvp.get(a.event_id) ?? {};
      r[a.player_id] = rsvpOf(a.status);
      rsvp.set(a.event_id, r);
      invited.set(a.event_id, [...(invited.get(a.event_id) ?? []), a.player_id]);
      if (a.notified_at) coachInvited.set(a.event_id, (coachInvited.get(a.event_id) ?? 0) + 1);
    }
  }

  /** How many a meeting invites, for D2-8; null when that couldn't be read (never hides a meeting). */
  const invitedCount = (id: string): number | null => {
    if (meetingCounts?.kind === 'ok') return meetingCounts.byEvent.get(id)?.invited ?? 0;
    if (meetingCounts?.kind === 'error' || rsvpError) return null;
    return invited.get(id)?.length ?? 0;
  };
  /**
   * Did the coach invite no one to this event? Then it is the team's, and any player may reply. A player's own reply
   * (no `notified_at`) doesn't make it an invite list: from the rows, and from the count function's `coach_invited`.
   * Never open when it couldn't be read.
   */
  const openToTeam = (id: string): boolean => {
    if (meetingCounts?.kind === 'ok') return (meetingCounts.byEvent.get(id)?.coachInvited ?? 0) === 0;
    if (meetingCounts?.kind === 'error' || rsvpError) return false;
    return (coachInvited.get(id) ?? 0) === 0;
  };

  // P-14: the change marks that are still live, read against each event as it is now. A mark that is there but unreadable is
  // reported once (CH-6023) and shows as a bare "Changed" badge.
  const nowMs = Date.now();
  const { marks: changeMarks, unreadable, movedAway } = buildChangeMarks(
    rows.map((r) => ({ ...r, change: r.change as unknown })),
    { timeZone: timezone, nowMs, coachId: input.role === 'coach' ? (input.coachId ?? null) : null, range },
  );
  if (unreadable.length) chLogServer('calendar', 'changeMark', new Error(`CH-6023: ${unreadable.length} change mark(s) could not be read (first: ${unreadable[0]})`), 'calendar');

  const events: ChCalEvent[] = [];
  for (const r of rows) {
    const cls = isClassEvent(r);
    let owner: string | null = null;
    let klass: ClassRow | undefined;
    if (cls) {
      const classId = classIdFromDescription(r.description);
      klass = classId ? classById.get(classId) : undefined;
      owner = klass?.player_id ?? null;
      // A player sees only their own classes, and an unresolved owner is never shown to a player.
      if (input.role === 'player' && (!owner || owner !== input.viewerPlayerId)) continue;
    }
    const type: ChCalType = cls ? 'class' : TYPES.has(r.event_type) ? (r.event_type as ChCalType) : 'other';
    const cancelled = r.status === 'cancelled';
    let recurring: string | null = null;
    if (r.recurrence_rule) {
      try {
        const rule = parseRecurrenceRule(r.recurrence_rule);
        recurring = rule ? describeRecurrenceRule(rule) : null;
      } catch {
        recurring = null;
      }
    }
    // A player's browser gets only their own place on the invite list and their own reply: the screen never shows a
    // teammate's, so the payload doesn't carry them either (60803). A coach gets the whole list.
    const invitees = invited.get(r.id) ?? [];
    const replies = rsvp.get(r.id) ?? {};
    const me = input.role === 'player' ? input.viewerPlayerId : null;
    // Decision B (owner, wave 7): a player sees a meeting only when they are on its invite list, their own row in the
    // attendance read (which returns it before and after migration 20261017102000), so a 1:1 or a captains' meeting
    // never shows its title or room to the rest of the team. Only when that read failed does D2-8 decide (a meeting
    // nobody is invited to is the coach's own); when the count failed too, no meeting is shown (fail closed).
    if (input.role === 'player' && r.event_type === 'meeting' && !playerSeesMeeting(rsvpError ? null : !!me && invitees.includes(me), invitedCount(r.id))) continue;
    const base = {
      id: r.id,
      type,
      title: r.title,
      location: cls && klass ? [klass.building, klass.room].filter(Boolean).join(' ') || r.location : r.location,
      notes: stripClassTag(r.description),
      recurring,
      people: input.role === 'coach' ? invitees : me && invitees.includes(me) ? [me] : [],
      rsvp: input.role === 'coach' ? replies : me && replies[me] ? { [me]: replies[me] } : {},
      // Owner, 2026-10-08: replies are off unless the coach turned them on; null (older rows) reads as off.
      rsvpRequired: !cls && r.requires_rsvp === true,
      rsvpDeadline: cls ? null : (r.rsvp_deadline ?? null),
      openReply: !cls && r.requires_rsvp === true && input.role === 'player' && openToTeam(r.id),
      owner,
      busyOnly: false,
      instructor: klass?.instructor ?? null,
      pattern: klass ? [classPattern(klass.days), klass.semester].filter(Boolean).join(' · ') || null : null,
      canEdit: input.role === 'coach' && !cls,
      cancelled,
      seriesId: r.parent_event_id ?? (r.recurrence_rule ? r.id : null),
      startIso: r.start_time,
      // P-4: the row's updated_at, an opaque concurrency token a move sends back untouched.
      version: r.updated_at ?? null,
      // P-5 WP-P5: the library course the event is at, when one was chosen.
      courseId: r.course_id ?? null,
      change: cls ? null : (changeMarks.get(r.id) ?? null),
      cancelNote:
        !cls && cancelled && !changeMarks.get(r.id) && r.cancelled_at
          ? { line: `Cancelled ${whenPhrase(r.cancelled_at, new Date(nowMs).toISOString(), timezone)}`, reason: r.cancellation_reason?.trim() || null }
          : null,
    };
    if (r.all_day) {
      // All-day rows are stored as UTC-midnight dates: read the date part, never zone it.
      const s = r.start_time.slice(0, 10);
      const e = (r.end_time ?? r.start_time).slice(0, 10);
      for (let d = s < range.from ? range.from : s, n = 0; d <= e && n < 62; d = addDays(d, 1), n++) {
        if (d > range.to) break;
        events.push({ ...base, date: d, start: null, end: null, allDay: true, span: s === e ? null : { from: s, to: e } });
      }
      continue;
    }
    const a = zoned(r.start_time, timezone);
    const b = r.end_time ? zoned(r.end_time, timezone) : { date: a.date, hour: a.hour + 1 };
    // A timed event that runs past midnight (a tournament from Friday 7 AM to Sunday 4:30 PM, an overnight trip) is on
    // every day it covers, as production's calendar places it (eventDaySpan): its start to midnight, then whole days,
    // then midnight to its end. One that ends at midnight exactly holds nothing of the next day.
    const last = b.date > a.date && b.hour === 0 ? addDays(b.date, -1) : b.date;
    if (last > a.date) {
      const end = b.date === last ? b.hour : 24;
      const span = { from: a.date, to: last, start: a.hour, end };
      for (let d = a.date < range.from ? range.from : a.date, n = 0; d <= last && n < 62; d = addDays(d, 1), n++) {
        if (d > range.to) break;
        events.push({ ...base, date: d, start: d === a.date ? a.hour : 0, end: d === last ? end : 24, allDay: false, span });
      }
      continue;
    }
    const end = b.date === a.date ? Math.max(b.hour, a.hour + 0.25) : 24;
    if (a.date < range.from || a.date > range.to) continue;
    events.push({ ...base, date: a.date, start: a.hour, end, allDay: false, span: null });
  }

  // The coach's own blocked time. Only the coach sees it; it's labelled as theirs.
  let busyError = false;
  if (busyRes) {
    const { data: blocks, error } = busyRes;
    if (error) {
      chLogServer('calendar', 'blockedTime', error, 'calendar');
      busyError = true;
    }
    for (const b of blocks ?? []) {
      let rule: ReturnType<typeof parseRecurrenceRule>;
      try {
        rule = parseRecurrenceRule(b.recurrence_rule);
      } catch {
        rule = null;
      }
      if (!rule && b.end_date < range.from) continue;
      const start = hhmmToHour(b.start_time);
      const end = hhmmToHour(b.end_time);
      const allDay = !!b.all_day || start == null || end == null || end <= start;
      for (const d of expandBusyDates(b, rule, range.from, range.to)) {
        events.push({
          id: b.id,
          type: 'busy',
          title: b.title?.trim() || b.reason?.trim() || 'Busy',
          date: d,
          start: allDay ? null : start,
          end: allDay ? null : end,
          allDay,
          location: null,
          notes: b.description,
          recurring: rule ? describeRecurrenceRule(rule) : null,
          people: [],
          rsvp: {},
          rsvpRequired: false,
          owner: null,
          busyOnly: false,
          instructor: null,
          pattern: null,
          canEdit: true,
          cancelled: false,
          seriesId: null,
          startIso: `${b.start_date}T12:00:00Z`,
          span: null,
        });
      }
    }
  }

  // P-5: round refs for the tournament events, only with golf_tournaments_v1 on (off: no tournament table is read).
  const tournamentsEnabled = isFlagEnabled('golf_tournaments_v1');
  let roundRefsFailed = false;
  if (tournamentsEnabled) {
    const tourIds = [...new Set(events.filter((e) => e.type === 'tournament').map((e) => e.id))];
    if (tourIds.length) {
      const { refs, failed, error } = await loadRoundRefs(supabase, tourIds, input.role);
      if (failed) {
        chLogServer('calendar', 'roundRefs', error, 'calendar');
        roundRefsFailed = true;
      }
      for (let i = 0; i < events.length; i++) {
        const e = events[i]!;
        if (e.type !== 'tournament') continue;
        const ref = refs.get(e.id);
        if (ref) events[i] = { ...e, round: ref };
        else if (failed) events[i] = { ...e, roundRefFailed: true };
      }
    }
  }

  return {
    role: input.role,
    teamId: input.teamId,
    busyError,
    tournamentsEnabled,
    roundRefsFailed,
    viewerPlayerId: input.viewerPlayerId,
    teamName: teamRes.data?.name ?? null,
    timezone,
    zoneLabel: zoneLabel(timezone),
    today,
    nowHour: nowZ.hour,
    view: input.view,
    anchor,
    range,
    events,
    people: input.role === 'coach' ? people : people.filter((p) => p.id === input.viewerPlayerId),
    eventsError: !!eventsRes.error,
    firstRun,
    rsvpError,
    classesError: !!classesRes.error,
    settingsError: !!settingsRes.error,
    membersError: !!membersRes.error,
    marks: input.marks ?? [],
    // Only for rows the viewer is shown (a meeting a player is not on is dropped from `events` above).
    movedAway: movedAway.filter((m) => events.some((e) => e.id === m.id)),
  };
}
