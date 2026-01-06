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

    const { data: conflicts, error } = await supabase
      .rpc('detect_event_conflicts', {
        p_event_id: eventId || null,
        p_team_id: teamId,
        p_start_date: startDate,
        p_end_date: endDate || '',
        p_start_time: startTime || '',
        p_end_time: endTime || '',
        p_ignore_conflicts: false,
      } as any);

    if (error) {
      return { success: false, error: error.message };
    }

    // Map database response to our interface
    const mappedConflicts: EventConflict[] = (conflicts || []).map((c: any) => ({
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
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to check conflicts',
    };
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
    const { data: event, error: createError } = await supabase
      .from('golf_events')
      .insert({
        title: eventData.title,
        description: eventData.description,
        event_type: eventData.eventType as any,
        start_date: eventData.startDate,
        end_date: eventData.endDate,
        start_time: eventData.startTime,
        end_time: eventData.endTime,
        location: eventData.location,
        created_by: coach.id,
        team_id: eventData.teamId,
        status: 'confirmed' as any,
        ignore_conflicts: eventData.ignoreConflicts || false,
        conflict_override_reason: eventData.conflictOverrideReason,
        conflict_override_by: eventData.ignoreConflicts ? coach.id : null,
      })
      .select('id')
      .single();

    if (createError) {
      return { success: false, error: createError.message };
    }

    revalidatePath('/golf/(dashboard)/dashboard/calendar');
    return { success: true, data: { eventId: event.id } };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create event',
    };
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
      return { success: false, error: insertError.message };
    }

    revalidatePath('/golf/(dashboard)/dashboard/calendar');
    return { success: true, data: { blockId: block.id } };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create availability block',
    };
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
      return { success: false, error: deleteError.message };
    }

    revalidatePath('/golf/(dashboard)/dashboard/calendar');
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete availability block',
    };
  }
}

export async function getPlayerAvailabilityBlocks(
  playerId: string
): Promise<ActionResult<any[]>> {
  try {
    const supabase = await createClient();

    const { data: blocks, error } = await supabase
      .from('golf_player_availability_blocks')
      .select('*')
      .eq('player_id', playerId)
      .order('start_date', { ascending: true });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: blocks || [] };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get availability blocks',
    };
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
): Promise<ActionResult<any[]>> {
  try {
    const supabase = await createClient();

    const { data: blocks, error } = await supabase
      .rpc('check_player_availability', {
        p_player_id: playerId,
        p_start_date: startDate,
        p_end_date: endDate || '',
        p_start_time: startTime || '',
        p_end_time: endTime || '',
      } as any);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: blocks || [] };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to check player availability',
    };
  }
}
