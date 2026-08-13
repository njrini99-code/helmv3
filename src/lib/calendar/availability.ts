/**
 * Availability Calculation Utilities
 *
 * Inspired by Google Calendar's freebusy API, these utilities calculate
 * busy/free time periods for users by combining:
 * - Team events (golf_events)
 * - Player-specific events (where they've RSVP'd)
 * - Academic classes (golf_player_classes - recurring schedule)
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { GolfEvent, GolfPlayerClass } from '@/lib/types/golf';
import { fetchAllRows } from '@/lib/supabase/fetch-all-rows';
import { classIdFromDescription } from '@/lib/calendar/class-events';
import { parseSemesterDates } from '@/lib/golf/semester';
import { wallClockInZone } from '@/lib/golf/timezone';
import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';

// ============================================================================
// TYPES
// ============================================================================

export interface BusyPeriod {
  start: Date;
  end: Date;
  type: 'event' | 'class' | 'blocked';
  title?: string;
  eventId?: string;
  ownerId?: string; // user_id of who owns this time block
  ownerType?: 'coach' | 'player';
}

export interface TimeSlot {
  start: Date;
  end: Date;
}

interface WorkingHours {
  start: number; // hour (0-23)
  end: number;   // hour (0-23)
}

type TeamEventRow = Pick<
  GolfEvent,
  'id' | 'title' | 'start_time' | 'end_time' | 'created_by' | 'description'
>;

type AttendanceEventRow = Pick<
  GolfEvent,
  'id' | 'title' | 'start_time' | 'end_time'
>;

interface AttendanceWithEvent {
  // PostgREST types to-one embeds as an array on untyped clients — normalize
  // with firstEventOrNull at the point of use.
  event: AttendanceEventRow | AttendanceEventRow[] | null;
}

function firstEventOrNull(
  value: AttendanceEventRow | AttendanceEventRow[] | null
): AttendanceEventRow | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

interface CoachBlockedTimeRow {
  id: string;
  title: string | null;
  start_date: string;
  end_date: string | null;
  start_time: string | null;
  end_time: string | null;
}

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Get all busy periods for a user within a time range
 * Combines: golf_events (where they're creator OR attendee with accepted status)
 *           golf_player_classes (their academic schedule)
 */
export interface BusyPeriodsResult {
  periods: BusyPeriod[];
  /**
   * At least one read that feeds these periods FAILED, so the list is
   * incomplete. Callers that present "free"/"no conflicts" as a finding must
   * not do so when this is true — an empty list from a failed read looks
   * exactly like an open calendar.
   */
  partial: boolean;
}

/**
 * Busy periods only. Kept for callers that render the periods themselves and
 * therefore cannot state an absence as a fact; use
 * `getUserBusyPeriodsWithStatus` where "nothing found" is shown to a user.
 */
export async function getUserBusyPeriods(
  userId: string,
  timeMin: Date,
  timeMax: Date,
  supabase: SupabaseClient
): Promise<BusyPeriod[]> {
  const { periods } = await getUserBusyPeriodsWithStatus(userId, timeMin, timeMax, supabase);
  return periods;
}

