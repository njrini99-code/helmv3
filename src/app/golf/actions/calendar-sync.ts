'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import { revalidatePath } from 'next/cache';
import type { Database } from '@/lib/types/database';

// ============================================================================
// TYPES
// ============================================================================

export interface CalendarSyncResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
  eventsCreated?: number;
  eventsUpdated?: number;
  eventsDeleted?: number;
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
  /**
   * Caller's UTC offset in minutes, from `Date.getTimezoneOffset()` (positive
   * west of UTC). Same convention golf.ts event actions use. When omitted,
   * timestamps are written as UTC (+00:00) — explicit, matching the events
   * convention's default rather than relying on offset-naive strings.
   */
  timezoneOffset?: number;
}

type GolfEventInsert = Database['public']['Tables']['golf_events']['Insert'];

interface ExistingClassEventRow {
  id: string;
  title: string;
  start_time: string;
  end_time: string | null;
  location: string | null;
  description: string | null;
}

// ============================================================================
// TIMESTAMP HELPERS — same timezone-offset convention as golf.ts events
// ============================================================================

/**
 * Build an ISO 8601 offset string ("-06:00") from `Date.getTimezoneOffset()`
 * minutes (positive = behind UTC). Mirrors golf.ts:formatTimezoneOffset so
 * class events land on the same wall-clock instant as coach-created events.
 */
