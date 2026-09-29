import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import { chunkIds } from '@/lib/supabase/chunk-ids';
import { getValidTimezone } from '@/lib/calendar/timezone';
import { classIdFromDescription, isClassEvent, stripClassTag } from '@/lib/calendar/class-events';
import { describeRecurrenceRule, parseRecurrenceRule } from '@/lib/golf/recurrence';
import { chLogServer } from '../lib/track-server';
import { classYearLabel, fullName } from './season';
import {
  addDays,
  monthCells,
  type ChCalEvent,
  type ChCalPerson,
  type ChCalType,
  type ChCalView,
  type ChRsvp,
} from '../screens/calendar/model';

export interface ChCalendarData {
  role: 'coach' | 'player';
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
  rsvpError: boolean;
  classesError: boolean;
  settingsError: boolean;
}

type ClassRow = { id: string; player_id: string; instructor: string | null; days: string[] | null; semester: string | null; building: string | null; room: string | null };

const TYPES: ReadonlySet<string> = new Set(['practice', 'qualifier', 'tournament', 'meeting', 'travel', 'class', 'other']);

export function parseView(v: string | undefined): ChCalView {
  return v === 'day' || v === 'month' || v === 'agenda' ? v : 'week';
}
export function parseDate(v: string | undefined, fallback: string): string {
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T12:00:00Z`)) ? v : fallback;
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
  view: ChCalView;
  date?: string;
}): Promise<ChCalendarData> {
  const supabase = await createClient();

  const [settingsRes, teamRes, membersRes] = await Promise.all([
    supabase.from('golf_team_settings').select('timezone').eq('team_id', input.teamId).maybeSingle(),
    supabase.from('golf_teams').select('name').eq('id', input.teamId).maybeSingle(),
    supabase
      .from('golf_team_members')
      .select('player:golf_players(id, first_name, last_name, graduation_year)')
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
  const anchor = parseDate(input.date, today);
  const range = windowFor(anchor);

  type PlayerRow = { id: string; first_name: string | null; last_name: string | null; graduation_year: number | null };
  const people: ChCalPerson[] = (membersRes.data ?? [])
    .map((m) => (m as unknown as { player: PlayerRow | null }).player)
    .filter((p): p is PlayerRow => !!p)
    .map((p) => ({ id: p.id, name: fullName(p), year: classYearLabel(p.graduation_year) }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Pad the instant bounds by a day on each side; rows are bucketed by their zoned date below.
  const fromIso = `${addDays(range.from, -1)}T00:00:00Z`;
  const toIso = `${addDays(range.to, 2)}T00:00:00Z`;

  const [eventsRes, classesRes] = await Promise.all([
    fetchAllRowsResult((from, to) =>
      supabase
        .from('golf_events')
        .select('id, title, event_type, start_time, end_time, location, description, status, all_day, recurrence_rule, parent_event_id')
        .eq('team_id', input.teamId)
        .gte('start_time', fromIso)
        .lt('start_time', toIso)
        .order('start_time', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to),
    ),
    // RLS scopes this: a coach reads every rostered player's classes, a player only their own.
    supabase.from('golf_player_classes').select('id, player_id, instructor, days, semester, building, room').eq('team_id', input.teamId).limit(1000),
  ]);
  if (eventsRes.error) chLogServer('calendar', 'events', eventsRes.error, 'calendar');
  if (classesRes.error) chLogServer('calendar', 'classes', classesRes.error, 'calendar');

  const classById = new Map<string, ClassRow>((classesRes.data ?? []).map((c) => [c.id, c]));
  const rows = eventsRes.data ?? [];
  const ids = rows.filter((r) => !isClassEvent(r)).map((r) => r.id);

  const rsvp = new Map<string, Record<string, ChRsvp>>();
  const invited = new Map<string, string[]>();
  let rsvpError = false;
  for (const chunk of chunkIds(ids)) {
    // 200 events x a full roster passes PostgREST's 1,000-row cap: page every chunk.
    const { data, error } = await fetchAllRowsResult((from, to) =>
      supabase.from('golf_event_attendance').select('id, event_id, player_id, status').in('event_id', chunk).order('id', { ascending: true }).range(from, to),
    );
    if (error) {
      chLogServer('calendar', 'attendance', error, 'calendar');
      rsvpError = true;
      break;
    }
    for (const a of data ?? []) {
      const r = rsvp.get(a.event_id) ?? {};
      r[a.player_id] = rsvpOf(a.status);
      rsvp.set(a.event_id, r);
      invited.set(a.event_id, [...(invited.get(a.event_id) ?? []), a.player_id]);
    }
  }

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
    const base = {
      id: r.id,
      type,
      title: r.title,
      location: cls && klass ? [klass.building, klass.room].filter(Boolean).join(' ') || r.location : r.location,
      notes: stripClassTag(r.description),
      recurring,
      people: invited.get(r.id) ?? [],
      rsvp: rsvp.get(r.id) ?? {},
      owner,
      busyOnly: false,
      instructor: klass?.instructor ?? null,
      pattern: klass ? [classPattern(klass.days), klass.semester].filter(Boolean).join(' · ') || null : null,
      canEdit: input.role === 'coach' && !cls,
      cancelled,
      seriesId: r.parent_event_id ?? (r.recurrence_rule ? r.id : null),
      startIso: r.start_time,
    };
    if (r.all_day) {
      // All-day rows are stored as UTC-midnight dates: read the date part, never zone it.
      const s = r.start_time.slice(0, 10);
      const e = (r.end_time ?? r.start_time).slice(0, 10);
      for (let d = s, n = 0; d <= e && n < 31; d = addDays(d, 1), n++) {
        if (d < range.from || d > range.to) continue;
        events.push({ ...base, date: d, start: null, end: null, allDay: true, span: s === e ? null : { from: s, to: e } });
      }
      continue;
    }
    const a = zoned(r.start_time, timezone);
    const b = r.end_time ? zoned(r.end_time, timezone) : { date: a.date, hour: a.hour + 1 };
    const end = b.date === a.date ? Math.max(b.hour, a.hour + 0.25) : 24;
    if (a.date < range.from || a.date > range.to) continue;
    events.push({ ...base, date: a.date, start: a.hour, end, allDay: false, span: null });
  }

  return {
    role: input.role,
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
    rsvpError,
    classesError: !!classesRes.error,
    settingsError: !!settingsRes.error,
  };
}
