'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

// ============================================================================
// TYPES
// ============================================================================

export interface CalendarSyncResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
  eventsCreated?: number;
  skipped?: boolean;
}

interface ClassFormData {
  id?: string;
  course_code: string;
  course_name: string;
  instructor: string;
  days: string[]; // e.g., ['Monday', 'Wednesday', 'Friday']
  start_time: string; // e.g., '09:00'
  end_time: string; // e.g., '10:15'
  location: string;
  building: string;
  room: string;
  credits: number | null;
  semester: string;
  semesterStartDate?: string; // Custom semester start date (YYYY-MM-DD)
  color: string;
  notes: string;
}

/**
 * Sync a class to the golf calendar by creating individual event rows
 * for each weekly occurrence throughout the semester.
 *
 * The actual golf_events table uses:
 *   - start_time (timestamptz, NOT NULL) — full datetime for event start
 *   - end_time (timestamptz, nullable) — full datetime for event end
 *   - NO start_date/end_date columns
 *
 * We tag class events with [class:<id>] in the description field
 * so they can be identified and deleted/recreated when syncing.
 */
export async function syncClassToCalendar(
  classData: ClassFormData,
  classId: string,
  playerId: string,
  teamId: string
): Promise<CalendarSyncResult> {
  const supabase = await createClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return { success: false, error: 'Not authenticated' };
  }

  // Verify user is a golf player
  const { data: player, error: playerError } = await supabase
    .from('golf_players')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (playerError || !player || player.id !== playerId) {
    return { success: false, error: 'Not authorized to sync this calendar' };
  }

  if (!teamId) {
    return { success: false, error: 'Player must be on a team to sync calendar' };
  }

  // Verify player is a member of the specified team
  const { data: membership } = await supabase
    .from('golf_team_members')
    .select('team_id')
    .eq('player_id', player.id)
    .eq('team_id', teamId)
    .maybeSingle();

  if (!membership) {
    return { success: false, error: 'Player is not a member of this team' };
  }

  // Parse semester to determine start and end dates
  const semesterDates = parseSemesterDates(classData.semester, classData.semesterStartDate);

  if (!semesterDates) {
    return { success: false, error: 'Could not determine semester dates. Please set a semester start date.' };
  }

  // Delete existing calendar events for this class (identified by description tag)
  const classTag = `[class:${classId}]`;
  await supabase
    .from('golf_events')
    .delete()
    .eq('team_id', teamId)
    .like('description', `%${classTag}%`);

  // Build shared event fields
  const title = classData.course_code
    ? `${classData.course_code}: ${classData.course_name}`
    : classData.course_name || 'Class';
  const location = [classData.building, classData.room].filter(Boolean).join(' - ') || classData.location || null;
  const description = [
    classData.instructor && `Instructor: ${classData.instructor}`,
    classData.credits && `Credits: ${classData.credits}`,
    classData.notes,
    classTag,
  ].filter(Boolean).join('\n') || classTag;

  // Generate one event row per weekly occurrence for each day the class meets.
  // The calendar UI matches events by comparing start_time to the displayed date,
  // so each week needs its own row.
  const semesterEnd = new Date(semesterDates.end + 'T23:59:59');
  const events: Array<Record<string, unknown>> = [];

  for (const day of classData.days) {
    const dayOfWeek = getDayOfWeek(day);
    const firstDateStr = getFirstOccurrenceDate(semesterDates.start, dayOfWeek);
    const cursor = new Date(firstDateStr + 'T00:00:00');

    while (cursor <= semesterEnd) {
      const dateStr = cursor.toISOString().split('T')[0];
      events.push({
        team_id: teamId,
        title,
        event_type: 'other',
        // start_time/end_time are timestamptz — combine date + class time
        start_time: `${dateStr}T${classData.start_time || '08:00'}:00`,
        end_time: `${dateStr}T${classData.end_time || '09:00'}:00`,
        all_day: false,
        location,
        description,
        status: 'confirmed',
      });
      // Advance by 7 days for next weekly occurrence
      cursor.setDate(cursor.getDate() + 7);
    }
  }

  if (events.length === 0) {
    return { success: true, eventsCreated: 0 };
  }

  // Insert in batches of 100 to stay within Supabase limits
  const BATCH_SIZE = 100;
  let totalInserted = 0;

  for (let i = 0; i < events.length; i += BATCH_SIZE) {
    const batch = events.slice(i, i + BATCH_SIZE);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from('golf_events').insert(batch);
    if (error) {
      return { success: false, error: 'Failed to sync class to calendar. Please try again.' };
    }
    totalInserted += batch.length;
  }

  revalidatePath('/golf/dashboard/calendar');
  return { success: true, eventsCreated: totalInserted };
}

