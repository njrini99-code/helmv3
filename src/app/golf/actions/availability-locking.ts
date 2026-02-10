'use server';

/**
 * Server Actions for Availability Locking & Conflict Detection
 *
 * Handles:
 * - Conflict detection before event creation
 * - Player availability blocks
 * - Conflict override management
 */

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { formatSafeErrorResponse } from '@/lib/validation/server-action-validator';

/** Build timezone offset string from minutes (e.g. 360 → "-06:00") */
function formatTimezoneOffset(offsetMinutes: number): string {
  const sign = offsetMinutes <= 0 ? '+' : '-';
  const absMinutes = Math.abs(offsetMinutes);
  const hours = Math.floor(absMinutes / 60);
  const minutes = absMinutes % 60;
  return `${sign}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

// ============================================================================
// TYPES
// ============================================================================

interface ActionResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface EventConflict {
  conflictType: string;
  conflictEventId: string;
  conflictEventTitle: string;
  conflictStartDate: string;
  conflictEndDate: string | null;
}

interface ConflictRpcResult {
  conflict_type: string;
  conflict_event_id: string;
  conflict_event_title: string;
  conflict_start_date: string;
  conflict_end_date: string | null;
}

interface AvailabilityBlock {
  id: string;
  player_id: string;
  start_date: string;
  end_date: string;
  start_time: string | null;
  end_time: string | null;
  reason: string;
  recurrence_rule: string | null;
  is_recurring: boolean | null;
  created_at: string | null;
  updated_at: string | null;
}

interface AvailabilityConflict {
  is_blocked: boolean;
  block_reason: string;
  block_start_date: string;
  block_end_date: string;
}


// ============================================================================
// CHECK FOR CONFLICTS
// ============================================================================

export async function checkEventConflicts(
  teamId: string,
  startDate: string,
  endDate: string | null,
  startTime: string | null,
  endTime: string | null,
  eventId?: string
): Promise<ActionResult<EventConflict[]>> {
  try {
    const supabase = await createClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: conflicts, error } = await (supabase as any)
      .rpc('detect_event_conflicts', {
        p_event_id: eventId || '',
        p_team_id: teamId,
        p_start_date: startDate,
        p_end_date: endDate || startDate,
        p_start_time: startTime || '00:00',
        p_end_time: endTime || '23:59',
        p_ignore_conflicts: false,
      });

    if (error) {
      console.error('[checkEventConflicts Error]', error);
      return { success: false, error: 'Failed to check event conflicts. Please try again.' };
    }

    // Map database response to our interface
    const mappedConflicts: EventConflict[] = ((conflicts || []) as ConflictRpcResult[]).map((c) => ({
      conflictType: c.conflict_type,
      conflictEventId: c.conflict_event_id,
      conflictEventTitle: c.conflict_event_title,
      conflictStartDate: c.conflict_start_date,
      conflictEndDate: c.conflict_end_date,
    }));

    return {
      success: true,
      data: mappedConflicts,
    };
  } catch (error) {
    console.error('[checkEventConflicts Error]', error);
    return formatSafeErrorResponse(error);
  }
}

// ============================================================================
// CREATE EVENT WITH CONFLICT CHECK
// ============================================================================

export async function createEventWithConflictCheck(eventData: {
  title: string;
  description?: string;
  eventType: string;
  startDate: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  location?: string;
  teamId: string;
  ignoreConflicts?: boolean;
  conflictOverrideReason?: string;
  timezoneOffset?: number;
}): Promise<ActionResult<{ eventId?: string; conflicts?: EventConflict[] }>> {
  try {
    const supabase = await createClient();

    // Get current coach
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

    // Check for conflicts first
    const conflictCheck = await checkEventConflicts(
      eventData.teamId,
      eventData.startDate,
      eventData.endDate || null,
      eventData.startTime || null,
      eventData.endTime || null
    );

    if (!conflictCheck.success) {
      return { success: false, error: conflictCheck.error };
    }

    // If conflicts exist and not ignoring, return conflicts for user decision
    if (conflictCheck.data && conflictCheck.data.length > 0 && !eventData.ignoreConflicts) {
      return {
        success: false,
        error: 'Scheduling conflicts detected',
        data: { conflicts: conflictCheck.data },
      };
    }

    // Create event
    // Build start_time and end_time as ISO datetime strings with timezone offset
    const tz = eventData.timezoneOffset !== undefined ? formatTimezoneOffset(eventData.timezoneOffset) : '';
    const startDateTime = eventData.startTime
      ? `${eventData.startDate}T${eventData.startTime}:00${tz}`
      : `${eventData.startDate}T00:00:00${tz}`;
    const endDateTime = eventData.endTime
      ? `${eventData.endDate || eventData.startDate}T${eventData.endTime}:00${tz}`
      : eventData.endDate
        ? `${eventData.endDate}T23:59:59${tz}`
        : null;

    const { data: event, error: createError } = await supabase
      .from('golf_events')
      .insert({
        title: eventData.title,
        description: eventData.description,
        event_type: eventData.eventType,
        start_time: startDateTime,
        end_time: endDateTime,
        location: eventData.location,
        created_by: coach.id,
        team_id: eventData.teamId,
        status: 'confirmed',
      })
      .select('id')
      .single();

    if (createError) {
      console.error('[createEventWithConflictCheck Error]', createError);
      return { success: false, error: 'Failed to create event. Please try again.' };
    }

    revalidatePath('/golf/dashboard/calendar');
    return { success: true, data: { eventId: event.id } };
  } catch (error) {
    console.error('[createEventWithConflictCheck Error]', error);
    return formatSafeErrorResponse(error);
  }
}

// ============================================================================
// PLAYER AVAILABILITY BLOCKS
// ============================================================================

export async function createAvailabilityBlock(
  playerId: string,
  startDate: string,
  endDate: string,
  startTime: string | null,
  endTime: string | null,
  reason: string
): Promise<ActionResult<{ blockId: string }>> {
  try {
    const supabase = await createClient();

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return { success: false, error: 'Not authenticated' };
    }

    // Verify user owns this player profile
    const { data: player } = await supabase
      .from('golf_players')
      .select('id')
      .eq('id', playerId)
      .eq('user_id', user.id)
      .single();

    if (!player) {
      return { success: false, error: 'Player not found or unauthorized' };
    }

    const { data: block, error: insertError } = await supabase
      .from('golf_player_availability_blocks')
      .insert({
        player_id: playerId,
        start_date: startDate,
        end_date: endDate,
        start_time: startTime,
        end_time: endTime,
        reason: reason,
      })
      .select('id')
      .single();

    if (insertError) {
      console.error('[createAvailabilityBlock Error]', insertError);
      return { success: false, error: 'Failed to create availability block. Please try again.' };
    }

    revalidatePath('/golf/dashboard/calendar');
    return { success: true, data: { blockId: block.id } };
  } catch (error) {
    console.error('[createAvailabilityBlock Error]', error);
    return formatSafeErrorResponse(error);
  }
}

export async function deleteAvailabilityBlock(
  blockId: string
): Promise<ActionResult> {
  try {
    const supabase = await createClient();

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return { success: false, error: 'Not authenticated' };
    }

    // Delete block (RLS will ensure user owns it)
    const { error: deleteError } = await supabase
      .from('golf_player_availability_blocks')
      .delete()
      .eq('id', blockId);

    if (deleteError) {
      console.error('[deleteAvailabilityBlock Error]', deleteError);
      return { success: false, error: 'Failed to delete availability block. Please try again.' };
    }

    revalidatePath('/golf/dashboard/calendar');
    return { success: true };
  } catch (error) {
    console.error('[deleteAvailabilityBlock Error]', error);
    return formatSafeErrorResponse(error);
  }
}

export async function getPlayerAvailabilityBlocks(
  playerId: string
): Promise<ActionResult<AvailabilityBlock[]>> {
  try {
    const supabase = await createClient();

    const { data: blocks, error } = await supabase
      .from('golf_player_availability_blocks')
      .select('*')
      .eq('player_id', playerId)
      .order('start_date', { ascending: true });

    if (error) {
      console.error('[getPlayerAvailabilityBlocks Error]', error);
      return { success: false, error: 'Failed to get availability blocks. Please try again.' };
    }

    return { success: true, data: (blocks || []) as unknown as AvailabilityBlock[] };
  } catch (error) {
    console.error('[getPlayerAvailabilityBlocks Error]', error);
    return formatSafeErrorResponse(error);
  }
}

// ============================================================================
// CHECK PLAYER AVAILABILITY
// ============================================================================

export async function checkPlayerAvailability(
  playerId: string,
  startDate: string,
  endDate: string | null,
  startTime: string | null,
  endTime: string | null
): Promise<ActionResult<AvailabilityConflict[]>> {
  try {
    const supabase = await createClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: blocks, error } = await (supabase as any)
      .rpc('check_player_availability', {
        p_player_id: playerId,
        p_start_date: startDate,
        p_end_date: endDate || startDate,
        p_start_time: startTime || '00:00',
        p_end_time: endTime || '23:59',
      });

    if (error) {
      console.error('[checkPlayerAvailability Error]', error);
      return { success: false, error: 'Failed to check player availability. Please try again.' };
    }

    return { success: true, data: (blocks || []) as unknown as AvailabilityConflict[] };
  } catch (error) {
    console.error('[checkPlayerAvailability Error]', error);
    return formatSafeErrorResponse(error);
  }
}
