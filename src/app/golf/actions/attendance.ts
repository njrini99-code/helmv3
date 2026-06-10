'use server';

/**
 * Server Actions for Attendance Tracking
 *
 * Handles:
 * - Marking attendance (present / late / no-show / clear)
 * - Check-in (manual, QR code, self-service)
 * - Bulk check-in ("mark all present")
 * - Attendance reports + weighted attendance stats
 *
 * Audit finding #21 fixes baked in:
 * - Attendance writes NEVER touch the `status` / `rsvp_at` columns — those
 *   belong to the RSVP flow. Check-in state lives exclusively in the
 *   dedicated `checked_in` / `checked_in_at` columns.
 * - Every mutating action (and the report reads) authorizes the caller
 *   against the event's team, following the sendEventReminderToPlayers
 *   authz chain in golf.ts (user → event.team_id → coach → staff row).
 * - Fetches that can exceed PostgREST's 1000-row server cap paginate via
 *   fetchAllRowsResult.
 * - Attendance percentages are weighted (sum of attended / sum of recorded),
 *   never a mean of per-player percentages.
 *
 * Audit finding #30: attendance `notes` are scoped to the team's coaches
 * plus the player the note is about — getAttendanceReport strips other
 * players' notes for player callers (defense in depth on top of RLS).
 */

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { logServerError } from '@/lib/server-error-logger';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';

// ============================================================================
// TYPES
// ============================================================================

export type CheckInMethod = 'manual' | 'qr_code' | 'self';

/**
 * RSVP responses live in golf_event_attendance.status (CHECK constraint:
 * pending / accepted / declined / tentative + legacy attending /
 * not_attending / maybe / excused / unexcused). Attendance actions never
 * write this column.
 */
export type RsvpStatus =
  | 'pending'
  | 'accepted'
  | 'declined'
  | 'tentative'
  | 'attending'
  | 'not_attending'
  | 'maybe'
  | 'excused'
  | 'unexcused';

/**
 * How attendance marks persist into golf_event_attendance:
 *
 *   present → checked_in=true,  checked_in_at=<now>
 *   late    → checked_in=true,  checked_in_at=<now>   (see MIGRATION NOTE)
 *   no_show → checked_in=false, checked_in_at=<now>
 *   clear   → checked_in=false, checked_in_at=null    (back to unmarked)
 *
 * `checked_in_at` doubles as "attendance recorded at": an explicit no-show
 * (checked_in=false + checked_in_at set) is distinguishable from a row that
 * was never marked (checked_in_at IS NULL — checked_in defaults to false).
 *
 * MIGRATION NOTE: golf_event_attendance has no column that can hold a
 * first-class "late" state — `status` is the RSVP column (clobbering it was
 * the audit-#21 bug) and the table has no jsonb/metadata column. Until a
 * migration adds e.g.
 *   ALTER TABLE golf_event_attendance ADD COLUMN attendance_status text
 *     CHECK (attendance_status IN ('present','late','no_show'));
 * a 'late' mark persists identically to 'present' (a late player IS
 * present), and the late distinction survives only within the live panel
 * session. Do NOT encode late into `notes` — that column is human-facing
 * and its visibility is being tightened (finding #30).
 */
export type AttendanceMark = 'present' | 'late' | 'no_show';

/** Attendance state derivable from the persisted columns. */
export type PersistedAttendance = 'present' | 'no_show' | null;

interface ActionResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface AttendancePlayer {
  first_name: string | null;
  last_name: string | null;
  jersey_number: number | null;
}

export interface AttendanceRecord {
  id: string;
  event_id: string;
  player_id: string;
  status: RsvpStatus | null;
  rsvp_at: string | null;
  checked_in: boolean | null;
  checked_in_at: string | null;
  notes: string | null;
  player: AttendancePlayer | null;
}

export interface AttendanceReport {
  attendance: AttendanceRecord[];
  /** ISO start time of the event (for late-derivation / display). */
  eventStartTime: string | null;
  /** True when the caller is a coach on this event's team. */
  viewerIsCoach: boolean;
  /** The caller's golf_players.id when the caller is a player, else null. */
  viewerPlayerId: string | null;
}

export interface PlayerAttendanceStats {
  player_id: string;
  /** Total attendance rows (event invites) seen for this player. */
  invited: number;
  /** Events where the player was checked in (present or late). */
  attended: number;
  /** Events explicitly marked no-show. */
  no_shows: number;
  /** Invites with no attendance recorded yet. */
  unmarked: number;
  /** attended / (attended + no_shows), 0-100; null when nothing recorded. */
  attendance_pct: number | null;
}