/**
 * Remove calendar events for a deleted class
 */
export async function removeClassFromCalendar(classId: string, teamId?: string): Promise<CalendarSyncResult> {
  const supabase = await createClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return { success: false, error: 'Not authenticated' };
  }

  // Delete events tagged with this class ID in description
  const classTag = `[class:${classId}]`;
  let query = supabase
    .from('golf_events')
    .delete()
    .like('description', `%${classTag}%`);

  if (teamId) {
    query = query.eq('team_id', teamId);
  }

  const { error } = await query;

  if (error) {
    return { success: false, error: 'Failed to remove class from calendar. Please try again.' };
  }

  revalidatePath('/golf/dashboard/calendar');
  return { success: true };
}

/**
 * Parse semester string to get start and end dates
 * Format: "Fall 2025", "Spring 2026", etc.
 * If customStartDate is provided, use it instead of the default start date
 */
function parseSemesterDates(semester: string, customStartDate?: string): { start: string; end: string } | null {
  const match = semester.match(/(Fall|Spring|Summer|Winter)\s+(\d{4})/i);
  if (!match || !match[1] || !match[2]) return null;

  const term = match[1];
  const year = match[2];
  const yearNum = parseInt(year, 10);

  let startDate: string;
  let endDate: string;

  switch (term.toLowerCase()) {
    case 'spring':
      startDate = customStartDate || `${yearNum}-01-15`; // Mid-January
      endDate = `${yearNum}-05-15`;   // Mid-May
      break;
    case 'summer':
      startDate = customStartDate || `${yearNum}-06-01`; // Early June
      endDate = `${yearNum}-08-15`;   // Mid-August
      break;
    case 'fall':
      startDate = customStartDate || `${yearNum}-08-20`; // Late August
      endDate = `${yearNum}-12-15`;   // Mid-December
      break;
    case 'winter':
      startDate = customStartDate || `${yearNum}-12-15`; // Mid-December
      endDate = `${yearNum + 1}-01-15`; // Mid-January next year
      break;
    default:
      return null;
  }

  return { start: startDate, end: endDate };
}

/**
 * Convert day code to day of week number (0 = Sunday, 6 = Saturday)
 * Supports both short codes (M, T, W, Th, F) and full names
 */
function getDayOfWeek(day: string): number {
  // Handle short day codes (what's stored in database)
  const shortCodes: Record<string, number> = {
    'M': 1,   // Monday
    'T': 2,   // Tuesday
    'W': 3,   // Wednesday
    'Th': 4,  // Thursday
    'F': 5,   // Friday
  };

  // Check short codes first
  if (shortCodes[day]) {
    return shortCodes[day];
  }

  // Fallback to full day names
  const fullNames: Record<string, number> = {
    'sunday': 0,
    'monday': 1,
    'tuesday': 2,
    'wednesday': 3,
    'thursday': 4,
    'friday': 5,
    'saturday': 6,
  };
  return fullNames[day.toLowerCase()] ?? 1; // Default to Monday if unknown
}

/**
 * Get the first occurrence of a day of week on or after the start date
 */
function getFirstOccurrenceDate(startDate: string, dayOfWeek: number): string {
  const date = new Date(startDate);
  const currentDay = date.getDay();

  // Calculate days to add to get to the target day
  let daysToAdd = dayOfWeek - currentDay;
  if (daysToAdd < 0) {
    daysToAdd += 7;
  }

  date.setDate(date.getDate() + daysToAdd);

  // Return in YYYY-MM-DD format
  return date.toISOString().split('T')[0] || startDate;
}
