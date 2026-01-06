'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

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
 * Sync a class to the golf calendar by creating recurring event entries
 * Creates one event per class occurrence (for each day the class meets)
 */
export async function syncClassToCalendar(classData: ClassFormData, classId: string, playerId: string, teamId: string) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('Unauthorized');
  }

  // Verify user is a golf player
  const { data: player } = await supabase
    .from('golf_players')
    .select('id, team_id')
    .eq('user_id', user.id)
    .single();

  if (!player || player.id !== playerId) {
    throw new Error('Unauthorized: player mismatch');
  }

  if (!teamId) {
    throw new Error('Player must be on a team to sync calendar');
  }

  // Parse semester to determine start and end dates
  const semesterDates = parseSemesterDates(classData.semester, classData.semesterStartDate);

  if (!semesterDates) {
    return { success: true, skipped: true };
  }

  // Delete existing calendar events for this class (if updating)
  await supabase.from('golf_events').delete().eq('class_id', classId);

  // Create calendar events for each day the class meets
  const events = classData.days.map(day => {
    const dayOfWeek = getDayOfWeek(day);
    const firstOccurrence = getFirstOccurrenceDate(semesterDates.start, dayOfWeek);

    return {
      team_id: teamId,
      title: `${classData.course_code}: ${classData.course_name}`,
      event_type: 'class' as const,
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
      ].filter(Boolean).join('\n') || null,
      is_mandatory: false,
      created_by: null, // Players can create events directly without coach
      class_id: classId,
    };
  });

  if (events.length === 0) {
    return { success: true, eventsCreated: 0 };
  }

  const { error } = await supabase.from('golf_events').insert(events);

  if (error) {
    throw error;
  }

  revalidatePath('/golf/dashboard/calendar');
  return { success: true, eventsCreated: events.length };
}

/**
 * Remove calendar events for a deleted class
 */
export async function removeClassFromCalendar(classId: string) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  const { error } = await supabase.from('golf_events').delete().eq('class_id', classId);

  if (error) throw error;

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