export interface AttendanceStatsSummary {
  players: PlayerAttendanceStats[];
  /**
   * Weighted overall percentage: sum(attended) / sum(recorded) across all
   * players — NOT the mean of per-player percentages (a player with one
   * recorded event must not weigh the same as a player with twenty).
   */
  overall: PlayerAttendanceStats;
}

type SupabaseServer = Awaited<ReturnType<typeof createClient>>;

// ============================================================================
// AUTHZ HELPERS (house gold standard: golf.ts sendEventReminderToPlayers)
// ============================================================================

interface EventAuthzOk {
  ok: true;
  event: { id: string; team_id: string; start_time: string | null };
}

interface EventAuthzFail {
  ok: false;
  error: string;
}

const NOT_A_COACH_ERROR = "Only this team's coaches can record attendance";

/**
 * Verify the caller coaches the event's team: load event → coach row for the
 * user → staff row binding that coach to event.team_id. Returns the event so
 * callers don't re-fetch it.
 */
async function authorizeCoachForEvent(
  supabase: SupabaseServer,
  userId: string,
  eventId: string,
): Promise<EventAuthzOk | EventAuthzFail> {
  const { data: event } = await supabase
    .from('golf_events')
    .select('id, team_id, start_time')
    .eq('id', eventId)
    .maybeSingle();
  if (!event) {
    return { ok: false, error: 'Event not found' };
  }

  const { data: coach } = await supabase
    .from('golf_coaches')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();
  if (!coach) {
    return { ok: false, error: NOT_A_COACH_ERROR };
  }

  const { data: staffRow } = await supabase
    .from('golf_team_coach_staff')
    .select('id')
    .eq('team_id', event.team_id)
    .eq('coach_id', coach.id)
    .maybeSingle();
  if (!staffRow) {
    return { ok: false, error: NOT_A_COACH_ERROR };
  }

  return { ok: true, event };
}

/** Map a mark to the persisted check-in fields. Never includes status/rsvp_at. */
function attendanceFieldsFor(mark: AttendanceMark | 'clear'): {
  checked_in: boolean;
  checked_in_at: string | null;
} {
  if (mark === 'clear') {
    return { checked_in: false, checked_in_at: null };
  }
  const now = new Date().toISOString();
  if (mark === 'no_show') {
    return { checked_in: false, checked_in_at: now };
  }
  // present + late (late needs a migration for first-class storage — see
  // the MIGRATION NOTE on AttendanceMark above).
  return { checked_in: true, checked_in_at: now };
}

const VALID_MARKS: ReadonlySet<string> = new Set([
  'present',
  'late',
  'no_show',
  'clear',
]);

// ============================================================================
// MARK ATTENDANCE (core single-player mutation)
// ============================================================================

/**
 * Record a player's attendance for an event WITHOUT touching their RSVP.
 * Coach-only. `clear` reverts the player to unmarked.
 */
export async function markAttendance(
  eventId: string,
  playerId: string,
  mark: AttendanceMark | 'clear',
): Promise<ActionResult> {
  if (!eventId || !playerId) {
    return { success: false, error: 'Event and player are required' };
  }
  if (!VALID_MARKS.has(mark)) {
    return { success: false, error: 'Invalid attendance mark' };
  }

  try {
    const supabase = await createClient();

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return { success: false, error: 'Not authenticated' };
    }

    const authz = await authorizeCoachForEvent(supabase, user.id, eventId);
    if (!authz.ok) {
      return { success: false, error: authz.error };
    }

    // Restrict the target to players who actually belong to this event's
    // team — mirrors the recipient restriction in sendEventReminderToPlayers.
    const { data: member } = await supabase
      .from('golf_team_members')
      .select('id')
      .eq('team_id', authz.event.team_id)
      .eq('player_id', playerId)
      .eq('status', 'active')
      .maybeSingle();
    if (!member) {
      return { success: false, error: 'Player is not an active member of this team' };
    }

    // Upsert ONLY the check-in columns. status / rsvp_at are deliberately
    // absent from the payload so an existing RSVP response is never
    // overwritten (audit finding #21).
    const { error: upsertError } = await supabase
      .from('golf_event_attendance')
      .upsert(
        {
          event_id: eventId,
          player_id: playerId,
          ...attendanceFieldsFor(mark),
        },
        { onConflict: 'event_id,player_id' },
      );

    if (upsertError) {
      await logServerError(`markAttendance upsert failed: ${upsertError.message}`, {
        action: 'markAttendance',
        featureArea: 'attendance',
        playerId,
        extra: { eventId, mark },
      });
      return { success: false, error: 'Failed to save attendance. Please try again.' };
    }

    revalidatePath('/golf/dashboard/calendar');
    return { success: true };
  } catch (err) {
    await logServerError(`markAttendance failed: ${err instanceof Error ? err.message : String(err)}`, {
      action: 'markAttendance',
      featureArea: 'attendance',
      playerId,
      extra: { eventId, mark },
    });
    return {
      success: false,
      error: 'Failed to save attendance. Please try again.',
    };
  }
}