export async function getUserBusyPeriodsWithStatus(
  userId: string,
  timeMin: Date,
  timeMax: Date,
  supabase: SupabaseClient
): Promise<BusyPeriodsResult> {
  const busyPeriods: BusyPeriod[] = [];
  // Event windows compare REAL UTC timestamps (audit finding #7): the old
  // date-only collapse (`.lte('start_time', 'YYYY-MM-DD')` = midnight UTC)
  // excluded every TIMED event on the window's last day — the most common
  // conflict source, an existing timed practice, never registered as busy.
  const minIso = timeMin.toISOString();
  const maxIso = timeMax.toISOString();
  // golf_coach_blocked_time stores DATE columns — date strings stay correct there.
  const dateMin = timeMin.toISOString().split('T')[0];
  const dateMax = timeMax.toISOString().split('T')[0];

  // Set when the identity reads below fail; folded into `partial` at its
  // declaration so the incomplete answer can never be reported as complete.
  let identityPartial = false;

  // 1. Get player/coach profile in parallel (optimization: query both at once)
  const [playerResult, coachResult] = await Promise.all([
    supabase
      .from('golf_players')
      .select('id, user_id')
      .eq('user_id', userId)
      .maybeSingle(),
    supabase
      .from('golf_coaches')
      .select('id, organization_id, user_id')
      .eq('user_id', userId)
      .maybeSingle(),
  ]);

  const player = playerResult.data;
  const coach = coachResult.data;
  const isCoach = !!coach;

  // These two are the hole the `partial` flag below was built to close, left
  // open at the very first step. Only `.data` was taken, so a failed identity
  // read produced player = null AND coach = null: neither team branch runs,
  // teamIds stays empty, the team-events query is skipped by the
  // `teamIds.length > 0` gate, and the function returns no busy periods at all
  // — while reporting `partial: false`, i.e. "this is the complete answer".
  // The conflict checker then says everyone is free and a coach schedules a
  // practice on top of an existing one.
  //
  // A user who is genuinely neither is unaffected: `.maybeSingle()` reports
  // that as { data: null, error: null }, which stays a trusted answer.
  const identityError = playerResult.error ?? coachResult.error;
  if (identityError) {
    identityPartial = true;
    await logServerError(
      `[availability] identity read failed for user ${userId}; busy periods will be reported as incomplete rather than free: ${describeError(identityError)}`,
      { action: 'calendar.getUserBusyPeriods', featureArea: 'calendar' },
      'warning',
    );
  }

  // Resolve every team this user belongs to. Multi-team coaches and
  // multi-team players both need cross-team conflict surfacing — a coach who
  // runs two squads expects events on team B to count when scheduling on team
  // A, and a dual-roster player can have busy time on either team.
  //
  // `partial` tracks whether any read below FAILED, as opposed to legitimately
  // finding nothing. It matters because this function's only output is a list
  // of busy periods, and a short list is indistinguishable from a free
  // calendar: a failed team read yields `teamIds = []`, the team-events query
  // is then skipped entirely by the `teamIds.length > 0` gate, and the coach
  // is told the whole squad is free. RLS returning an empty set is NOT this
  // case — that comes back with `error === null` and is a real answer.
  let partial = identityPartial;
  let teamIds: string[] = [];
  // IANA zone the players' class wall-clock times are written in. Read here
  // because `expandRecurringClass` builds Date objects from `HH:MM` strings and
  // the runtime zone on Vercel is UTC — see setTimeOnDate. All 10 production
  // teams carry a timezone today; null degrades to the previous behaviour
  // rather than guessing a zone.
  let classTimeZone: string | null = null;
  if (coach?.organization_id) {
    const { data: teams, error: teamsError } = await supabase
      .from('golf_teams')
      .select('id, timezone')
      .eq('organization_id', coach.organization_id);
    if (teamsError) {
      partial = true;
      await logServerError(
        `[availability] team read failed for org ${coach.organization_id}; busy periods will be incomplete: ${describeError(teamsError)}`,
        { action: 'calendar.getUserBusyPeriods', featureArea: 'calendar' },
        'warning',
      );
    }
    teamIds = (teams ?? []).map((t) => t.id);
    classTimeZone = (teams ?? [])
      .map((t) => (t as { timezone?: string | null }).timezone)
      .find((tz): tz is string => Boolean(tz)) ?? null;
  } else if (player) {
    const { data: memberships, error: membershipsError } = await supabase
      .from('golf_team_members')
      .select('team_id')
      .eq('player_id', player.id)
      .eq('status', 'active');
    if (membershipsError) {
      partial = true;
      await logServerError(
        `[availability] membership read failed for player ${player.id}; busy periods will be incomplete: ${describeError(membershipsError)}`,
        { action: 'calendar.getUserBusyPeriods', featureArea: 'calendar' },
        'warning',
      );
    }
    teamIds = (memberships ?? [])
      .map((m) => m.team_id)
      .filter((id): id is string => Boolean(id));

    if (teamIds.length > 0) {
      // Failure here is NOT folded into `partial`: an unknown zone makes class
      // blocks land in the runtime zone (the pre-existing behaviour), it does
      // not drop them. Marking the whole answer incomplete for that would
      // suppress real conflicts the rest of this function found correctly.
      const { data: tzRows } = await supabase
        .from('golf_teams')
        .select('timezone')
        .in('id', teamIds);
      classTimeZone = (tzRows ?? [])
        .map((t) => (t as { timezone?: string | null }).timezone)
        .find((tz): tz is string => Boolean(tz)) ?? null;
    }
  }

  // 2. Fetch all busy periods in parallel (major performance improvement).
  // Overlap semantics: an event is busy inside [timeMin, timeMax] when it
  // starts before the window closes AND either starts inside the window or
  // ends after it opens (covers events that span the window start; null
  // end_time rows are treated as instantaneous). Soft-cancelled events keep
  // their rows but are never busy. Paginated via fetchAllRows — PostgREST
  // hard-caps responses at 1000 rows regardless of .limit().
  const teamEventsPromise: Promise<TeamEventRow[]> = teamIds.length > 0
    ? fetchAllRows<TeamEventRow>((from, to) =>
        supabase
          .from('golf_events')
          .select('id, title, start_time, end_time, created_by, description')
          .in('team_id', teamIds)
          .neq('status', 'cancelled')
          .lte('start_time', maxIso)
          .or(`start_time.gte.${minIso},end_time.gte.${minIso}`)
          .order('id', { ascending: true })
          .range(from, to)
      )
    : Promise.resolve([]);

  // Audit finding #24: this used to fetch the player's LIFETIME accepted-RSVP
  // history unwindowed (1000-cap-prone, multiplied by per-tap fan-outs).
  // !inner makes the embedded-event filters drop non-matching parent rows.
  const attendancesPromise: Promise<AttendanceWithEvent[]> = player
    ? fetchAllRows<AttendanceWithEvent>((from, to) =>
        supabase
          .from('golf_event_attendance')
          .select(`
            event_id,
            event:golf_events!inner(id, title, start_time, end_time)
          `)
          .eq('player_id', player.id)
          .eq('status', 'accepted')
          .neq('event.status', 'cancelled')
          .lte('event.start_time', maxIso)
          .or(`start_time.gte.${minIso},end_time.gte.${minIso}`, { referencedTable: 'event' })
          .order('id', { ascending: true })
          .range(from, to)
      )
    : Promise.resolve([]);

  const classesPromise = player
    ? supabase
        .from('golf_player_classes')
        .select('id, class_name, days, start_time, end_time, semester')
        .eq('player_id', player.id)
    : Promise.resolve({ data: [] as GolfPlayerClass[] });

  const blockedTimesPromise = coach
    ? supabase
        .from('golf_coach_blocked_time')
        .select('id, title, start_date, end_date, start_time, end_time')
        .eq('coach_id', coach.id)
        .gte('end_date', dateMin)
        .lte('start_date', dateMax)
    : Promise.resolve({ data: [] as CoachBlockedTimeRow[] });

  const [teamEvents, attendanceRows, classesResult, blockedTimesResult] = await Promise.all([
    teamEventsPromise,
    attendancesPromise,
    classesPromise,
    blockedTimesPromise,
  ]);

  // A class meeting is a PERSONAL commitment that happens to live on the team
  // calendar: syncClassToCalendar writes one golf_events row per occurrence so
  // classes appear on the calendar's "All" lens, but nothing on the row says
  // whose class it is. Sweeping golf_events by team therefore made one player's
  // schedule everybody's busy time — a coach filtering the calendar to their own
  // avatar saw the entire roster's classes (coach report, 2026-08-05). Split the
  // sweep and keep only the occurrences THIS user owns.
  const classEventsByClassId = new Map<string, TeamEventRow[]>();
  const realTeamEvents: TeamEventRow[] = [];
  for (const event of teamEvents) {
    const classId = classIdFromDescription(event.description);
    if (!classId) {
      realTeamEvents.push(event);
      continue;
    }
    const forClass = classEventsByClassId.get(classId);
    if (forClass) forClass.push(event);
    else classEventsByClassId.set(classId, [event]);
  }

  // Ownership is resolved positively, never by absence: a tag that doesn't
  // resolve to one of THIS player's classes (deleted class, another player's,
  // or a row the caller can't read) stays OUT. Fail-closed is right here — an
  // orphaned occurrence must not block anyone's calendar. A coach has no player
  // row at all, so no class occurrence is ever theirs.
  const ownedClassIds = new Set<string>();
  if (player && classEventsByClassId.size > 0) {
    const { data: ownedClasses, error: ownedClassesError } = await supabase
      .from('golf_player_classes')
      .select('id')
      .eq('player_id', player.id)
      .in('id', Array.from(classEventsByClassId.keys()));
    if (ownedClassesError) {
      // Fail-closed stays fail-closed (an unowned occurrence must not block
      // anyone), but a failed read drops this player's OWN class time, so the
      // result is incomplete rather than simply strict.
      partial = true;
      await logServerError(
        `[availability] owned-class read failed for player ${player.id}; class busy time will be missing: ${describeError(ownedClassesError)}`,
        { action: 'calendar.getUserBusyPeriods', featureArea: 'calendar' },
        'warning',
      );
    }
    for (const row of (ownedClasses ?? []) as { id: string }[]) ownedClassIds.add(row.id);
  }

  // Process team events
  for (const event of realTeamEvents) {
    const startDateTime = new Date(event.start_time);
    const endDateTime = new Date(event.end_time || event.start_time);

    busyPeriods.push({
      start: startDateTime,
      end: endDateTime,
      type: 'event',
      title: event.title,
      eventId: event.id,
      ownerId: event.created_by || undefined,
      ownerType: isCoach ? 'coach' : 'player',
    });
  }

  // Process this player's OWN class occurrences. Typed 'class', not 'event' —
  // the availability overlay labels and colors busy blocks off `type`.
  for (const classId of ownedClassIds) {
    for (const event of classEventsByClassId.get(classId) ?? []) {
      busyPeriods.push({
        start: new Date(event.start_time),
        end: new Date(event.end_time || event.start_time),
        type: 'class',
        title: event.title,
        eventId: event.id,
        ownerId: player!.user_id,
        ownerType: 'player',
      });
    }
  }

  // Process RSVP'd events (dedupe by event_id)
  const existingEventIds = new Set(busyPeriods.map(p => p.eventId).filter(Boolean));
  for (const attendance of attendanceRows) {
    const event = firstEventOrNull(attendance.event);
    if (!event || existingEventIds.has(event.id)) continue;

    const startDateTime = new Date(event.start_time);
    const endDateTime = new Date(event.end_time || event.start_time);

    busyPeriods.push({
      start: startDateTime,
      end: endDateTime,
      type: 'event',
      title: event.title,
      eventId: event.id,
      ownerId: player!.user_id,
      ownerType: 'player',
    });
  }

  // Process academic classes that were never synced onto the calendar. A synced
  // class already contributed its real occurrences above; expanding it again
  // here would double-count it into one merged block with a doubled-up title.
  const classesError = 'error' in classesResult ? classesResult.error : null;
  if (classesError) {
    partial = true;
    await logServerError(
      `[availability] class read failed; unsynced class time will be missing: ${describeError(classesError)}`,
      { action: 'calendar.getUserBusyPeriods', featureArea: 'calendar' },
      'warning',
    );
  }
  if (classesResult.data) {
    for (const cls of classesResult.data as GolfPlayerClass[]) {
      if (classEventsByClassId.has(cls.id)) continue;
      const classInstances = expandRecurringClass(cls, timeMin, timeMax, classTimeZone);
      busyPeriods.push(...classInstances);
    }
  }

  // Process coach blocked time
  const blockedTimesError = 'error' in blockedTimesResult ? blockedTimesResult.error : null;
  if (blockedTimesError) {
    partial = true;
    await logServerError(
      `[availability] blocked-time read failed; the coach's own blocked time will be missing: ${describeError(blockedTimesError)}`,
      { action: 'calendar.getUserBusyPeriods', featureArea: 'calendar' },
      'warning',
    );
  }
  if (blockedTimesResult.data) {
    for (const blocked of blockedTimesResult.data as CoachBlockedTimeRow[]) {
      const startDateTime = parseEventDateTime(blocked.start_date, blocked.start_time);
      const endDateTime = parseEventDateTime(
        blocked.end_date || blocked.start_date,
        blocked.end_time || blocked.start_time
      );

      busyPeriods.push({
        start: startDateTime,
        end: endDateTime,
        type: 'blocked',
        title: blocked.title || 'Blocked',
        ownerId: coach!.user_id,
        ownerType: 'coach',
      });
    }
  }

  // Sort by start time and merge overlapping periods
  return { periods: mergeOverlappingPeriods(busyPeriods), partial };
}

