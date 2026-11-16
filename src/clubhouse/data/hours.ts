import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/types/database';
import { chLogServer } from '../lib/track-server';
import { loadCalendar } from './calendar';
import { loadAttendanceCounts } from './attendance-counts';
import { addDays, type ChCalPerson } from '../screens/calendar/model';
import { hoursWeek, type ChHoursAdjustment, type ChHoursEventIn, type ChHoursMark } from '../screens/calendar/hours/model';
import { DEFAULT_HOURS_SETTINGS, divisionFromText, type ChHoursDivision, type ChHoursSettings } from '../screens/calendar/hours/rules';
import {
  adjustmentFromRow,
  hoursTables,
  isHoursStoreMissing,
  settingsFromRow,
  type HoursAdjustmentRow,
  type HoursSettingsRow,
} from '@/lib/golf/practice-hours';

/**
 * Launch readiness F-03: the Calendar's Practice hours page. The week is drafted from what the calendar loads
 * (`loadCalendar`, so the log and the calendar can never disagree about an event), the attendance marks on those events,
 * and, once the held migration 20261115232000 is applied, the team's limits and the coach's adjustments. Without it the
 * week is drafted on the defaults: the division on Settings, Team, else Division I, in season.
 *
 * A player gets their own row only: the calendar already leaves out a meeting they are not on and every teammate's reply,
 * and the marks read returns their own rows.
 */

export interface ChHoursData {
  role: 'coach' | 'player';
  teamId: string;
  teamName: string | null;
  timezone: string;
  today: string;
  /** The team's week shown, seven dates from the day it starts. */
  days: string[];
  settings: ChHoursSettings;
  /** The hours an untimed practice or meeting counts; null counts none. */
  untimedHours: number | null;
  /** Where the limits came from: the team's saved settings, the division on Settings, Team, or the default (Division I). */
  settingsFrom: 'saved' | 'division' | 'default';
  /** The hours tables aren't there yet (held migration): limits and changes can't be saved, and the page says so. */
  storeMissing: boolean;
  /**
   * The team's saved limits didn't load (not a missing table): the week is read against the defaults, and limits can't be
   * saved, so a save never overwrites the stored seasons and custom limits with the defaults (CH-6285).
   */
  settingsError: boolean;
  events: ChHoursEventIn[];
  people: ChCalPerson[];
  marks: Record<string, Record<string, ChHoursMark>>;
  adjustments: Record<string, ChHoursAdjustment>;
  eventsError: boolean;
  membersError: boolean;
  /** Attendance marks or adjustments didn't load: the week is drafted from invitations alone, and the page says so. */
  partial: boolean;
}

/** The attendance mark as attendance.ts records it (`attendance_status`, else the legacy check-in columns). */
function markOf(row: { attendance_status: string | null; checked_in: boolean | null; checked_in_at: string | null }): ChHoursMark | null {
  if (row.attendance_status === 'present' || row.attendance_status === 'late' || row.attendance_status === 'no_show') return row.attendance_status;
  if (row.checked_in === true) return 'present';
  if (row.checked_in_at !== null) return 'no_show';
  return null;
}

async function readDivision(sb: SupabaseClient<Database>, teamId: string): Promise<ChHoursDivision | null> {
  const team = await sb.from('golf_teams').select('organization_id').eq('id', teamId).maybeSingle();
  const orgId = team.data?.organization_id;
  if (team.error || !orgId) return null;
  const org = await sb.from('organizations').select('division').eq('id', orgId).maybeSingle();
  if (org.error || !org.data) return null;
  return divisionFromText((org.data as { division: string | null }).division);
}

