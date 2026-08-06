'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import { revalidatePath } from 'next/cache';
import type { Database } from '@/lib/types/database';
import { withAdminObserved } from '@/lib/admin/observed-action';
import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';
import { parseSemesterDates } from '@/lib/golf/semester';
import { CLASS_EVENT_TYPE, classTag } from '@/lib/calendar/class-events';

/**
 * Hard ceiling on occurrences generated for one class sync. ~400 covers a full
 * calendar year of daily meetings — far above any real semester — while
 * stopping a crafted semester range from filling golf_events through the
 * service-role client. Audit DS-B4.
 */
const MAX_GENERATED_OCCURRENCES = 400;

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
  event_type: string | null;
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

/**
 * Normalize a wall-clock time to strict `HH:MM:SS`.
 *
 * `golf_player_classes.start_time` is a Postgres `time` column, so PostgREST
 * hands it back as "10:50:00" — while the class form emits "10:50". The sync
 * used to append ":00" unconditionally, so every RE-sync of an already-saved
 * class built "10:50:00:00" and Postgres rejected the entire batch:
 *
 *   invalid input syntax for type timestamp with time zone:
 *   "2026-06-01T10:50:00:00-04:00"
 *
 * Three real players hit that on 2026-08-06 — editing a saved class failed
 * outright. Accept either shape, and refuse anything else rather than hand
 * Postgres a string it will reject.
 */
function normalizeTimeOfDay(value: string | null | undefined): string | null {
  const match = (value ?? '').trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3] ?? '0');
  if (hours > 23 || minutes > 59 || seconds > 59) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