/**
 * Find common free time slots between multiple users
 * Used for "Find a Time" feature when scheduling events
 */
export async function findCommonAvailability(
  userIds: string[],
  dateRange: { start: Date; end: Date },
  duration: number, // in minutes
  workingHours: WorkingHours, // e.g., { start: 7, end: 19 }
  supabase: SupabaseClient
): Promise<TimeSlot[]> {
  if (userIds.length === 0) return [];

  // 1. Get busy periods for all users
  const allBusyPeriods = await Promise.all(
    userIds.map(id => getUserBusyPeriods(id, dateRange.start, dateRange.end, supabase))
  );

  // 2. Merge all busy periods from all users
  const mergedBusy = mergeOverlappingPeriods(allBusyPeriods.flat());

  // 3. Generate all possible time slots within working hours
  const slots = generateTimeSlots(dateRange, duration, workingHours);

  // 4. Filter out slots that overlap with any busy period
  return slots.filter(slot => !overlapsWithAny(slot, mergedBusy));
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Parse event date and time into a Date object
 * Handles cases where time might be null (all-day events)
 */
function parseEventDateTime(date: string, time: string | null): Date {
  if (!time) {
    // All-day event - use start of day
    return new Date(`${date}T00:00:00`);
  }
  return new Date(`${date}T${time}`);
}

/**
 * Meeting-day code → weekday index (0 = Sunday). golf_player_classes.days holds
 * the SHORT codes the class UI writes ('M', 'T', 'W', 'Th', 'F', 'Sa', 'Su') —
 * matching getDayOfWeek in calendar-sync, where 'T' is Tuesday and 'Th' is
 * Thursday. Full names are accepted too because older/imported rows used them.
 * A bare 'S' is ambiguous (Saturday or Sunday) and is deliberately unmapped.
 */
const DAY_CODE_TO_INDEX: Record<string, number> = {
  su: 0, sun: 0, sunday: 0,
  m: 1, mo: 1, mon: 1, monday: 1,
  t: 2, tu: 2, tue: 2, tues: 2, tuesday: 2,
  w: 3, we: 3, wed: 3, wednesday: 3,
  th: 4, thu: 4, thur: 4, thurs: 4, r: 4, thursday: 4,
  f: 5, fr: 5, fri: 5, friday: 5,
  sa: 6, sat: 6, saturday: 6,
};

function weekdayIndex(dayCode: string): number | null {
  return DAY_CODE_TO_INDEX[dayCode.trim().toLowerCase()] ?? null;
}

/**
 * Expand a recurring class schedule into individual busy periods.
 *
 * ONLY used for a class with no synced calendar occurrences — a synced class
 * already contributed its real rows. Clamped to the class's own term where one
 * is readable, so a weekly rule does not mark a player busy every Monday
 * forever including over the summer. Where the term is NOT readable it still
 * expands across the caller's query window — see the note at the clamp below
 * for why refusing was worse than guessing here.
 */
function expandRecurringClass(
  cls: GolfPlayerClass,
  timeMin: Date,
  timeMax: Date,
  /** IANA zone the class's wall-clock times are written in — the team's.
   *  Null falls back to the runtime zone, which is right in a browser and
   *  wrong (UTC) on Vercel; see setTimeOnDate. */
  timeZone: string | null
): BusyPeriod[] {
  const periods: BusyPeriod[] = [];

  if (!cls.days || cls.days.length === 0 || !cls.start_time || !cls.end_time) {
    return periods;
  }

  const daysOfWeek = new Set(
    cls.days.map(weekdayIndex).filter((d): d is number => d !== null)
  );
  if (daysOfWeek.size === 0) return periods;

  // A readable term clamps the walk. An unreadable one does NOT abort it.
  //
  // This used to `return periods` when `parseSemesterDates` came back null, on
  // the reasoning that expanding without a term is a guess. The measurement
  // that reasoning was missing: ALL 43 golf_player_classes rows in production
  // have `semester = NULL`, so the early return fired every single time and
  // class-conflict detection was dead platform-wide — "find a time" happily
  // scheduled a coach on top of every player's lecture, silently.
  //
  // Expanding is not unbounded: `timeMin`/`timeMax` are the caller's own query
  // window (a week, a month), so the worst case is a class that ended last term
  // still reading as busy — a visible, correctable wrong answer. Refusing to
  // expand is an invisible one, and on a scheduling surface a missed conflict
  // is the more expensive of the two. Rows written from now on carry a real
  // semester (both save paths persist it), so this fallback shrinks over time.
  const term = parseSemesterDates(cls.semester);
  const termStart = term ? new Date(`${term.start}T00:00:00`) : timeMin;
  const termEnd = term ? new Date(`${term.end}T23:59:59`) : timeMax;
  const current = new Date(Math.max(timeMin.getTime(), termStart.getTime()));
  const until = new Date(Math.min(timeMax.getTime(), termEnd.getTime()));

  while (current <= until) {
    if (daysOfWeek.has(current.getDay())) {
      const start = setTimeOnDate(current, cls.start_time, timeZone);
      const end = setTimeOnDate(current, cls.end_time, timeZone);
      // The walk starts on a partial first day, so a meeting can fall before
      // the window opens — keep only occurrences that actually overlap it.
      if (end > timeMin && start < timeMax) {
        periods.push({
          start,
          end,
          type: 'class',
          title: cls.class_name,
          ownerId: undefined,
        });
      }
    }

    current.setDate(current.getDate() + 1);
  }

  return periods;
}

/**
 * Set a specific time on a date
 * @param date - Base date
 * @param time - Time string in HH:MM format
 */
function setTimeOnDate(date: Date, time: string, timeZone?: string | null): Date {
  // Delegates to the shared zone helper. `setHours` alone resolves in the
  // RUNTIME's zone, which on Vercel is UTC — a 09:05 class became a busy block
  // at 09:05 UTC (05:05 America/New_York, four hours early), so "find a time"
  // reported the real class hour as free and let a coach book practice over it.
  return wallClockInZone(date, time, timeZone);
}

/**
 * Merge overlapping busy periods
 * Simplifies the schedule by combining adjacent/overlapping blocks
 */
function mergeOverlappingPeriods(periods: BusyPeriod[]): BusyPeriod[] {
  if (periods.length === 0) return [];

  // Sort by start time
  const sorted = [...periods].sort((a, b) => a.start.getTime() - b.start.getTime());

  const merged: BusyPeriod[] = [sorted[0]!];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i]!;
    const last = merged[merged.length - 1]!;

    if (current.start <= last.end) {
      // Overlapping - extend the last period
      last.end = new Date(Math.max(last.end.getTime(), current.end.getTime()));
      // Combine titles if different
      if (current.title && last.title !== current.title) {
        last.title = `${last.title} / ${current.title}`;
      }
    } else {
      // Non-overlapping - add as new period
      merged.push(current);
    }
  }

  return merged;
}