export async function loadHours(input: {
  role: 'coach' | 'player';
  teamId: string;
  viewerPlayerId: string | null;
  coachId?: string | null;
  date?: string;
}): Promise<ChHoursData> {
  const sb = await createClient();
  const db = hoursTables(sb);

  const [cal, settingsRes, division] = await Promise.all([
    loadCalendar({
      role: input.role,
      teamId: input.teamId,
      viewerPlayerId: input.viewerPlayerId,
      coachId: input.coachId ?? null,
      view: 'week',
      date: input.date,
    }),
    db.from('golf_team_hours_settings').select('*').eq('team_id', input.teamId).maybeSingle(),
    readDivision(sb, input.teamId).catch(() => null),
  ]);

  let storeMissing = false;
  let settingsError = false;
  let settings: ChHoursSettings = { ...DEFAULT_HOURS_SETTINGS, ...(division ? { division } : {}) };
  let untimedHours: number | null = null;
  let settingsFrom: ChHoursData['settingsFrom'] = division ? 'division' : 'default';
  if (settingsRes.error) {
    if (isHoursStoreMissing(settingsRes.error.code)) storeMissing = true;
    else {
      settingsError = true;
      chLogServer('hours', 'settings', settingsRes.error, 'calendar');
    }
  } else if (settingsRes.data) {
    ({ settings, untimedHours } = settingsFromRow(settingsRes.data as HoursSettingsRow));
    settingsFrom = 'saved';
  }

  const days = hoursWeek(cal.anchor, settings.weekStartsOn);
  // The day after the week too: a practice round there the day before a tournament that starts on it counts its figure.
  const window = new Set([...days, addDays(days[6]!, 1)]);
  const shown = cal.events.filter((e) => window.has(e.date) && e.type !== 'class' && e.type !== 'busy');
  const ids = [...new Set(shown.map((e) => e.id))];

  const [marksRes, counts, adjRes] = await Promise.all([
    ids.length
      ? sb.from('golf_event_attendance').select('event_id, player_id, attendance_status, checked_in, checked_in_at').in('event_id', ids.slice(0, 200))
      : Promise.resolve({
          data: [] as Array<{
            event_id: string;
            player_id: string;
            attendance_status: string | null;
            checked_in: boolean | null;
            checked_in_at: string | null;
          }>,
          error: null,
        }),
    ids.length ? loadAttendanceCounts(sb, ids) : Promise.resolve(null),
    ids.length && !storeMissing
      ? db.from('golf_hours_adjustments').select('event_id, counted, hours, note').eq('team_id', input.teamId).in('event_id', ids.slice(0, 200))
      : Promise.resolve({ data: [] as HoursAdjustmentRow[], error: null }),
  ]);

  let partial = false;
  const marks: Record<string, Record<string, ChHoursMark>> = {};
  if (marksRes.error) {
    chLogServer('hours', 'marks', marksRes.error, 'calendar');
    partial = true;
  } else {
    for (const r of marksRes.data ?? []) {
      const m = markOf(r);
      if (!m) continue;
      if (input.role === 'player' && r.player_id !== input.viewerPlayerId) continue;
      (marks[r.event_id] ??= {})[r.player_id] = m;
    }
  }
  if (counts?.kind === 'error') chLogServer('hours', 'counts', counts.error, 'calendar');

  const adjustments: Record<string, ChHoursAdjustment> = {};
  if (adjRes.error) {
    if (isHoursStoreMissing(adjRes.error.code)) storeMissing = true;
    else {
      chLogServer('hours', 'adjustments', adjRes.error, 'calendar');
      partial = true;
    }
  } else {
    for (const r of (adjRes.data ?? []) as HoursAdjustmentRow[]) adjustments[r.event_id] = adjustmentFromRow(r);
  }

  // Did the coach invite players by name? The count function says so for anyone (a player's read holds only their own
  // row); without it, a coach's list is the attendance rows the calendar read, and a player's is whether they are on it.
  const invitedList = (e: (typeof shown)[number]): boolean => {
    if (counts?.kind === 'ok') return (counts.byEvent.get(e.id)?.coachInvited ?? 0) > 0;
    return e.people.length > 0;
  };
  const events: ChHoursEventIn[] = shown.map((e) => ({
    id: e.id,
    type: e.type,
    title: e.title,
    date: e.date,
    start: e.start,
    end: e.end,
    allDay: e.allDay,
    location: e.location,
    people: e.people,
    rsvp: e.rsvp,
    cancelled: e.cancelled,
    span: e.span,
    invitedList: invitedList(e),
  }));

  return {
    role: input.role,
    teamId: input.teamId,
    teamName: cal.teamName,
    timezone: cal.timezone,
    today: cal.today,
    days,
    settings,
    untimedHours,
    settingsFrom,
    storeMissing,
    settingsError,
    events,
    people: cal.people,
    marks,
    adjustments,
    eventsError: cal.eventsError,
    membersError: !!cal.membersError,
    partial,
  };
}
