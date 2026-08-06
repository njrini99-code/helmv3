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
export async function getUserBusyPeriods(
  userId: string,
  timeMin: Date,
  timeMax: Date,
  supabase: SupabaseClient
): Promise<BusyPeriod[]> {
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

  // Resolve every team this user belongs to. Multi-team coaches and
  // multi-team players both need cross-team conflict surfacing — a coach who
  // runs two squads expects events on team B to count when scheduling on team
  // A, and a dual-roster player can have busy time on either team.
  let teamIds: string[] = [];
  if (coach?.organization_id) {
    const { data: teams } = await supabase
      .from('golf_teams')
      .select('id')
      .eq('organization_id', coach.organization_id);
    teamIds = (teams ?? []).map((t) => t.id);
  } else if (player) {
    const { data: memberships } = await supabase
      .from('golf_team_members')
      .select('team_id')
      .eq('player_id', player.id)
      .eq('status', 'active');
    teamIds = (memberships ?? [])
      .map((m) => m.team_id)
      .filter((id): id is string => Boolean(id));
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
    const { data: ownedClasses } = await supabase
      .from('golf_player_classes')
      .select('id')
      .eq('player_id', player.id)
      .in('id', Array.from(classEventsByClassId.keys()));
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
  if (classesResult.data) {
    for (const cls of classesResult.data as GolfPlayerClass[]) {
      if (classEventsByClassId.has(cls.id)) continue;
      const classInstances = expandRecurringClass(cls, timeMin, timeMax);
      busyPeriods.push(...classInstances);
    }
  }

  // Process coach blocked time
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
  return mergeOverlappingPeriods(busyPeriods);
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
 * already contributed its real rows. Bounded to the class's own term: a weekly
 * rule with no end date would otherwise mark a player busy every Monday
 * forever, including over the summer, and quietly break "find a time". A class
 * whose `semester` is unreadable therefore expands to NOTHING rather than to a
 * guess (legacy rows predate the column being persisted).
 */
function expandRecurringClass(
  cls: GolfPlayerClass,
  timeMin: Date,
  timeMax: Date
): BusyPeriod[] {
  const periods: BusyPeriod[] = [];

  if (!cls.days || cls.days.length === 0 || !cls.start_time || !cls.end_time) {
    return periods;
  }

  const term = parseSemesterDates(cls.semester);
  if (!term) return periods;

  const daysOfWeek = new Set(
    cls.days.map(weekdayIndex).filter((d): d is number => d !== null)
  );
  if (daysOfWeek.size === 0) return periods;

  // Clamp the walk to the intersection of the query window and the term.
  const termStart = new Date(`${term.start}T00:00:00`);
  const termEnd = new Date(`${term.end}T23:59:59`);
  const current = new Date(Math.max(timeMin.getTime(), termStart.getTime()));
  const until = new Date(Math.min(timeMax.getTime(), termEnd.getTime()));

  while (current <= until) {
    if (daysOfWeek.has(current.getDay())) {
      const start = setTimeOnDate(current, cls.start_time);
      const end = setTimeOnDate(current, cls.end_time);
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
function setTimeOnDate(date: Date, time: string): Date {
  const [hours, minutes] = time.split(':').map(Number);
  const result = new Date(date);
  result.setHours(hours ?? 0, minutes ?? 0, 0, 0);
  return result;
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

