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
 * Sync a class to the golf calendar by creating event entries.
 * Creates one event per class occurrence (for each day the class meets).
 *
 * NOTE: golf_events does NOT have a `class_id` column.
 * We use the description field to tag class events for identification,
 * and delete/recreate when syncing.
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

  // Verify the provided teamId matches the player's team membership
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
    return { success: true, skipped: true };
  }

  // Delete existing calendar events for this class (identified by description tag)
  // Since there's no class_id column, we use a description marker
  const classTag = `[class:${classId}]`;
  await supabase
    .from('golf_events')
    .delete()
    .eq('team_id', teamId)
    .like('description', `%${classTag}%`);

  // Create calendar events for each day the class meets
  // golf_events schema: start_date (DATE), end_date (DATE), start_time (TIME), end_time (TIME)
  const events = classData.days.map(day => {
    const dayOfWeek = getDayOfWeek(day);
    const firstOccurrence = getFirstOccurrenceDate(semesterDates.start, dayOfWeek);

    return {
      team_id: teamId,
      title: `${classData.course_code}: ${classData.course_name}`,
      event_type: 'other' as const, // 'class' is not in golf_event_type enum; use 'other'
      start_date: firstOccurrence,
      end_date: semesterDates.end, // Classes recur until end of semester
      start_time: classData.start_time,
      end_time: classData.end_time,
      all_day: false,
      location: [classData.building, classData.room].filter(Boolean).join(' - ') || classData.location || null,
      description: [
        classData.instructor && `Instructor: ${classData.instructor}`,
        classData.credits && `Credits: ${classData.credits}`,
        classData.notes,
        classTag, // Tag to identify class events for future sync/delete
      ].filter(Boolean).join('\n') || null,
      is_mandatory: false,
      created_by: null, // Players can create events directly without coach
      status: 'confirmed' as const,
    };
  });

  if (events.length === 0) {
    return { success: true, eventsCreated: 0 };
  }

  const { error } = await supabase.from('golf_events').insert(events);

  if (error) {
    console.error('Failed to sync class to calendar:', error);
    return { success: false, error: 'Failed to sync class to calendar. Please try again.' };
  }

  revalidatePath('/golf/dashboard/calendar');
  return { success: true, eventsCreated: events.length };
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
    console.error('Failed to remove class from calendar:', error);
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