// ============================================================================
// CHECK IN PLAYER (kept API — delegates to markAttendance)
// ============================================================================

/**
 * Check in a player for an event. Records check-in state only; the player's
 * RSVP response is preserved.
 */
export async function checkInPlayer(
  eventId: string,
  playerId: string,
  _method: CheckInMethod = 'manual',
): Promise<ActionResult> {
  return markAttendance(eventId, playerId, 'present');
}

// ============================================================================
// MARK NO-SHOW (kept API — delegates to markAttendance)
// ============================================================================

export async function markNoShow(
  eventId: string,
  playerId: string,
): Promise<ActionResult> {
  return markAttendance(eventId, playerId, 'no_show');
}

// ============================================================================
// BULK CHECK-IN (coach "mark all present")
// ============================================================================

export async function bulkCheckIn(
  eventId: string,
  playerIds: string[],
): Promise<ActionResult<{ successCount: number; failureCount: number }>> {
  if (!eventId || playerIds.length === 0) {
    return { success: false, error: 'Event id and at least one player required' };
  }

  try {
    const supabase = await createClient();

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return { success: false, error: 'Not authenticated' };
    }

    const authz = await authorizeCoachForEvent(supabase, user.id, eventId);
    if (!authz.ok) {
      return { success: false, error: authz.error };
    }

    // Restrict the target set to active members of this event's team so a
    // coach of team A can't write attendance rows against team B's players.
    const { data: teamPlayers } = await supabase
      .from('golf_team_members')
      .select('player_id')
      .eq('team_id', authz.event.team_id)
      .eq('status', 'active')
      .in('player_id', playerIds);
    const allowedPlayerIds = (teamPlayers ?? [])
      .map((m) => m.player_id)
      .filter((id): id is string => Boolean(id));
    if (allowedPlayerIds.length === 0) {
      return { success: true, data: { successCount: 0, failureCount: playerIds.length } };
    }

    // Batch upsert of check-in columns ONLY — status / rsvp_at untouched.
    const now = new Date().toISOString();
    const upsertRecords = allowedPlayerIds.map((playerId) => ({
      event_id: eventId,
      player_id: playerId,
      checked_in: true,
      checked_in_at: now,
    }));

    const { error: upsertError, data: upsertedData } = await supabase
      .from('golf_event_attendance')
      .upsert(upsertRecords, {
        onConflict: 'event_id,player_id',
        ignoreDuplicates: false,
      })
      .select('id');

    if (upsertError) {
      await logServerError(`bulkCheckIn upsert failed: ${upsertError.message}`, {
        action: 'bulkCheckIn',
        featureArea: 'attendance',
        extra: { eventId, playerCount: playerIds.length },
      });
      return { success: false, error: 'Bulk check-in failed. Please try again.' };
    }

    const successCount = upsertedData?.length ?? allowedPlayerIds.length;
    const failureCount = playerIds.length - successCount;

    revalidatePath('/golf/dashboard/calendar');
    return {
      success: true,
      data: { successCount, failureCount },
    };
  } catch (err) {
    await logServerError(`bulkCheckIn failed: ${err instanceof Error ? err.message : String(err)}`, {
      action: 'bulkCheckIn',
      featureArea: 'attendance',
      extra: { eventId, playerCount: playerIds.length },
    });
    return {
      success: false,
      error: 'Failed to bulk check-in. Please try again.',
    };
  }
}

// ============================================================================
// GET ATTENDANCE REPORT
// ============================================================================

