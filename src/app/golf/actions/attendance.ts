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
 *   belong to the RSVP flow. The attendance mark lives in the dedicated
 *   `attendance_status` column (dual-axis with `status`; migration
 *   20260610080000), with `checked_in` / `checked_in_at` as the
 *   timestamped check-in record.
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
import type { Database } from '@/lib/types/database';
import { withAdminObserved } from '@/lib/admin/observed-action';
import { describeError } from '@/lib/utils/describe-error';

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
 * How attendance marks persist into golf_event_attendance (dual-axis with
 * `status`, the RSVP column — attendance writes never touch it):
 *
 *   present → attendance_status='present', checked_in=true,  checked_in_at=<now>
 *   late    → attendance_status='late',    checked_in=true,  checked_in_at=<now>
 *   no_show → attendance_status='no_show', checked_in=false, checked_in_at=<now>
 *   clear   → attendance_status=null,      checked_in=false, checked_in_at=null
 *
 * `attendance_status` (migration 20260610080000) is the first-class mark;
 * NULL = not yet marked. `checked_in` / `checked_in_at` remain the
 * timestamped check-in record (a late player IS checked in). Rows written
 * before the migration were backfilled (checked_in → 'present', explicit
 * checked_in_at-stamped non-check-ins → 'no_show'); readers still honor
 * that legacy convention defensively via persistedMark().
 */
export type AttendanceMark = 'present' | 'late' | 'no_show';

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
  /** First-class coach-recorded mark; null = not yet marked. */
  attendance_status: AttendanceMark | null;
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
  /** Events attended — present or late (late counts as attended). */
  attended: number;
  /** Events marked late (subset of `attended`, exposed separately). */
  late: number;
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
  // Shared authz resolver for every attendance call site, so all three of these
  // reads decide what a coach is told. Denying on a failed read is right and is
  // kept — an authorization check that could not run must never grant access.
  //
  // What was wrong is what it then SAID. A discarded error meant a failed event
  // read reported "Event not found" for an event the coach is looking at, and a
  // failed coach or staff read reported NOT_A_COACH_ERROR — telling a coach they
  // are not a coach. golf_events is the busiest table in the product (1,172
  // rows), so this resolver is on a well-travelled path.
  const UNREADABLE = "Couldn't verify your access to this event. Please try again.";

  const { data: event, error: eventError } = await supabase
    .from('golf_events')
    .select('id, team_id, start_time')
    .eq('id', eventId)
    .maybeSingle();
  if (eventError) {
    await logServerError(
      `[attendance] event read failed — denying, but this is an outage not a missing event: ${describeError(eventError)}`,
      { action: 'attendance.authorizeCoachForEvent', featureArea: 'calendar' },
    );
    return { ok: false, error: UNREADABLE };
  }
  if (!event) {
    return { ok: false, error: 'Event not found' };
  }

  const { data: coach, error: coachError } = await supabase
    .from('golf_coaches')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();
  if (coachError) {
    await logServerError(
      `[attendance] coach read failed — denying, but this is an outage not a permissions problem: ${describeError(coachError)}`,
      { action: 'attendance.authorizeCoachForEvent', featureArea: 'calendar' },
    );
    return { ok: false, error: UNREADABLE };
  }
  if (!coach) {
    return { ok: false, error: NOT_A_COACH_ERROR };
  }

  const { data: staffRow, error: staffError } = await supabase
    .from('golf_team_coach_staff')
    .select('id')
    .eq('team_id', event.team_id)
    .eq('coach_id', coach.id)
    .maybeSingle();
  if (staffError) {
    await logServerError(
      `[attendance] staff read failed — denying, but this is an outage not a permissions problem: ${describeError(staffError)}`,
      { action: 'attendance.authorizeCoachForEvent', featureArea: 'calendar' },
    );
    return { ok: false, error: UNREADABLE };
  }
  if (!staffRow) {
    return { ok: false, error: NOT_A_COACH_ERROR };
  }

  return { ok: true, event };
}

type GolfEventAttendanceInsert =
  Database['public']['Tables']['golf_event_attendance']['Insert'];

