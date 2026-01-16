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
  status: string | null;
  checked_in: boolean | null;
  checked_in_at: string | null;
  check_in_method: string | null;
  checked_in_by: string | null;
  player: AttendancePlayer | null;
}

interface AttendanceSummary {
  event_id: string | null;
  event_title: string | null;
  start_date: string | null;
  team_id: string | null;
  total_rsvps: number | null;
  rsvp_yes: number | null;
  checked_in_count: number | null;
  no_show_count: number | null;
  attendance_percentage: number | null;
}

interface AttendanceReport {
  summary: AttendanceSummary | null;
  attendance: AttendanceRecord[] | null;
}

interface PlayerAttendanceStats {
  player_id: string | null;
  first_name: string | null;
  last_name: string | null;
  team_id: string | null;
  total_events: number | null;
  attended_count: number | null;
  rsvp_yes_count: number | null;
  no_show_count: number | null;
  attendance_rate: number | null;
}

// ============================================================================
// CHECK IN PLAYER
// ============================================================================

export async function checkInPlayer(
  eventId: string,
  playerId: string,
  method: CheckInMethod = 'manual'
): Promise<ActionResult> {
  try {
    const supabase = await createClient();

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return { success: false, error: 'Not authenticated' };
    }

    // Get coach or player ID
    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('id')
      .eq('user_id', user.id)
      .single();

    // Verify event exists - golf_events uses start_time (datetime), not separate date fields
    // Note: check-in settings may be stored in metadata or a separate table
    const { data: event } = await supabase
      .from('golf_events')
      .select('id, start_time, metadata')
      .eq('id', eventId)
      .single();

    if (!event) {
      return { success: false, error: 'Event not found' };
    }

    // Check-in settings could be in metadata (if stored there)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const metadata = (event.metadata || {}) as any;
    const enableCheckIn = metadata.enable_check_in !== false; // Default to enabled

    if (!enableCheckIn) {
      return { success: false, error: 'Check-in is not enabled for this event' };
    }

    // Check if check-in window is open
    const now = new Date();
    const eventStart = new Date(event.start_time);
    const checkInOpensMins = metadata.check_in_opens_minutes_before || 30;
    const checkInClosesMins = metadata.check_in_closes_minutes_after || 15;
    const checkInOpens = new Date(eventStart.getTime() - checkInOpensMins * 60000);
    const checkInCloses = new Date(eventStart.getTime() + checkInClosesMins * 60000);

    if (now < checkInOpens || now > checkInCloses) {
      return { success: false, error: 'Check-in window is not currently open' };
    }

    // If self check-in and require_coach_check_in, deny
    const requireCoachCheckIn = metadata.require_coach_check_in || false;
    if (method === 'self' && requireCoachCheckIn && !coach) {
      return { success: false, error: 'Coach approval required for check-in' };
    }

    // Get or create attendance record
    const { data: attendance } = await supabase
      .from('golf_event_attendance')
      .select('id')
      .eq('event_id', eventId)
      .eq('player_id', playerId)
      .single();

    if (attendance) {
      // Update existing record
      // Note: no_show field may not exist in golf_event_attendance - using status instead
      const { error: updateError } = await supabase
        .from('golf_event_attendance')
        .update({
          checked_in: true,
          checked_in_at: now.toISOString(),
          checked_in_by: coach?.id || null,
          check_in_method: method,
          status: 'present', // Clear no-show by setting status
        })
        .eq('id', attendance.id);

      if (updateError) {
        return { success: false, error: updateError.message };
      }
    } else {
      // Create new attendance record
      const { error: insertError } = await supabase
        .from('golf_event_attendance')
        .insert({
          event_id: eventId,
          player_id: playerId,
          status: 'accepted',
          checked_in: true,
          checked_in_at: now.toISOString(),
          checked_in_by: coach?.id || null,
          check_in_method: method,
        });

      if (insertError) {
        return { success: false, error: insertError.message };
      }
    }

    revalidatePath('/golf/dashboard/calendar');
    return { success: true };
  } catch (error) {
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
      .single();

    if (!coach) {
      return { success: false, error: 'Coach not found' };
    }

    // OPTIMIZED: Batch upsert instead of sequential individual check-ins
    // Previously: 30 players = 30+ separate database operations
    // Now: Single batch operation regardless of player count
    const now = new Date().toISOString();

    const upsertRecords = playerIds.map((playerId) => ({
      event_id: eventId,
      player_id: playerId,
      checked_in: true,
      checked_in_at: now,
      check_in_method: 'manual' as const,
      checked_in_by: coach.id,
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
  } catch (error) {
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
      .single();

    if (!coach) {
      return { success: false, error: 'Coach not found' };
    }

    // Update attendance record - use status field instead of no_show
    // Note: no_show, no_show_marked_at, no_show_marked_by may not exist in schema
    const { error: updateError } = await supabase
      .from('golf_event_attendance')
      .update({
        status: 'no_show',
        updated_at: new Date().toISOString(),
      })
      .eq('event_id', eventId)
      .eq('player_id', playerId);

    if (updateError) {
      return { success: false, error: updateError.message };
    }

    revalidatePath('/golf/dashboard/calendar');
    return { success: true };
  } catch (error) {
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

    // Get attendance summary
    const { data: summary } = await supabase
      .from('golf_attendance_summary')
      .select('*')
      .eq('event_id', eventId)
      .single();

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
        summary: summary as unknown as AttendanceSummary | null,
        attendance: attendance as unknown as AttendanceRecord[] | null,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: 'Failed to get attendance report. Please try again.',
    };
  }
}

// ============================================================================
// GET PLAYER ATTENDANCE STATS
// ============================================================================

export async function getPlayerAttendanceStats(
  playerId?: string
): Promise<ActionResult<PlayerAttendanceStats[]>> {
  try {
    const supabase = await createClient();

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return { success: false, error: 'Not authenticated' };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (supabase as any)
      .from('golf_player_attendance_stats')
      .select('*');

    if (playerId) {
      query = query.eq('player_id', playerId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[Attendance Error]', error);
      return { success: false, error: 'Operation failed. Please try again.' };
    }

    return { success: true, data: data as unknown as PlayerAttendanceStats[] };
  } catch (error) {
    return {
      success: false,
      error: 'Failed to get attendance stats. Please try again.',
    };
  }
}

// ============================================================================
// VERIFY QR CODE CHECK-IN
// ============================================================================

export async function verifyQRCodeCheckIn(
  qrToken: string
): Promise<ActionResult<{ eventId: string; eventTitle: string }>> {
  try {
    const supabase = await createClient();

    // Note: qr_code_token and enable_check_in may be in metadata
    const { data: event } = await supabase
      .from('golf_events')
      .select('id, title, metadata')
      .single();

    // Check if event exists and has matching QR token in metadata
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const metadata = (event?.metadata || {}) as any;
    const enableCheckIn = metadata.enable_check_in !== false;
    const eventQrToken = metadata.qr_code_token;

    if (!event || eventQrToken !== qrToken || !enableCheckIn) {
      return { success: false, error: 'Invalid QR code or check-in disabled' };
    }

    return {
      success: true,
      data: {
        eventId: event.id,
        eventTitle: event.title,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: 'Invalid QR code. Please try again.',
    };
  }
}
