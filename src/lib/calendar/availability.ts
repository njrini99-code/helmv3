/**
 * Availability Calculation Utilities
 *
 * Inspired by Google Calendar's freebusy API, these utilities calculate
 * busy/free time periods for users by combining:
 * - Team events (golf_events)
 * - Player-specific events (where they've RSVP'd)
 * - Academic classes (golf_player_classes - recurring schedule)
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { GolfPlayerClass } from '@/lib/types/golf';

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

export interface AvailabilityResult {
  userId: string;
  busyPeriods: BusyPeriod[];
  freePeriods: Array<{ start: Date; end: Date }>;
}

export interface TimeSlot {
  start: Date;
  end: Date;
}

export interface WorkingHours {
  start: number; // hour (0-23)
  end: number;   // hour (0-23)
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

  // 1. Get player/coach profile
  const { data: player } = await supabase
    .from('golf_players')
    .select('id, team_id, user_id')
    .eq('user_id', userId)
    .maybeSingle();

  const { data: coach } = await supabase
    .from('golf_coaches')
    .select('id, team_id, user_id')
    .eq('user_id', userId)
    .maybeSingle();

  const isCoach = !!coach;

  // 2. Fetch team events they're part of
  const teamId = coach?.team_id || player?.team_id;
  if (teamId) {
    const { data: events } = await supabase
      .from('golf_events')
      .select('*')
      .eq('team_id', teamId)
      .gte('start_date', timeMin.toISOString().split('T')[0])
      .lte('start_date', timeMax.toISOString().split('T')[0]);

    for (const event of events || []) {
      const startDateTime = parseEventDateTime(event.start_date, event.start_time);
      const endDateTime = parseEventDateTime(
        event.end_date || event.start_date,
        event.end_time || event.start_time
      );

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
  }

  // 3. Fetch events where player has RSVP'd accepted (for players only)
  if (player) {
    const { data: attendances } = await supabase
      .from('golf_event_attendance')
      .select(`
        event_id,
        status,
        event:golf_events(*)
      `)
      .eq('player_id', player.id)
      .eq('status', 'accepted');

    // Add to busyPeriods (dedupe by event_id)
    const existingEventIds = new Set(busyPeriods.map(p => p.eventId).filter(Boolean));

    for (const attendance of attendances || []) {
      const event = (attendance as any).event;
      if (!event || existingEventIds.has(event.id)) continue;

      const startDateTime = parseEventDateTime(event.start_date, event.start_time);
      const endDateTime = parseEventDateTime(
        event.end_date || event.start_date,
        event.end_time || event.start_time
      );

      busyPeriods.push({
        start: startDateTime,
        end: endDateTime,
        type: 'event',
        title: event.title,
        eventId: event.id,
        ownerId: player.user_id,
        ownerType: 'player',
      });
    }
  }

  // 4. Fetch academic classes (recurring schedule - players only)
  if (player) {
    const { data: classes } = await supabase
      .from('golf_player_classes')
      .select('*')
      .eq('player_id', player.id);

    // Convert recurring class schedule to busy periods within timeMin/timeMax
    for (const cls of classes || []) {
      const classInstances = expandRecurringClass(cls, timeMin, timeMax);
      busyPeriods.push(...classInstances);
    }
  }

  // 5. Fetch coach blocked time (coaches only)
  if (coach) {
    const { data: blockedTimes } = await supabase
      .from('golf_coach_blocked_time')
      .select('*')
      .eq('coach_id', coach.id)
      .gte('end_date', timeMin.toISOString().split('T')[0])
      .lte('start_date', timeMax.toISOString().split('T')[0]);

    for (const blocked of blockedTimes || []) {
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
        ownerId: coach.user_id,
        ownerType: 'coach',
      });
    }
  }

  // 6. Sort by start time and merge overlapping periods
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
 * Expand a recurring class schedule into individual busy periods
 * Classes repeat weekly on specific days
 */
function expandRecurringClass(
  cls: GolfPlayerClass,
  timeMin: Date,
  timeMax: Date
): BusyPeriod[] {
  const periods: BusyPeriod[] = [];

  if (!cls.days || cls.days.length === 0) {
    return periods;
  }

  const daysOfWeek = cls.days; // e.g., ['monday', 'wednesday', 'friday']

  // Iterate through each day in the range
  let current = new Date(timeMin);
  while (current <= timeMax) {
    const dayName = current.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();

    if (daysOfWeek.includes(dayName)) {
      const start = setTimeOnDate(current, cls.start_time);
      const end = setTimeOnDate(current, cls.end_time);

      periods.push({
        start,
        end,
        type: 'class',
        title: cls.course_name,
        ownerId: undefined,
      });
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

  let currentDate = new Date(dateRange.start);
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

/**
 * Format a date range for display
 */
export function formatDateRange(start: Date, end: Date): string {
  const sameDay = start.toDateString() === end.toDateString();

  if (sameDay) {
    return `${start.toLocaleDateString()} ${start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }

  return `${start.toLocaleDateString()} ${start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${end.toLocaleDateString()} ${end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}
