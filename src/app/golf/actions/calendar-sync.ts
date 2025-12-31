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
  if (!user) throw new Error('Unauthorized');

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

  // Get a coach from the team to use as created_by (calendar events require a coach)
  const { data: teamCoach } = await supabase
    .from('golf_coaches')
    .select('id')
    .eq('team_id', teamId)
    .limit(1)
    .single();

  if (!teamCoach) {
    // If no coach exists for this team, skip calendar sync
    // Classes can still be created, just not synced to team calendar
    console.warn(`No coach found for team ${teamId}, skipping calendar sync`);
    return { success: true, skipped: true };
  }

  // Parse semester to determine start and end dates
  // Format examples: "Fall 2025", "Spring 2025", "Summer 2025"
  const semesterDates = parseSemesterDates(classData.semester);
  if (!semesterDates) {
    console.warn(`Unable to parse semester dates for: ${classData.semester}`);
    return { success: true, skipped: true };
  }

  // Delete existing calendar events for this class (if updating)
  // @ts-ignore - class_id column will exist after migration
  await supabase.from('golf_events').delete().eq('class_id', classId);

  // Create calendar events for each day the class meets
  const events = classData.days.map(day => {
    const dayOfWeek = getDayOfWeek(day);
    const firstOccurrence = getFirstOccurrenceDate(semesterDates.start, dayOfWeek);

    return {
      team_id: teamId,
      title: `${classData.course_code}: ${classData.course_name}`,
      event_type: 'class',
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
      created_by: teamCoach.id,
      class_id: classId,
    };
  });

  if (events.length === 0) {
    return { success: true, eventsCreated: 0 };
  }

  // @ts-ignore - golf_events table with class_id will exist after migration
  const { error } = await supabase.from('golf_events').insert(events);

  if (error) {
    console.error('Error syncing class to calendar:', error);
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

  // @ts-ignore - class_id column will exist after migration
  const { error } = await supabase.from('golf_events').delete().eq('class_id', classId);

  if (error) throw error;

  revalidatePath('/golf/dashboard/calendar');
  return { success: true };
}

/**
 * Parse semester string to get start and end dates
 * Format: "Fall 2025", "Spring 2026", etc.
 */
function parseSemesterDates(semester: string): { start: string; end: string } | null {
  const match = semester.match(/(Fall|Spring|Summer|Winter)\s+(\d{4})/i);
  if (!match || !match[1] || !match[2]) return null;

  const term = match[1];
  const year = match[2];
  const yearNum = parseInt(year, 10);

  switch (term.toLowerCase()) {
    case 'spring':
      return {
        start: `${yearNum}-01-15`, // Mid-January
        end: `${yearNum}-05-15`,   // Mid-May
      };
    case 'summer':
      return {
        start: `${yearNum}-06-01`, // Early June
        end: `${yearNum}-08-15`,   // Mid-August
      };
    case 'fall':
      return {
        start: `${yearNum}-08-20`, // Late August
        end: `${yearNum}-12-15`,   // Mid-December
      };
    case 'winter':
      return {
        start: `${yearNum}-12-15`, // Mid-December
        end: `${yearNum + 1}-01-15`, // Mid-January next year
      };
    default:
      return null;
  }
}

/**
 * Convert day name to day of week number (0 = Sunday, 6 = Saturday)
 */
function getDayOfWeek(day: string): number {
  const days: Record<string, number> = {
    'sunday': 0,
    'monday': 1,
    'tuesday': 2,
    'wednesday': 3,
    'thursday': 4,
    'friday': 5,
    'saturday': 6,
  };
  return days[day.toLowerCase()] ?? 1; // Default to Monday if unknown
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