/**
 * Attendance roster for one event. Readable by the event team's coaches and
 * its active players. Player callers get other players' `notes` stripped
 * (finding #30 — notes are scoped to coaches + the player themself).
 */
export async function getAttendanceReport(
  eventId: string,
): Promise<ActionResult<AttendanceReport>> {
  if (!eventId) {
    return { success: false, error: 'Event id is required' };
  }

  try {
    const supabase = await createClient();

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return { success: false, error: 'Not authenticated' };
    }

    const { data: event } = await supabase
      .from('golf_events')
      .select('id, team_id, start_time')
      .eq('id', eventId)
      .maybeSingle();
    if (!event) {
      return { success: false, error: 'Event not found' };
    }

    // Resolve the viewer: coach on this team, or active player member.
    let viewerIsCoach = false;
    let viewerPlayerId: string | null = null;

    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (coach) {
      const { data: staffRow } = await supabase
        .from('golf_team_coach_staff')
        .select('id')
        .eq('team_id', event.team_id)
        .eq('coach_id', coach.id)
        .maybeSingle();
      viewerIsCoach = Boolean(staffRow);
    }

    if (!viewerIsCoach) {
      const { data: player } = await supabase
        .from('golf_players')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (player) {
        const { data: membership } = await supabase
          .from('golf_team_members')
          .select('id')
          .eq('team_id', event.team_id)
          .eq('player_id', player.id)
          .eq('status', 'active')
          .maybeSingle();
        if (membership) {
          viewerPlayerId = player.id;
        }
      }
    }

    if (!viewerIsCoach && !viewerPlayerId) {
      return { success: false, error: "You don't have access to this event's attendance" };
    }

    // Paginated fetch — an event roster should never hit the 1000-row
    // PostgREST cap, but the cap silently truncates when it does, so all
    // attendance reads page defensively (audit finding #21).
    const { data: rows, error: fetchError } = await fetchAllRowsResult<AttendanceRecord>(
      (from, to) =>
        supabase
          .from('golf_event_attendance')
          .select(`
            id,
            event_id,
            player_id,
            status,
            rsvp_at,
            checked_in,
            checked_in_at,
            notes,
            player:player_id (
              first_name,
              last_name,
              jersey_number
            )
          `)
          .eq('event_id', eventId)
          .order('id', { ascending: true })
          .range(from, to) as unknown as PromiseLike<{
            data: AttendanceRecord[] | null;
            error: { message: string } | null;
          }>,
    );

    if (fetchError) {
      await logServerError(`getAttendanceReport query failed: ${fetchError.message}`, {
        action: 'getAttendanceReport',
        featureArea: 'attendance',
        extra: { eventId },
      });
      return { success: false, error: 'Failed to get attendance report. Please try again.' };
    }

    // Scope notes: coaches see all; a player sees only their own note.
    const scoped = (rows ?? []).map((row) =>
      viewerIsCoach || row.player_id === viewerPlayerId
        ? row
        : { ...row, notes: null },
    );

    // Stable display order by name (pagination above already ordered by id
    // for correctness; this is a presentation sort).
    scoped.sort((a, b) => {
      const an = `${a.player?.last_name ?? ''} ${a.player?.first_name ?? ''}`.trim().toLowerCase();
      const bn = `${b.player?.last_name ?? ''} ${b.player?.first_name ?? ''}`.trim().toLowerCase();
      return an.localeCompare(bn);
    });

    return {
      success: true,
      data: {
        attendance: scoped,
        eventStartTime: event.start_time ?? null,
        viewerIsCoach,
        viewerPlayerId,
      },
    };
  } catch (err) {
    await logServerError(`getAttendanceReport failed: ${err instanceof Error ? err.message : String(err)}`, {
      action: 'getAttendanceReport',
      featureArea: 'attendance',
      extra: { eventId },
    });
    return {
      success: false,
      error: 'Failed to get attendance report. Please try again.',
    };
  }
}

// ============================================================================
// GET PLAYER ATTENDANCE STATS (weighted)
// ============================================================================

interface StatsRow {
  player_id: string;
  checked_in: boolean | null;
  checked_in_at: string | null;
}

function emptyStats(playerId: string): PlayerAttendanceStats {
  return {
    player_id: playerId,
    invited: 0,
    attended: 0,
    no_shows: 0,
    unmarked: 0,
    attendance_pct: null,
  };
}

