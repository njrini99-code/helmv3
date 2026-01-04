'use server';

//@ts-nocheck

/**
 * Server Actions for Event Lifecycle Management
 *
 * Handles:
 * - Publishing draft events
 * - Cancelling events with notification
 * - Reinstating cancelled events
 * - Viewing status history
 */

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

// ============================================================================
// TYPES
// ============================================================================

export type EventStatus = 'draft' | 'confirmed' | 'cancelled';

interface ActionResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

// ============================================================================
// PUBLISH DRAFT EVENT
// ============================================================================

export async function publishEvent(eventId: string): Promise<ActionResult> {
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

    // Update event status to confirmed
    const { error: updateError } = await supabase
      .from('golf_events')
      .update({
        status: 'confirmed' as any,
        updated_at: new Date().toISOString(),
      })
      .eq('id', eventId)
      .eq('created_by', coach.id) // Verify ownership
      .eq('status', 'draft' as any); // Only draft events can be published

    if (updateError) {
      return { success: false, error: updateError.message };
    }

    revalidatePath('/golf/(dashboard)/dashboard/calendar');
    return { success: true };
  } catch (error) {
    console.error('Error publishing event:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to publish event',
    };
  }
}

// ============================================================================
// CANCEL EVENT
// ============================================================================

export async function cancelEvent(
  eventId: string,
  reason?: string,
  notifyPlayers: boolean = true
): Promise<ActionResult> {
  try {
    const supabase = await createClient();

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return { success: false, error: 'Not authenticated' };
    }

    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('id, first_name, last_name')
      .eq('user_id', user.id)
      .single();

    if (!coach) {
      return { success: false, error: 'Coach not found' };
    }

    // Get event details for notification
    const { data: event } = await supabase
      .from('golf_events')
      .select('id, title, team_id, start_date')
      .eq('id', eventId)
      .single();

    if (!event) {
      return { success: false, error: 'Event not found' };
    }

    // Update event status to cancelled
    const { error: updateError } = await supabase
      .from('golf_events')
      .update({
        status: 'cancelled' as any,
        cancelled_at: new Date().toISOString(),
        cancelled_by: coach.id,
        cancellation_reason: reason,
        updated_at: new Date().toISOString(),
      })
      .eq('id', eventId)
      .eq('created_by', coach.id); // Verify ownership

    if (updateError) {
      return { success: false, error: updateError.message };
    }

    // Notify players if requested
    if (notifyPlayers && event.team_id) {
      // Get all players on the team
      const { data: players } = await supabase
        .from('golf_players')
        .select('id')
        .eq('team_id', event.team_id);

      if (players && players.length > 0) {
        // Create notifications
        const notifications = players.map(player => ({
          user_id: player.id,
          type: 'event_cancelled',
          title: `Event Cancelled: ${event.title}`,
          message: reason || 'This event has been cancelled.',
          action_url: `/golf/dashboard/calendar`,
          read: false,
        }));

        await supabase
          .from('golf_calendar_notifications')
          .insert(notifications);
      }
    }

    revalidatePath('/golf/(dashboard)/dashboard/calendar');
    return { success: true };
  } catch (error) {
    console.error('Error cancelling event:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to cancel event',
    };
  }
}

// ============================================================================
// REINSTATE CANCELLED EVENT
// ============================================================================

export async function reinstateEvent(eventId: string): Promise<ActionResult> {
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

    // Update event status back to confirmed
    const { error: updateError } = await supabase
      .from('golf_events')
      .update({
        status: 'confirmed' as any,
        cancelled_at: null,
        cancelled_by: null,
        cancellation_reason: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', eventId)
      .eq('created_by', coach.id) // Verify ownership
      .eq('status', 'cancelled' as any); // Only cancelled events can be reinstated

    if (updateError) {
      return { success: false, error: updateError.message };
    }

    revalidatePath('/golf/(dashboard)/dashboard/calendar');
    return { success: true };
  } catch (error) {
    console.error('Error reinstating event:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to reinstate event',
    };
  }
}

// ============================================================================
// GET EVENT STATUS HISTORY
// ============================================================================

export async function getEventStatusHistory(
  eventId: string
): Promise<ActionResult<any[]>> {
  try {
    const supabase = await createClient();

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return { success: false, error: 'Not authenticated' };
    }

    // Get status history with coach details
    const { data: history, error: historyError } = await supabase
      .from('golf_event_status_log')
      .select(`
        *,
        coach:changed_by (
          first_name,
          last_name
        )
      `)
      .eq('event_id', eventId)
      .order('changed_at', { ascending: false });

    if (historyError) {
      return { success: false, error: historyError.message };
    }

    return { success: true, data: history || [] };
  } catch (error) {
    console.error('Error fetching status history:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch status history',
    };
  }
}

// ============================================================================
// CREATE DRAFT EVENT
// ============================================================================

export async function createDraftEvent(eventData: {
  title: string;
  description?: string;
  eventType: string;
  startDate: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  location?: string;
  teamId?: string;
}): Promise<ActionResult<{ eventId: string }>> {
  try {
    const supabase = await createClient();

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return { success: false, error: 'Not authenticated' };
    }

    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('id, team_id')
      .eq('user_id', user.id)
      .single();

    if (!coach) {
      return { success: false, error: 'Coach not found' };
    }

    // Create event in draft state
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
        team_id: eventData.teamId || coach.team_id,
        status: 'draft' as any,
      })
      .select('id')
      .single();

    if (createError) {
      return { success: false, error: createError.message };
    }

    revalidatePath('/golf/(dashboard)/dashboard/calendar');
    return { success: true, data: { eventId: event.id } };
  } catch (error) {
    console.error('Error creating draft event:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create draft event',
    };
  }
}