/**
 * Generate all possible time slots within a date range and working hours
 * @param dateRange - Start and end dates
 * @param duration - Slot duration in minutes
 * @param workingHours - Valid hours (e.g., 7 AM to 7 PM)
 */
function generateTimeSlots(
  dateRange: { start: Date; end: Date },
  duration: number,
  workingHours: WorkingHours
): TimeSlot[] {
  const slots: TimeSlot[] = [];

  const currentDate = new Date(dateRange.start);
  currentDate.setHours(0, 0, 0, 0);

  while (currentDate <= dateRange.end) {
    // Generate slots for this day within working hours
    for (let hour = workingHours.start; hour < workingHours.end; hour++) {
      const slotStart = new Date(currentDate);
      slotStart.setHours(hour, 0, 0, 0);

      const slotEnd = new Date(slotStart);
      slotEnd.setMinutes(slotEnd.getMinutes() + duration);

      // Only add if slot end is within working hours
      if (slotEnd.getHours() <= workingHours.end) {
        slots.push({ start: slotStart, end: slotEnd });
      }
    }

    // Move to next day
    currentDate.setDate(currentDate.getDate() + 1);
  }

  return slots;
}

/**
 * Check if a time slot overlaps with any busy period
 */
function overlapsWithAny(slot: TimeSlot, busyPeriods: BusyPeriod[]): boolean {
  return busyPeriods.some(period => periodsOverlap(slot, period));
}

/**
 * Check if two time periods overlap
 */
export function periodsOverlap(
  a: { start: Date; end: Date },
  b: { start: Date; end: Date }
): boolean {
  return a.start < b.end && b.start < a.end;
}

/**
 * Get start of week (Sunday) for a given date
 */
export function getStartOfWeek(date: Date): Date {
  const result = new Date(date);
  const day = result.getDay();
  result.setDate(result.getDate() - day);
  result.setHours(0, 0, 0, 0);
  return result;
}

/**
 * Get end of week (Saturday) for a given date
 */
export function getEndOfWeek(date: Date): Date {
  const result = new Date(date);
  const day = result.getDay();
  result.setDate(result.getDate() + (6 - day));
  result.setHours(23, 59, 59, 999);
  return result;
}

