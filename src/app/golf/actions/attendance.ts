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

// ============================================================================
// TYPES
// ============================================================================

export type CheckInMethod = 'manual' | 'qr_code' | 'self';

// golf_event_attendance.status enum: attending, not_attending, maybe, pending, excused, unexcused
type AttendanceStatus = 'attending' | 'not_attending' | 'maybe' | 'pending' | 'excused' | 'unexcused';

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
  absence_reason: string | null;
  responded_at: string | null;
  reminder_sent: boolean | null;
  player: AttendancePlayer | null;
}

interface AttendanceReport {
  attendance: AttendanceRecord[] | null;
}

// ============================================================================
// CHECK IN PLAYER
// ============================================================================

/**
 * Check in a player for an event.
 *
 * golf_event_attendance schema only has: id, event_id, player_id, status
 * (attending/not_attending/maybe/pending/excused/unexcused), absence_reason,
 * responded_at, reminder_sent, created_at, updated_at.
 *
 * There are no checked_in, checked_in_at, checked_in_by, check_in_method columns.
 * Check-in is represented by setting status to 'attending'.
 *
 * TODO: If full check-in tracking is needed (timestamps, method, who checked in),
 * a migration should add these columns to golf_event_attendance.
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

    // Verify event exists
    const { data: event } = await supabase
      .from('golf_events')
      .select('id, start_date, start_time')
      .eq('id', eventId)
      .maybeSingle();

    if (!event) {
      return { success: false, error: 'Event not found' };
    }

    // Upsert attendance record - set status to 'attending'
    // UNIQUE(event_id, player_id) allows upsert
    const { error: upsertError } = await supabase
      .from('golf_event_attendance')
      .upsert(
        {
          event_id: eventId,
          player_id: playerId,
          status: 'attending' as AttendanceStatus,
          responded_at: new Date().toISOString(),
        },
        { onConflict: 'event_id,player_id' }
      );

    if (upsertError) {
      return { success: false, error: upsertError.message };
    }

    revalidatePath('/golf/dashboard/calendar');
    return { success: true };
  } catch (err) {
    console.error('[GolfHelm] Failed to check in player:', err);
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

    // OPTIMIZED: Batch upsert instead of sequential individual check-ins
    // golf_event_attendance columns: event_id, player_id, status, absence_reason, responded_at
    const now = new Date().toISOString();

    const upsertRecords = playerIds.map((playerId) => ({
      event_id: eventId,
      player_id: playerId,
      status: 'attending' as AttendanceStatus,
      responded_at: now,
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
    console.error('[GolfHelm] Failed to bulk check-in:', err);
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

    // Update attendance record - mark as unexcused absence (no-show)
    // golf_event_attendance.status enum: attending, not_attending, maybe, pending, excused, unexcused
    // 'unexcused' is the closest match for a no-show
    const { error: updateError } = await supabase
      .from('golf_event_attendance')
      .update({
        status: 'unexcused' as AttendanceStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('event_id', eventId)
      .eq('player_id', playerId);

    if (updateError) {
      return { success: false, error: updateError.message };
    }

    revalidatePath('/golf/dashboard/calendar');
    return { success: true };
  } catch (err) {
    console.error('[GolfHelm] Failed to mark no-show:', err);
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

    // TODO: golf_attendance_summary table/view does not exist yet.
    // A migration is needed if summary aggregation is desired.
    // For now, we only return the detailed attendance records.

    // Get detailed attendance records
    const { data: attendance } = await supabase
      .from('golf_event_attendance')
      .select(`
        *,
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
    console.error('[GolfHelm] Failed to get attendance report:', err);
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
 * TODO: golf_player_attendance_stats view does not exist yet.
 * A migration is needed to create this view/materialized view.
 * For now, we compute basic stats from golf_event_attendance directly.
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
      console.error('[Attendance Error]', error);
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
    console.error('[GolfHelm] Failed to get attendance stats:', err);
    return {
      success: false,
      error: 'Failed to get attendance stats. Please try again.',
    };
  }
}

// ============================================================================
// VERIFY QR CODE CHECK-IN
// ============================================================================

/**
 * Verify a QR code for check-in.
 *
 * TODO: golf_events does not have a metadata column for QR tokens.
 * A migration is needed to add QR code support (e.g., a qr_token column
 * or a separate golf_event_checkin_settings table).
 * For now, this function is a stub that always returns an error.
 */
export async function verifyQRCodeCheckIn(
  _qrToken: string
): Promise<ActionResult<{ eventId: string; eventTitle: string }>> {
  // QR code check-in requires a metadata/qr_token column on golf_events
  // which does not exist in the current schema.
  return {
    success: false,
    error: 'QR code check-in is not yet supported. A database migration is required.',
  };
}
