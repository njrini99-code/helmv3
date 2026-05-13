'use server';

/**
 * Server Actions for Attendance Tracking
 *
 * Handles:
 * - Check-in (manual, QR code, self-service)
 * - No-show marking
 * - Attendance reports
 */

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { logServerError } from '@/lib/server-error-logger';

// ============================================================================
// TYPES
// ============================================================================

export type CheckInMethod = 'manual' | 'qr_code' | 'self';

// golf_event_attendance.status enum matches RSVP: accepted, declined, tentative, pending
type AttendanceStatus = 'accepted' | 'declined' | 'tentative' | 'pending';

interface ActionResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

interface AttendancePlayer {
  first_name: string | null;
  last_name: string | null;
  jersey_number: string | null;
}

interface AttendanceRecord {
  id: string;
  event_id: string;
  player_id: string;
  status: AttendanceStatus | null;
  rsvp_at: string | null;
  checked_in: boolean | null;
  checked_in_at: string | null;
  notes: string | null;
  player: AttendancePlayer | null;
}

interface AttendanceReport {
  attendance: AttendanceRecord[] | null;
}

// ============================================================================
// CHECK IN PLAYER
// ============================================================================

/**
 * Check in a player for an event. Live golf_event_attendance has dedicated
 * checked_in (bool) and checked_in_at (timestamptz) columns; we set both and
 * also flip status to 'accepted' so RSVP filters surface checked-in players.
 */
export async function checkInPlayer(
  eventId: string,
  playerId: string,
  _method: CheckInMethod = 'manual'
): Promise<ActionResult> {
  try {
    const supabase = await createClient();

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return { success: false, error: 'Not authenticated' };
    }

    const { data: event } = await supabase
      .from('golf_events')
      .select('id, start_time')
      .eq('id', eventId)
      .maybeSingle();

    if (!event) {
      return { success: false, error: 'Event not found' };
    }

    const now = new Date().toISOString();
    const { error: upsertError } = await supabase
      .from('golf_event_attendance')
      .upsert(
        {
          event_id: eventId,
          player_id: playerId,
          status: 'accepted' as AttendanceStatus,
          rsvp_at: now,
          checked_in: true,
          checked_in_at: now,
        },
        { onConflict: 'event_id,player_id' }
      );

    if (upsertError) {
      return { success: false, error: upsertError.message };
    }

    revalidatePath('/golf/dashboard/calendar');
    return { success: true };
  } catch (err) {
    await logServerError(`checkInPlayer failed: ${err instanceof Error ? err.message : String(err)}`, {
      action: 'checkInPlayer',
      featureArea: 'attendance',
      playerId,
      extra: { eventId },
    });
    return {
      success: false,
      error: 'Failed to check in player. Please try again.',
    };
  }
}

// ============================================================================
// BULK CHECK-IN (for coaches)
// ============================================================================

export async function bulkCheckIn(
  eventId: string,
  playerIds: string[]
): Promise<ActionResult<{ successCount: number; failureCount: number }>> {
  try {
    const supabase = await createClient();

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return { success: false, error: 'Not authenticated' };
    }

    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!coach) {
      return { success: false, error: 'Coach not found' };
    }

    // OPTIMIZED: Batch upsert instead of sequential individual check-ins.
    // Live cols: event_id, player_id, status, rsvp_at, checked_in, checked_in_at.
    const now = new Date().toISOString();

    const upsertRecords = playerIds.map((playerId) => ({
      event_id: eventId,
      player_id: playerId,
      status: 'accepted' as AttendanceStatus,
      rsvp_at: now,
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
      return {
        success: false,
        error: `Bulk check-in failed: ${upsertError.message}`,
      };
    }

    const successCount = upsertedData?.length || playerIds.length;
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
// MARK NO-SHOW
// ============================================================================

export async function markNoShow(
  eventId: string,
  playerId: string
): Promise<ActionResult> {
  try {
    const supabase = await createClient();

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return { success: false, error: 'Not authenticated' };
    }

    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!coach) {
      return { success: false, error: 'Coach not found' };
    }

    // Mark as declined (no-show). Live table has no updated_at column.
    const { error: updateError } = await supabase
      .from('golf_event_attendance')
      .update({
        status: 'declined' as AttendanceStatus,
        rsvp_at: new Date().toISOString(),
        checked_in: false,
      })
      .eq('event_id', eventId)
      .eq('player_id', playerId);

    if (updateError) {
      return { success: false, error: updateError.message };
    }

    revalidatePath('/golf/dashboard/calendar');
    return { success: true };
  } catch (err) {
    await logServerError(`markNoShow failed: ${err instanceof Error ? err.message : String(err)}`, {
      action: 'markNoShow',
      featureArea: 'attendance',
      playerId,
      extra: { eventId },
    });
    return {
      success: false,
      error: 'Failed to mark no-show. Please try again.',
    };
  }
}

// ============================================================================
// GET ATTENDANCE REPORT
// ============================================================================

export async function getAttendanceReport(
  eventId: string
): Promise<ActionResult<AttendanceReport>> {
  try {
    const supabase = await createClient();

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return { success: false, error: 'Not authenticated' };
    }

    // No golf_attendance_summary view exists; aggregate in-app from raw rows.
    const { data: attendance } = await supabase
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
      .order('player_id');

    return {
      success: true,
      data: {
        attendance: attendance as unknown as AttendanceRecord[] | null,
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
// GET PLAYER ATTENDANCE STATS
// ============================================================================

/**
 * Get attendance statistics for a player.
 *
 * Aggregates golf_event_attendance by (player_id, status).
 * Migration 20260513100000_golf_player_attendance_stats_view.sql creates a view
 * for this — once applied, consider refactoring to query the view directly.
 * Until then, in-memory aggregation from golf_event_attendance is correct.
 */
export async function getPlayerAttendanceStats(
  playerId?: string
): Promise<ActionResult<{ player_id: string; status: string; count: number }[]>> {
  try {
    const supabase = await createClient();

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return { success: false, error: 'Not authenticated' };
    }

    // Query attendance records directly since the stats view doesn't exist
    let query = supabase
      .from('golf_event_attendance')
      .select('player_id, status');

    if (playerId) {
      query = query.eq('player_id', playerId);
    }

    const { data, error } = await query;

    if (error) {
      await logServerError(`getPlayerAttendanceStats query failed: ${error.message}`, {
        action: 'getPlayerAttendanceStats',
        featureArea: 'attendance',
        playerId: playerId ?? null,
        extra: { errorCode: error.code },
      });
      return { success: false, error: 'Operation failed. Please try again.' };
    }

    // Aggregate stats in-memory since we don't have a DB view
    const statsMap = new Map<string, Map<string, number>>();
    for (const record of (data || [])) {
      const pid = record.player_id;
      const status = record.status || 'pending';
      if (!statsMap.has(pid)) statsMap.set(pid, new Map());
      const playerStats = statsMap.get(pid)!;
      playerStats.set(status, (playerStats.get(status) || 0) + 1);
    }

    const results: { player_id: string; status: string; count: number }[] = [];
    for (const [pid, statusCounts] of statsMap) {
      for (const [status, count] of statusCounts) {
        results.push({ player_id: pid, status, count });
      }
    }

    return { success: true, data: results };
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

