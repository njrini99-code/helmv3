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

// Actual golf_event_status enum: draft, confirmed, cancelled, completed, pending
export type EventStatus = 'draft' | 'confirmed' | 'cancelled' | 'completed' | 'pending';
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

    // Update event status to confirmed (published)
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
    // Note: golf_events has is_cancelled (boolean) and cancellation_reason columns, no cancelled_at
    const { error: updateError } = await supabase
      .from('golf_events')
      .update({
        status: 'cancelled' as EventStatus,
        is_cancelled: true,
        cancellation_reason: reason || null,
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
        // Look up user_ids for each player to create notifications
        const playerIds = teamMembers.map(m => m.player_id);
        const { data: players } = await supabase
          .from('golf_players')
          .select('user_id')
          .in('id', playerIds);

        const userIds = (players || [])
          .map(p => p.user_id)
          .filter((uid): uid is string => Boolean(uid));

        // TODO: golf_calendar_notifications table does not exist yet.
        // A migration is needed to create this table before notifications can be sent.
        // When the table is created, uncomment the code below.
        // if (userIds.length > 0) {
        //   const notifications = userIds.map(userId => ({
        //     user_id: userId,
        //     event_id: eventId,
        //     notification_type: 'event_cancelled',
        //     title: `Event Cancelled: ${event.title}`,
        //     message: reason || 'This event has been cancelled.',
        //     action_url: `/golf/dashboard/calendar`,
        //   }));
        //   await supabase
        //     .from('golf_calendar_notifications')
        //     .upsert(notifications, { onConflict: 'event_id,user_id,notification_type' });
        // }
        void userIds; // Suppress unused variable warning until notifications table exists
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
    // Note: golf_events has is_cancelled (boolean) and cancellation_reason, no cancelled_at
    const { error: updateError } = await supabase
      .from('golf_events')
      .update({
        status: 'confirmed' as EventStatus,
        is_cancelled: false,
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

    // TODO: golf_event_status_log table does not exist yet.
    // A migration is needed to create this table for status history tracking.
    // For now, return an empty array.
    // When the table is created, uncomment and use:
    // const { data: history, error: historyError } = await supabase
    //   .from('golf_event_status_log')
    //   .select(`*, coach:changed_by ( full_name )`)
    //   .eq('event_id', eventId)
    //   .order('changed_at', { ascending: false });
    void eventId; // Suppress unused warning until status log table exists
    return { success: true, data: [] as EventStatusHistory[] };
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
  timezoneOffset?: number;
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
    // golf_events schema: start_time (required ISO timestamp), end_time (nullable)
    const tz = eventData.timezoneOffset !== undefined ? formatTimezoneOffset(eventData.timezoneOffset) : '';
    const startTime = eventData.startTime
      ? `${eventData.startDate}T${eventData.startTime}${tz}`
      : `${eventData.startDate}T00:00:00${tz}`;
    const endTime = eventData.endDate && eventData.endTime
      ? `${eventData.endDate}T${eventData.endTime}${tz}`
      : eventData.endTime || null;

    const { data: event, error: createError } = await supabase
      .from('golf_events')
      .insert({
        title: eventData.title,
        description: eventData.description,
        event_type: eventData.eventType as GolfEventType,
        start_time: startTime,
        end_time: endTime,
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