/**
 * golf_event_attendance write payload. The generated Database types may not
 * include `attendance_status` yet (column added by migration 20260610080000;
 * typegen regen is handled separately) — type it locally and cast to the
 * generated Insert type at the .upsert() boundary (supabase-js rejects
 * statically-unknown columns via RejectExcessProperties). No `any`.
 */
type AttendanceUpsertRow = GolfEventAttendanceInsert & {
  attendance_status: AttendanceMark | null;
};

/**
 * Map a mark to the persisted attendance fields. Never includes
 * status/rsvp_at — those are the RSVP axis.
 */
function attendanceFieldsFor(mark: AttendanceMark | 'clear'): {
  attendance_status: AttendanceMark | null;
  checked_in: boolean;
  checked_in_at: string | null;
} {
  if (mark === 'clear') {
    return { attendance_status: null, checked_in: false, checked_in_at: null };
  }
  const now = new Date().toISOString();
  if (mark === 'no_show') {
    return { attendance_status: 'no_show', checked_in: false, checked_in_at: now };
  }
  // present + late both count as checked in; the mark itself is first-class.
  return { attendance_status: mark, checked_in: true, checked_in_at: now };
}

/**
 * Derive the recorded mark from a persisted row: `attendance_status` is
 * authoritative; rows from before migration 20260610080000 (backfilled, but
 * stay defensive) fall back to the legacy checked_in/checked_in_at
 * convention, where checked_in=true meant present and an explicit
 * checked_in_at stamp without check-in meant no-show.
 */