function finalizePct(stats: PlayerAttendanceStats): PlayerAttendanceStats {
  const recorded = stats.attended + stats.no_shows;
  return {
    ...stats,
    attendance_pct: recorded > 0 ? Math.round((stats.attended / recorded) * 1000) / 10 : null,
  };
}

/**
 * Attendance statistics, scoped to what the caller may see:
 * - A coach gets stats for active players on teams they staff (optionally
 *   narrowed to one of those players via `playerId`).
 * - A player gets their own stats only.
 *
 * The overall percentage is weighted sum/sum across players, and the fetch
 * paginates past the PostgREST 1000-row cap.
 */
export async function getPlayerAttendanceStats(
  playerId?: string,
): Promise<ActionResult<AttendanceStatsSummary>> {
  try {
    const supabase = await createClient();

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return { success: false, error: 'Not authenticated' };
    }

    // Resolve the set of player ids the caller is allowed to read.
    let allowedPlayerIds: string[] = [];

    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (coach) {
      const { data: staffRows } = await supabase
        .from('golf_team_coach_staff')
        .select('team_id')
        .eq('coach_id', coach.id);
      const teamIds = (staffRows ?? [])
        .map((r) => r.team_id)
        .filter((id): id is string => Boolean(id));
      if (teamIds.length > 0) {
        const { data: members, error: membersError } = await fetchAllRowsResult<{ player_id: string | null }>(
          (from, to) =>
            supabase
              .from('golf_team_members')
              .select('player_id')
              .in('team_id', teamIds)
              .eq('status', 'active')
              .order('id', { ascending: true })
              .range(from, to),
        );
        if (membersError) {
          return { success: false, error: 'Failed to get attendance stats. Please try again.' };
        }
        allowedPlayerIds = (members ?? [])
          .map((m) => m.player_id)
          .filter((id): id is string => Boolean(id));
      }
    } else {
      const { data: player } = await supabase
        .from('golf_players')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (player) {
        allowedPlayerIds = [player.id];
      }
    }

    if (allowedPlayerIds.length === 0) {
      return { success: false, error: 'Not authorized to view attendance stats' };
    }

    let targetPlayerIds = allowedPlayerIds;
    if (playerId) {
      if (!allowedPlayerIds.includes(playerId)) {
        return { success: false, error: 'Not authorized to view attendance stats for this player' };
      }
      targetPlayerIds = [playerId];
    }

    // Paginated — a season of attendance rows across a roster easily exceeds
    // the 1000-row PostgREST cap, which silently truncates (finding #21).
    const { data: rows, error: fetchError } = await fetchAllRowsResult<StatsRow>(
      (from, to) =>
        supabase
          .from('golf_event_attendance')
          .select('player_id, checked_in, checked_in_at')
          .in('player_id', targetPlayerIds)
          .order('id', { ascending: true })
          .range(from, to),
    );

    if (fetchError) {
      await logServerError(`getPlayerAttendanceStats query failed: ${fetchError.message}`, {
        action: 'getPlayerAttendanceStats',
        featureArea: 'attendance',
        playerId: playerId ?? null,
      });
      return { success: false, error: 'Failed to get attendance stats. Please try again.' };
    }

    const perPlayer = new Map<string, PlayerAttendanceStats>();
    const overall = emptyStats('all');

    for (const row of rows ?? []) {
      const stats = perPlayer.get(row.player_id) ?? emptyStats(row.player_id);
      stats.invited += 1;
      overall.invited += 1;
      if (row.checked_in === true) {
        stats.attended += 1;
        overall.attended += 1;
      } else if (row.checked_in_at !== null) {
        // Explicit no-show: not checked in, but attendance WAS recorded.
        stats.no_shows += 1;
        overall.no_shows += 1;
      } else {
        stats.unmarked += 1;
        overall.unmarked += 1;
      }
      perPlayer.set(row.player_id, stats);
    }

    return {
      success: true,
      data: {
        players: Array.from(perPlayer.values()).map(finalizePct),
        // Weighted: sum(attended)/sum(recorded) — computed from the summed
        // counters, never averaged from per-player percentages.
        overall: finalizePct(overall),
      },
    };
  } catch (err) {
    await logServerError(`getPlayerAttendanceStats failed: ${err instanceof Error ? err.message : String(err)}`, {
      action: 'getPlayerAttendanceStats',
      featureArea: 'attendance',
      playerId: playerId ?? null,
    });
    return {
      success: false,
      error: 'Failed to get attendance stats. Please try again.',
    };
  }
}
