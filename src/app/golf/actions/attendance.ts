'use server';

//@ts-nocheck

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

    const { data: player } = await supabase
      .from('golf_players')
      .select('id')
      .eq('user_id', user.id)
      .single();

    // Verify check-in is allowed
    const { data: event } = await supabase
      .from('golf_events')
      .select('enable_check_in, require_coach_check_in, start_date, start_time, check_in_opens_minutes_before, check_in_closes_minutes_after')
      .eq('id', eventId)
      .single();

    if (!event) {
      return { success: false, error: 'Event not found' };
    }

    if (!event.enable_check_in) {
      return { success: false, error: 'Check-in is not enabled for this event' };
    }

    // Check if check-in window is open
    const now = new Date();
    const eventStart = new Date(`${event.start_date}T${event.start_time || '00:00'}`);
    const checkInOpens = new Date(eventStart.getTime() - (event.check_in_opens_minutes_before || 30) * 60000);
    const checkInCloses = new Date(eventStart.getTime() + (event.check_in_closes_minutes_after || 15) * 60000);

    if (now < checkInOpens || now > checkInCloses) {
      return { success: false, error: 'Check-in window is not currently open' };
    }

    // If self check-in and require_coach_check_in, deny
    if (method === 'self' && event.require_coach_check_in && !coach) {
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
      const { error: updateError } = await supabase
        .from('golf_event_attendance')
        .update({
          checked_in: true,
          checked_in_at: now.toISOString(),
          checked_in_by: coach?.id || null,
          check_in_method: method,
          no_show: false, // Clear no-show if marked
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

    revalidatePath('/golf/(dashboard)/dashboard/calendar');
    return { success: true };
  } catch (error) {
    console.error('Error checking in player:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to check in player',
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

    let successCount = 0;
    let failureCount = 0;

    for (const playerId of playerIds) {
      const result = await checkInPlayer(eventId, playerId, 'manual');
      if (result.success) {
        successCount++;
      } else {
        failureCount++;
      }
    }

    revalidatePath('/golf/(dashboard)/dashboard/calendar');
    return {
      success: true,
      data: { successCount, failureCount },
    };
  } catch (error) {
    console.error('Error with bulk check-in:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to bulk check-in',
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

    // Update attendance record
    const { error: updateError } = await supabase
      .from('golf_event_attendance')
      .update({
        no_show: true,
        no_show_marked_at: new Date().toISOString(),
        no_show_marked_by: coach.id,
      })
      .eq('event_id', eventId)
      .eq('player_id', playerId);

    if (updateError) {
      return { success: false, error: updateError.message };
    }

    revalidatePath('/golf/(dashboard)/dashboard/calendar');
    return { success: true };
  } catch (error) {
    console.error('Error marking no-show:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to mark no-show',
    };
  }
}

// ============================================================================
// GET ATTENDANCE REPORT
// ============================================================================

export async function getAttendanceReport(
  eventId: string
): Promise<ActionResult<any>> {
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
        summary,
        attendance,
      },
    };
  } catch (error) {
    console.error('Error getting attendance report:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get attendance report',
    };
  }
}

// ============================================================================
// GET PLAYER ATTENDANCE STATS
// ============================================================================

export async function getPlayerAttendanceStats(
  playerId?: string
): Promise<ActionResult<any>> {
  try {
    const supabase = await createClient();

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return { success: false, error: 'Not authenticated' };
    }

    let query = supabase
      .from('golf_player_attendance_stats')
      .select('*');

    if (playerId) {
      query = query.eq('player_id', playerId);
    }

    const { data, error } = await query;

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data };
  } catch (error) {
    console.error('Error getting player attendance stats:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get attendance stats',
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

    const { data: event } = await supabase
      .from('golf_events')
      .select('id, title, enable_check_in')
      .eq('qr_code_token', qrToken)
      .single();

    if (!event || !event.enable_check_in) {
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
    console.error('Error verifying QR code:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Invalid QR code',
    };
  }
}