function persistedMark(row: {
  attendance_status?: string | null;
  checked_in: boolean | null;
  checked_in_at: string | null;
}): AttendanceMark | null {
  if (
    row.attendance_status === 'present' ||
    row.attendance_status === 'late' ||
    row.attendance_status === 'no_show'
  ) {
    return row.attendance_status;
  }
  if (row.checked_in === true) return 'present';
  if (row.checked_in_at !== null) return 'no_show';
  return null;
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
async function markAttendanceImpl(
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

    // Upsert ONLY the attendance columns. status / rsvp_at are deliberately
    // absent from the payload so an existing RSVP response is never
    // overwritten (audit finding #21).
    const payload: AttendanceUpsertRow = {
      event_id: eventId,
      player_id: playerId,
      ...attendanceFieldsFor(mark),
    };
    const { error: upsertError } = await supabase
      .from('golf_event_attendance')
      .upsert(payload as GolfEventAttendanceInsert, { onConflict: 'event_id,player_id' });

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
    await logServerError(`markAttendance failed: ${describeError(err)}`, {
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

const observedMarkAttendance = withAdminObserved(
  'markAttendance',
  { demoSafe: true, sport: 'golf', feature: 'calendar_events' },
  markAttendanceImpl,
);

export async function markAttendance(
  eventId: string,
  playerId: string,
  mark: AttendanceMark | 'clear',
): Promise<ActionResult> {
  return observedMarkAttendance(eventId, playerId, mark);
}

// ============================================================================
// CHECK IN PLAYER (kept API — delegates to markAttendance)
// ============================================================================

/**
 * Check in a player for an event. Records check-in state only; the player's
 * RSVP response is preserved.
 */
async function checkInPlayerImpl(
  eventId: string,
  playerId: string,
  _method: CheckInMethod = 'manual',
): Promise<ActionResult> {
  return markAttendance(eventId, playerId, 'present');
}

const observedCheckInPlayer = withAdminObserved(
  'checkInPlayer',
  { demoSafe: true, sport: 'golf', feature: 'calendar_events' },
  checkInPlayerImpl,
);

export async function checkInPlayer(
  eventId: string,
  playerId: string,
  _method: CheckInMethod = 'manual',
): Promise<ActionResult> {
  return observedCheckInPlayer(eventId, playerId, _method);
}

// ============================================================================
// MARK NO-SHOW (kept API — delegates to markAttendance)
// ============================================================================

async function markNoShowImpl(
  eventId: string,
  playerId: string,
): Promise<ActionResult> {
  return markAttendance(eventId, playerId, 'no_show');
}

const observedMarkNoShow = withAdminObserved(
  'markNoShow',
  { demoSafe: true, sport: 'golf', feature: 'calendar_events' },
  markNoShowImpl,
);

export async function markNoShow(
  eventId: string,
  playerId: string,
): Promise<ActionResult> {
  return observedMarkNoShow(eventId, playerId);
}

// ============================================================================
// BULK CHECK-IN (coach "mark all present")
// ============================================================================

async function bulkCheckInImpl(
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
    const { data: teamPlayers, error: teamPlayersError } = await supabase
      .from('golf_team_members')
      .select('player_id')
      .eq('team_id', authz.event.team_id)
      .eq('status', 'active')
      .in('player_id', playerIds);

    // This read decides who may be written to, so an empty result correctly
    // denies everyone — that part is kept. What was wrong is what a FAILED
    // read then reported: `success: true` with every player counted as a
    // failure, which reads to the coach as "none of these players are on your
    // team" when the truth is that we could not check. A coach checking in the
    // squad before a match would see nobody check in, and no reason why.
    if (teamPlayersError) {
      await logServerError(
        `[bulkCheckIn] roster read failed — reported as though the players were not on the team: ${describeError(teamPlayersError)}`,
        { action: 'attendance.bulkCheckIn', featureArea: 'calendar' },
      );
      return { success: false, error: "Couldn't confirm your roster, so nobody was checked in. Please try again." };
    }

    const allowedPlayerIds = (teamPlayers ?? [])
      .map((m) => m.player_id)
      .filter((id): id is string => Boolean(id));
    if (allowedPlayerIds.length === 0) {
      return { success: true, data: { successCount: 0, failureCount: playerIds.length } };
    }

    // Batch upsert of attendance columns ONLY — status / rsvp_at untouched.
    const now = new Date().toISOString();
    const upsertRecords: AttendanceUpsertRow[] = allowedPlayerIds.map((playerId) => ({
      event_id: eventId,
      player_id: playerId,
      attendance_status: 'present',
      checked_in: true,
      checked_in_at: now,
    }));

    const { error: upsertError, data: upsertedData } = await supabase
      .from('golf_event_attendance')
      .upsert(upsertRecords as GolfEventAttendanceInsert[], {
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
    await logServerError(`bulkCheckIn failed: ${describeError(err)}`, {
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

const observedBulkCheckIn = withAdminObserved(
  'bulkCheckIn',
  { demoSafe: true, sport: 'golf', feature: 'calendar_events' },
  bulkCheckInImpl,
);

export async function bulkCheckIn(
  eventId: string,
  playerIds: string[],
): Promise<ActionResult<{ successCount: number; failureCount: number }>> {
  return observedBulkCheckIn(eventId, playerIds);
}

// ============================================================================
// GET ATTENDANCE REPORT
// ============================================================================

/**
 * Attendance roster for one event. Readable by the event team's coaches and
 * its active players. Player callers get other players' `notes` stripped
 * (finding #30 — notes are scoped to coaches + the player themself).
 */
async function getAttendanceReportImpl(
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
            attendance_status,
            checked_in,
            checked_in_at,
            notes,
            player:player_id (
              first_name,
              last_name
            )
          `)
          .eq('event_id', eventId)
          .order('id', { ascending: true })
          .range(from, to) as unknown as PromiseLike<{
            data: AttendanceRecord[] | null;
            error: { message: string } | null;
          }>,
      undefined,
      { table: 'golf_event_attendance', action: 'getAttendanceReport', feature: 'calendar_events', sport: 'golf' },
    );

    if (fetchError) {
      await logServerError(`getAttendanceReport query failed: ${fetchError.message}`, {
        action: 'getAttendanceReport',
        featureArea: 'attendance',
        extra: { eventId },
      });
      return { success: false, error: 'Failed to get attendance report. Please try again.' };
    }

    // Jersey numbers live on golf_team_members (per-team), NOT golf_players —
    // embedding jersey_number in the player join above made every report fail
    // with "column golf_players_1.jersey_number does not exist" (Sentry
    // JAVASCRIPT-NEXTJS-CQ). Hydrate them from the membership table instead.
    const jerseyByPlayer = new Map<string, number | null>();
    {
      const playerIds = Array.from(
        new Set((rows ?? []).map((r) => r.player_id).filter(Boolean)),
      );
      if (playerIds.length > 0) {
        const { data: members, error: membersError } = await supabase
          .from('golf_team_members')
          .select('player_id, jersey_number')
          .eq('team_id', event.team_id)
          .in('player_id', playerIds);
        // Cosmetic on its own — a failure just drops jersey numbers from the
        // panel — so it does not take the page down, but it should not vanish
        // without trace either.
        if (membersError) {
          await logServerError(
            `[attendance] jersey lookup failed — numbers will be missing from the panel: ${describeError(membersError)}`,
            { action: 'attendance.jerseyLookup', featureArea: 'calendar' },
          );
        }
        for (const m of members ?? []) {
          jerseyByPlayer.set(m.player_id as string, (m.jersey_number as number | null) ?? null);
        }
      }
    }

    // Scope notes (coaches see all; a player sees only their own note —
    // finding #30) and normalize the mark server-side: attendance_status is
    // authoritative, with persistedMark() covering legacy pre-migration rows
    // so the panel can trust the field without its own fallback logic.
    const scoped = (rows ?? []).map((row) => ({
      ...row,
      attendance_status: persistedMark(row),
      notes: viewerIsCoach || row.player_id === viewerPlayerId ? row.notes : null,
      player: row.player
        ? { ...row.player, jersey_number: jerseyByPlayer.get(row.player_id) ?? null }
        : row.player,
    }));

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
    await logServerError(`getAttendanceReport failed: ${describeError(err)}`, {
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

const observedGetAttendanceReport = withAdminObserved(
  'getAttendanceReport',
  { sport: 'golf', feature: 'calendar_events' },
  getAttendanceReportImpl,
);

export async function getAttendanceReport(
  eventId: string,
): Promise<ActionResult<AttendanceReport>> {
  return observedGetAttendanceReport(eventId);
}

// ============================================================================
// GET PLAYER ATTENDANCE STATS (weighted)
// ============================================================================

interface StatsRow {
  player_id: string;
  attendance_status: string | null;
  checked_in: boolean | null;
  checked_in_at: string | null;
}

function emptyStats(playerId: string): PlayerAttendanceStats {
  return {
    player_id: playerId,
    invited: 0,
    attended: 0,
    late: 0,
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
async function getPlayerAttendanceStatsImpl(
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
          undefined,
          { table: 'golf_team_members', action: 'getPlayerAttendanceStats', feature: 'calendar_events', sport: 'golf' },
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
    // Cast at the query boundary: the generated types may not include
    // attendance_status yet (migration 20260610080000; regen handled later).
    const { data: rows, error: fetchError } = await fetchAllRowsResult<StatsRow>(
      (from, to) =>
        supabase
          .from('golf_event_attendance')
          .select('player_id, attendance_status, checked_in, checked_in_at')
          .in('player_id', targetPlayerIds)
          .order('id', { ascending: true })
          .range(from, to) as unknown as PromiseLike<{
            data: StatsRow[] | null;
            error: { message: string } | null;
          }>,
      undefined,
      { table: 'golf_event_attendance', action: 'getPlayerAttendanceStats', feature: 'calendar_events', sport: 'golf' },
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
      const mark = persistedMark(row);
      if (mark === 'present' || mark === 'late') {
        // Late counts as attended for the percentage …
        stats.attended += 1;
        overall.attended += 1;
        if (mark === 'late') {
          // … but is exposed separately so coaches can see the pattern.
          stats.late += 1;
          overall.late += 1;
        }
      } else if (mark === 'no_show') {
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
    await logServerError(`getPlayerAttendanceStats failed: ${describeError(err)}`, {
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

const observedGetPlayerAttendanceStats = withAdminObserved(
  'getPlayerAttendanceStats',
  { sport: 'golf', feature: 'calendar_events' },
  getPlayerAttendanceStatsImpl,
);

export async function getPlayerAttendanceStats(
  playerId?: string,
): Promise<ActionResult<AttendanceStatsSummary>> {
  return observedGetPlayerAttendanceStats(playerId);
}