function formatTimezoneOffset(offsetMinutes: number): string {
  const sign = offsetMinutes <= 0 ? '+' : '-';
  const absMinutes = Math.abs(offsetMinutes);
  const hours = Math.floor(absMinutes / 60);
  const minutes = absMinutes % 60;
  return `${sign}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/** Mirrors golf.ts:buildDateTimeString — date + time + explicit offset. */
function buildDateTimeString(date: string, time: string, timezoneOffset?: number): string {
  const tz = timezoneOffset !== undefined ? formatTimezoneOffset(timezoneOffset) : '+00:00';
  return `${date}T${time}${tz}`;
}

/**
 * Recover the caller-local calendar date (YYYY-MM-DD) of a stored timestamptz.
 * PostgREST returns timestamps UTC-normalized, so the raw date portion can be
 * off by a day relative to the date the occurrence was generated for.
 */
function localDateKey(timestamp: string, timezoneOffset: number): string {
  const epoch = new Date(timestamp).getTime();
  // local wall-clock = UTC - offsetMinutes (getTimezoneOffset is positive west)
  return new Date(epoch - timezoneOffset * 60_000).toISOString().slice(0, 10);
}

function sameInstant(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return a === b;
  return new Date(a).getTime() === new Date(b).getTime();
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
 * We tag class events with [class:<id>] in the description field so they can
 * be identified on later syncs. Re-syncing performs a DIFF against existing
 * rows — insert new occurrences, update changed ones, delete only rows whose
 * occurrence no longer exists — never a blanket delete-then-reinsert (a
 * transient failure mid-resync must not destroy the schedule).
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

  // Verify user is a golf player AND is the player they claim to sync for.
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

  // Verify player is a member of the specified team.
  const { data: membership, error: membershipError } = await supabase
    .from('golf_team_members')
    .select('team_id')
    .eq('player_id', player.id)
    .eq('team_id', teamId)
    .maybeSingle();

  if (membershipError || !membership) {
    return { success: false, error: 'Player is not a member of this team' };
  }

  // Parse semester to determine start and end dates
  const semesterDates = parseSemesterDates(classData.semester, classData.semesterStartDate);

  if (!semesterDates) {
    return { success: false, error: 'Could not determine semester dates. Please set a semester start date.' };
  }

  // WHY THE ADMIN CLIENT: golf_events RLS only lets COACHES write team events,
  // so every player-initiated class sync was silently blocked (0 rows ever
  // written). A player syncing their OWN class schedule onto their OWN team's
  // calendar is a legitimate write, so after the explicit authz above (caller
  // IS the player, player IS a member of teamId) we perform the writes with
  // the service-role client. Every write below stays scoped to this teamId +
  // this class's tag — the admin client never touches anything the checks
  // above didn't authorize.
  const admin = createAdminClient();

  const classTag = `[class:${classId}]`;
  const tzOffset = classData.timezoneOffset;

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

  // Generate one desired occurrence per weekly meeting, keyed by local date.
  // The calendar UI matches events by comparing start_time to the displayed
  // date, so each week needs its own row.
  //
  // All date-only arithmetic here is done in UTC (explicit Z suffix +
  // getUTC*/setUTC* methods) so occurrence dates don't shift by a day
  // depending on the SERVER's timezone. The caller's wall-clock time enters
  // only through buildDateTimeString's explicit offset.
  const semesterEnd = new Date(semesterDates.end + 'T23:59:59Z');
  const desiredByDate = new Map<string, GolfEventInsert>();

  for (const day of classData.days) {
    const dayOfWeek = getDayOfWeek(day);
    const firstDateStr = getFirstOccurrenceDate(semesterDates.start, dayOfWeek);
    const cursor = new Date(firstDateStr + 'T00:00:00Z');

    while (cursor <= semesterEnd) {
      const dateStr = cursor.toISOString().slice(0, 10);
      desiredByDate.set(dateStr, {
        team_id: teamId,
        title,
        event_type: 'other',
        // start_time/end_time are timestamptz — date + class time + explicit
        // offset, the same convention golf.ts events use.
        start_time: buildDateTimeString(dateStr, `${classData.start_time || '08:00'}:00`, tzOffset),
        end_time: buildDateTimeString(dateStr, `${classData.end_time || '09:00'}:00`, tzOffset),
        all_day: false,
        location,
        description,
        status: 'confirmed',
      });
      // Advance by 7 days for next weekly occurrence (UTC — see note above)
      cursor.setUTCDate(cursor.getUTCDate() + 7);
    }
  }

  // Fetch existing calendar rows for this class (paginated — a multi-semester
  // tag history can exceed the PostgREST 1000-row cap).
  const { data: existingRows, error: existingError } = await fetchAllRowsResult((from, to) =>
    admin
      .from('golf_events')
      .select('id, title, start_time, end_time, location, description')
      .eq('team_id', teamId)
      .like('description', `%${classTag}%`)
      .order('id', { ascending: true })
      .range(from, to),
  );

  if (existingError) {
    return { success: false, error: `Failed to load existing class events: ${existingError.message}` };
  }

  // Diff: match existing rows to desired occurrences by local calendar date.
  const matchedByDate = new Map<string, ExistingClassEventRow>();
  const staleIds: string[] = [];
  for (const row of (existingRows ?? []) as ExistingClassEventRow[]) {
    const key = localDateKey(row.start_time, tzOffset ?? 0);
    if (desiredByDate.has(key) && !matchedByDate.has(key)) {
      matchedByDate.set(key, row);
    } else {
      // Occurrence removed (day dropped / semester shortened) or duplicate.
      staleIds.push(row.id);
    }
  }

  const toInsert: GolfEventInsert[] = [];
  const toUpdate: Array<{ id: string; changes: Database['public']['Tables']['golf_events']['Update'] }> = [];

  for (const [dateKey, desired] of desiredByDate) {
    const existing = matchedByDate.get(dateKey);
    if (!existing) {
      toInsert.push(desired);
      continue;
    }
    const changed =
      existing.title !== desired.title ||
      existing.location !== desired.location ||
      existing.description !== desired.description ||
      !sameInstant(existing.start_time, desired.start_time ?? null) ||
      !sameInstant(existing.end_time, desired.end_time ?? null);
    if (changed) {
      toUpdate.push({
        id: existing.id,
        changes: {
          title: desired.title,
          start_time: desired.start_time,
          end_time: desired.end_time,
          location: desired.location,
          description: desired.description,
        },
      });
    }
  }

  // Apply the diff: insert + update first, delete stale rows LAST so a
  // transient failure leaves extra (still-valid-looking) rows rather than a
  // hole in the schedule.
  const BATCH_SIZE = 100;

  for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
    const batch = toInsert.slice(i, i + BATCH_SIZE);
    const { error } = await admin.from('golf_events').insert(batch);
    if (error) {
      return { success: false, error: `Failed to sync class to calendar: ${error.message}` };
    }
  }

  for (const { id, changes } of toUpdate) {
    const { error } = await admin
      .from('golf_events')
      .update(changes)
      .eq('id', id)
      .eq('team_id', teamId);
    if (error) {
      return { success: false, error: `Failed to update class events: ${error.message}` };
    }
  }

  for (let i = 0; i < staleIds.length; i += BATCH_SIZE) {
    const batch = staleIds.slice(i, i + BATCH_SIZE);
    const { error } = await admin
      .from('golf_events')
      .delete()
      .eq('team_id', teamId)
      .in('id', batch);
    if (error) {
      return { success: false, error: `Failed to remove outdated class events: ${error.message}` };
    }
  }

  revalidatePath('/golf/dashboard/calendar');
  return {
    success: true,
    eventsCreated: toInsert.length,
    eventsUpdated: toUpdate.length,
    eventsDeleted: staleIds.length,
  };
}

/**
 * Remove calendar events for a deleted class.
 *
 * Pure removal path (the source class is gone), so deletion is correct here —
 * this is not a sync/save rebuild. Same authz model as syncClassToCalendar:
 * verify the caller is a player and resolve THEIR team memberships, then
 * delete via the admin client (player RLS cannot delete golf_events) scoped
 * to the class tag AND the player's own team(s).
 */
export async function removeClassFromCalendar(classId: string, teamId?: string): Promise<CalendarSyncResult> {
  const supabase = await createClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return { success: false, error: 'Not authenticated' };
  }

  const { data: player, error: playerError } = await supabase
    .from('golf_players')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (playerError || !player) {
    return { success: false, error: 'Not authorized to remove class events' };
  }

  const { data: memberships, error: membershipError } = await supabase
    .from('golf_team_members')
    .select('team_id')
    .eq('player_id', player.id);

  if (membershipError) {
    return { success: false, error: `Failed to verify team membership: ${membershipError.message}` };
  }

  const memberTeamIds = (memberships ?? []).map((m) => m.team_id).filter((t): t is string => Boolean(t));
  if (memberTeamIds.length === 0) {
    // No team → class events are team-scoped, so there is nothing to remove.
    return { success: true, eventsDeleted: 0 };
  }

  if (teamId && !memberTeamIds.includes(teamId)) {
    return { success: false, error: 'Player is not a member of this team' };
  }

  const targetTeamIds = teamId ? [teamId] : memberTeamIds;

  // Authz established above — admin client required because player RLS has no
  // DELETE grant on golf_events. Scoped to the class tag + the player's teams.
  const admin = createAdminClient();
  const classTag = `[class:${classId}]`;
  const { error } = await admin
    .from('golf_events')
    .delete()
    .like('description', `%${classTag}%`)
    .in('team_id', targetTeamIds);

  if (error) {
    return { success: false, error: `Failed to remove class from calendar: ${error.message}` };
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
 * Get the first occurrence of a day of week on or after the start date.
 *
 * UTC-consistent: `new Date('YYYY-MM-DD')` parses as UTC midnight, so the
 * day-of-week and date arithmetic MUST use the getUTC / setUTC methods.
 * The previous local-time mix (getDay/setDate) shifted the result by one
 * day whenever the server's timezone wasn't UTC.
 */
function getFirstOccurrenceDate(startDate: string, dayOfWeek: number): string {
  const date = new Date(startDate + 'T00:00:00Z');
  const currentDay = date.getUTCDay();

  // Calculate days to add to get to the target day
  let daysToAdd = dayOfWeek - currentDay;
  if (daysToAdd < 0) {
    daysToAdd += 7;
  }

  date.setUTCDate(date.getUTCDate() + daysToAdd);

  // Return in YYYY-MM-DD format
  return date.toISOString().split('T')[0] || startDate;
}
