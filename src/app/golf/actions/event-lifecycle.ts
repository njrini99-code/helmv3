'use server';

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
import { formatSafeErrorResponse } from '@/lib/validation/server-action-validator';

// ============================================================================
// TYPES
// ============================================================================

export type EventStatus = 'draft' | 'confirmed' | 'cancelled';
type GolfEventType = 'practice' | 'tournament' | 'qualifier' | 'meeting' | 'travel' | 'other';

interface ActionResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

interface EventStatusHistory {
  id: string;
  event_id: string;
  old_status: EventStatus | null;
  new_status: EventStatus;
  changed_by: string;
  reason: string | null;
  changed_at: string | null;
  coach?: {
    full_name: string;
  };
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
        status: 'confirmed' as EventStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', eventId)
      .eq('created_by', coach.id) // Verify ownership
      .eq('status', 'draft' as EventStatus); // Only draft events can be published

    if (updateError) {
      console.error('[publishEvent Error]', updateError);
      return { success: false, error: 'Failed to publish event. Please try again.' };
    }

    revalidatePath('/golf/dashboard/calendar');
    return { success: true };
  } catch (error) {
    console.error('[publishEvent Error]', error);
    return formatSafeErrorResponse(error);
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
      .select('id, full_name')
      .eq('user_id', user.id)
      .single();

    if (!coach) {
      return { success: false, error: 'Coach not found' };
    }

    // Get event details for notification
    const { data: event } = await supabase
      .from('golf_events')
      .select('id, title, team_id, start_time')
      .eq('id', eventId)
      .single();

    if (!event) {
      return { success: false, error: 'Event not found' };
    }

    // Update event status to cancelled
    const { error: updateError } = await supabase
      .from('golf_events')
      .update({
        status: 'cancelled' as EventStatus,
        cancelled_at: new Date().toISOString(),
        cancellation_reason: reason,
        updated_at: new Date().toISOString(),
      })
      .eq('id', eventId)
      .eq('created_by', coach.id); // Verify ownership

    if (updateError) {
      console.error('[cancelEvent Error]', updateError);
      return { success: false, error: 'Failed to cancel event. Please try again.' };
    }

    // Notify players if requested
    if (notifyPlayers && event.team_id) {
      // Get all players on the team via golf_team_members
      const { data: teamMembers } = await supabase
        .from('golf_team_members')
        .select('player_id')
        .eq('team_id', event.team_id);

      if (teamMembers && teamMembers.length > 0) {
        // TODO: golf_calendar_notifications table does not exist yet
        // When the table is created, uncomment the following code to notify players
        // const notifications = teamMembers.map(member => ({
        //   user_id: member.player_id,
        //   type: 'event_cancelled',
        //   title: `Event Cancelled: ${event.title}`,
        //   message: reason || 'This event has been cancelled.',
        //   action_url: `/golf/dashboard/calendar`,
        //   read: false,
        // }));
        // await supabase.from('golf_calendar_notifications').insert(notifications);

        // Cancellation is tracked via the event status change
        // TODO: Implement notification system for event cancellations
      }
    }

    revalidatePath('/golf/dashboard/calendar');
    return { success: true };
  } catch (error) {
    console.error('[cancelEvent Error]', error);
    return formatSafeErrorResponse(error);
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
        status: 'confirmed' as EventStatus,
        cancelled_at: null,
        cancelled_by: null,
        cancellation_reason: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', eventId)
      .eq('created_by', coach.id) // Verify ownership
      .eq('status', 'cancelled' as EventStatus); // Only cancelled events can be reinstated

    if (updateError) {
      console.error('[reinstateEvent Error]', updateError);
      return { success: false, error: 'Failed to reinstate event. Please try again.' };
    }

    revalidatePath('/golf/dashboard/calendar');
    return { success: true };
  } catch (error) {
    console.error('[reinstateEvent Error]', error);
    return formatSafeErrorResponse(error);
  }
}

// ============================================================================
// GET EVENT STATUS HISTORY
// ============================================================================

export async function getEventStatusHistory(
  eventId: string
): Promise<ActionResult<EventStatusHistory[]>> {
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
          full_name
        )
      `)
      .eq('event_id', eventId)
      .order('changed_at', { ascending: false });

    if (historyError) {
      console.error('[getEventStatusHistory Error]', historyError);
      return { success: false, error: 'Failed to fetch status history. Please try again.' };
    }

    return { success: true, data: (history || []) as unknown as EventStatusHistory[] };
  } catch (error) {
    console.error('[getEventStatusHistory Error]', error);
    return formatSafeErrorResponse(error);
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
      .select('id, organization_id')
      .eq('user_id', user.id)
      .single();

    if (!coach) {
      return { success: false, error: 'Coach not found' };
    }

    // Get team_id from golf_teams via organization_id
    let teamId = eventData.teamId;
    if (!teamId && coach.organization_id) {
      const { data: team } = await supabase
        .from('golf_teams')
        .select('id')
        .eq('organization_id', coach.organization_id)
        .maybeSingle();
      teamId = team?.id;
    }

    if (!teamId) {
      return { success: false, error: 'No team found for coach' };
    }

    // Create event in draft state
    // Note: golf_events uses start_time as the primary date/time field
    const { data: event, error: createError } = await supabase
      .from('golf_events')
      .insert({
        title: eventData.title,
        description: eventData.description,
        event_type: eventData.eventType as GolfEventType,
        start_time: eventData.startTime || eventData.startDate,
        end_time: eventData.endTime,
        location: eventData.location,
        created_by: coach.id,
        team_id: teamId,
        status: 'draft' as EventStatus,
      })
      .select('id')
      .single();

    if (createError) {
      console.error('[createDraftEvent Error]', createError);
      return { success: false, error: 'Failed to create draft event. Please try again.' };
    }

    revalidatePath('/golf/dashboard/calendar');
    return { success: true, data: { eventId: event.id } };
  } catch (error) {
    console.error('[createDraftEvent Error]', error);
    return formatSafeErrorResponse(error);
  }
}