/**
 * Mirrors golf.ts:buildDateTimeString — date + time + explicit offset.
 * `time` must already be normalized; callers use normalizeTimeOfDay and
 * surface an error rather than let an unparseable value become midnight (a
 * fabricated 12:00 AM meeting is exactly what the class form avoids by
 * storing NULL for "no time set").
 */
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
async function syncClassToCalendarImpl(
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

  // Verify the class row BELONGS to the calling player (PR #259 review,
  // verified real): without this, any teammate could pass another player's
  // classId and overwrite/delete that player's class events via the
  // tag-scoped admin writes below.
  const { data: ownedClass, error: ownedClassError } = await supabase
    .from('golf_player_classes')
    .select('id, semester')
    .eq('id', classId)
    .eq('player_id', player.id)
    .maybeSingle();

  if (ownedClassError || !ownedClass) {
    return { success: false, error: 'Not authorized to sync this class' };
  }

  try {
    // DS-B4: every field of `classData` is caller-controlled on a 'use server'
    // export, and the semester drove UNBOUNDED occurrence generation — "Fall
    // 9999" with a year-0001 start produced ~500k rows per meeting day, written
    // with the service-role client. Prefer the semester persisted on the class
    // row; the import path never writes one, so fall back to the submitted
    // value and let parseSemesterDates' range validation plus the hard cap
    // below bound the generation.
    const semesterDates = parseSemesterDates(
      ownedClass.semester ?? classData.semester,
      classData.semesterStartDate,
    );

    if (!semesterDates) {
      return { success: false, error: 'Could not determine semester dates. Please set a semester start date.' };
    }

    // WHY THE ADMIN CLIENT: golf_events RLS only lets COACHES write team events,
    // so every player-initiated class sync was silently blocked (0 rows ever
    // written). A player syncing their OWN class schedule onto their OWN team's
    // calendar is a legitimate write, so after the explicit authz above (caller
    // IS the player, player IS a member of teamId, player OWNS the class) we
    // perform the writes with the service-role client. Every write below stays
    // scoped to this teamId + this class's tag — the admin client never touches
    // anything the checks above didn't authorize.
    const admin = createAdminClient();

    const tag = classTag(classId);
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
      tag,
    ].filter(Boolean).join('\n') || tag;

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

    // DS-B4: distinct weekday numbers only. `classData.days` is caller-supplied
    // and unbounded, and getDayOfWeek collapses unknown codes onto Monday, so
    // the raw array could otherwise drive the same weekly walk thousands of
    // times over.
    const dayNumbers = new Set<number>();
    for (const day of Array.isArray(classData.days) ? classData.days : []) {
      dayNumbers.add(getDayOfWeek(day));
    }

    // Resolve the meeting times ONCE, before generating anything. An absent
    // time keeps the long-standing 08:00/09:00 default; an unparseable one is
    // refused outright rather than silently becoming midnight.
    const startTimeOfDay = classData.start_time ? normalizeTimeOfDay(classData.start_time) : '08:00:00';
    const endTimeOfDay = classData.end_time ? normalizeTimeOfDay(classData.end_time) : '09:00:00';
    if (!startTimeOfDay || !endTimeOfDay) {
      return { success: false, error: 'Class start and end times must look like HH:MM.' };
    }

    for (const dayOfWeek of dayNumbers) {
      const firstDateStr = getFirstOccurrenceDate(semesterDates.start, dayOfWeek);
      const cursor = new Date(firstDateStr + 'T00:00:00Z');

      while (cursor <= semesterEnd) {
        const dateStr = cursor.toISOString().slice(0, 10);
        desiredByDate.set(dateStr, {
          team_id: teamId,
          title,
          // A class meeting is NOT a team event. Typing it makes every
          // team-scoped query able to say so in SQL instead of LIKE-scanning
          // the description — see lib/calendar/class-events.ts.
          event_type: CLASS_EVENT_TYPE,
          // start_time/end_time are timestamptz — date + class time + explicit
          // offset, the same convention golf.ts events use.
          start_time: buildDateTimeString(dateStr, startTimeOfDay, tzOffset),
          end_time: buildDateTimeString(dateStr, endTimeOfDay, tzOffset),
          all_day: false,
          location,
          description,
          status: 'confirmed',
        });
        // DS-B4: refuse rather than generate — a range that produces more than
        // a year of daily meetings is crafted, not a semester.
        if (desiredByDate.size > MAX_GENERATED_OCCURRENCES) {
          return { success: false, error: 'Semester range too large' };
        }
        // Advance by 7 days for next weekly occurrence (UTC — see note above)
        cursor.setUTCDate(cursor.getUTCDate() + 7);
      }
    }

    // Fetch existing calendar rows for this class (paginated — a multi-semester
    // tag history can exceed the PostgREST 1000-row cap).
    const { data: existingRows, error: existingError } = await fetchAllRowsResult((from, to) =>
      admin
        .from('golf_events')
        .select('id, title, event_type, start_time, end_time, location, description')
        .eq('team_id', teamId)
        .like('description', `%${tag}%`)
        .order('id', { ascending: true })
        .range(from, to),
      undefined,
      { table: 'golf_events', action: 'syncClassToCalendar', feature: 'academics_classes', sport: 'golf' },
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
        // Self-heals a row written before class events were typed, so a
        // re-sync converges even if the one-off backfill missed it.
        existing.event_type !== desired.event_type ||
        existing.location !== desired.location ||
        existing.description !== desired.description ||
        !sameInstant(existing.start_time, desired.start_time ?? null) ||
        !sameInstant(existing.end_time, desired.end_time ?? null);
      if (changed) {
        toUpdate.push({
          id: existing.id,
          changes: {
            title: desired.title,
            event_type: desired.event_type,
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
  } catch (error) {
    // DS-B4: the date arithmetic above can throw a raw RangeError (toISOString
    // on an out-of-range Date) for a malformed semester start. A 'use server'
    // entrypoint must always answer with a CalendarSyncResult, never a stack.
    const message = `Failed to sync class to calendar: ${describeError(error)}`;
    await logServerError(message, {
      action: 'syncClassToCalendar',
      feature: 'academics_classes',
      sport: 'golf',
      source: 'server_action',
      playerId,
      teamId,
    });
    return { success: false, error: message };
  }
}

const observedSyncClassToCalendar = withAdminObserved(
  'syncClassToCalendar',
  { sport: 'golf', feature: 'academics_classes' },
  syncClassToCalendarImpl,
);

export async function syncClassToCalendar(
  classData: ClassFormData,
  classId: string,
  playerId: string,
  teamId: string
): Promise<CalendarSyncResult> {
  return observedSyncClassToCalendar(classData, classId, playerId, teamId);
}

/**
 * Remove calendar events for a class the caller is deleting.
 *
 * Pure removal path, so deletion is correct here — this is not a sync/save
 * rebuild. Same authz model as syncClassToCalendar: verify the caller is a
 * player, resolve THEIR team memberships, prove the class is not SOMEBODY
 * ELSE'S, then delete via the admin client (player RLS cannot delete
 * golf_events) scoped to the class tag AND the player's own team(s).
 *
 * An ABSENT class row is a NARROWED orphan cleanup, not a denial. Both call
 * sites in /golf/dashboard/classes discard this result and delete the
 * golf_player_classes row regardless, so a denial-on-absence would strand every
 * `[class:<id>]`-tagged event permanently the first time removal hit a
 * transient failure — the retry could never find the row again. The cleanup is
 * safe because it is doubly scoped: only events carrying THIS class's tag, and
 * only on teams the caller is already a member of.
 */
async function removeClassFromCalendarImpl(classId: string, teamId?: string): Promise<CalendarSyncResult> {
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

  // Class ownership (PR #259 review, verified real): a LIVE class owned by
  // someone else must never be removable — otherwise any teammate could delete
  // another player's class events via the tag-scoped delete below.
  //
  // DS-B4: this lookup runs on the SERVICE-ROLE client ON PURPOSE. On the
  // session client, golf_player_classes RLS shows a player only their OWN
  // rows, so a teammate's LIVE class read back as absent and this guard was
  // skipped entirely — RLS invisibility was being mistaken for "the class is
  // gone", and THAT is what made absence a bypass. Reading past RLS fixes it at
  // the source: absence now genuinely means the row is gone, so the orphan
  // allowance below no longer hands an attacker a live class.
  const admin = createAdminClient();
  const { data: classRow, error: classRowError } = await admin
    .from('golf_player_classes')
    .select('id, player_id')
    .eq('id', classId)
    .maybeSingle();

  if (classRowError) {
    // Unreadable is UNKNOWN ownership, not an orphan — refuse rather than guess.
    return { success: false, error: `Failed to verify class ownership: ${classRowError.message}` };
  }
  if (classRow && classRow.player_id !== player.id) {
    return { success: false, error: 'Not authorized to remove this class' };
  }
  // classRow === null → the class really is gone. Fall through to the narrowed
  // orphan cleanup: this tag only, on the caller's own teams only.

  // Authz established above — admin client also required for the delete itself
  // because player RLS has no DELETE grant on golf_events. Scoped to the class
  // tag + the player's teams.
  const tag = classTag(classId);
  const { error } = await admin
    .from('golf_events')
    .delete()
    .like('description', `%${tag}%`)
    .in('team_id', targetTeamIds);

  if (error) {
    return { success: false, error: `Failed to remove class from calendar: ${error.message}` };
  }

  revalidatePath('/golf/dashboard/calendar');
  return { success: true };
}

const observedRemoveClassFromCalendar = withAdminObserved(
  'removeClassFromCalendar',
  { sport: 'golf', feature: 'academics_classes' },
  removeClassFromCalendarImpl,
);

export async function removeClassFromCalendar(classId: string, teamId?: string): Promise<CalendarSyncResult> {
  return observedRemoveClassFromCalendar(classId, teamId);
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
    'Sa': 6,  // Saturday
    'Su': 0,  // Sunday ('in' check below — 0 is falsy)
  };

  // Check short codes first
  if (day in shortCodes) {
    return shortCodes[day] ?? 1;
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
