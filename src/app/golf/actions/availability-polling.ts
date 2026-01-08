'use server';

/**
 * Server Actions for Group Availability Polling
 *
 * Handles:
 * - Creating availability polls
 * - Submitting responses
 * - Calculating best times
 * - Converting polls to events
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

export interface AvailabilityPoll {
  id: string;
  title: string;
  description?: string;
  durationMinutes: number;
  dateOptions: string[];
  timeOptions: string[];
  deadline?: string;
  status: 'open' | 'closed' | 'scheduled';
}

export interface PollResponse {
  dateOption: string;
  timeOption: string;
  isAvailable: boolean;
  preferenceLevel?: number; // 1-5
  notes?: string;
}

interface PollResult {
  date_option: string;
  time_option: string;
  available_count: number;
  total_responses: number;
  availability_percentage: number;
}

interface SuggestedTime {
  date_option: string;
  time_option: string;
  availability_percentage: number;
  available_players: string[];
}

type GolfEventType = 'practice' | 'tournament' | 'qualifier' | 'meeting' | 'travel' | 'other';
type GolfEventStatus = 'draft' | 'confirmed' | 'cancelled' | 'completed';

// ============================================================================
// CREATE POLL
// ============================================================================

export async function createAvailabilityPoll(input: {
  title: string;
  description?: string;
  teamId: string;
  durationMinutes: number;
  dateOptions: string[]; // ISO dates
  timeOptions: string[]; // HH:mm format
  deadline?: string;
}): Promise<ActionResult<{ pollId: string }>> {
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

    const { data: poll, error: createError } = await supabase
      .from('golf_availability_polls')
      .insert({
        title: input.title,
        description: input.description,
        created_by: coach.id,
        team_id: input.teamId,
        duration_minutes: input.durationMinutes,
        date_options: input.dateOptions,
        time_options: input.timeOptions,
        deadline: input.deadline,
        status: 'open',
      })
      .select('id')
      .single();

    if (createError) {
      return { success: false, error: createError.message };
    }

    revalidatePath('/golf/(dashboard)/dashboard/calendar');
    return { success: true, data: { pollId: poll.id } };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create poll',
    };
  }
}

// ============================================================================
// SUBMIT RESPONSES
// ============================================================================

export async function submitPollResponses(
  pollId: string,
  playerId: string,
  responses: PollResponse[]
): Promise<ActionResult> {
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

    // Delete existing responses for this player
    await supabase
      .from('golf_poll_responses')
      .delete()
      .eq('poll_id', pollId)
      .eq('player_id', playerId);

    // Insert new responses
    const responseData = responses.map(r => ({
      poll_id: pollId,
      player_id: playerId,
      date_option: r.dateOption,
      time_option: r.timeOption,
      is_available: r.isAvailable,
      preference_level: r.preferenceLevel || 3, // Default to neutral
      notes: r.notes,
    }));

    const { error: insertError } = await supabase
      .from('golf_poll_responses')
      .insert(responseData);

    if (insertError) {
      return { success: false, error: insertError.message };
    }

    revalidatePath('/golf/(dashboard)/dashboard/calendar');
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to submit responses',
    };
  }
}

// ============================================================================
// GET POLL RESULTS
// ============================================================================

export async function getPollResults(
  pollId: string
): Promise<ActionResult<PollResult[]>> {
  try {
    const supabase = await createClient();

    const { data: results, error } = await supabase
      .rpc('calculate_poll_results', {
        p_poll_id: pollId,
      });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: results || [] };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get results',
    };
  }
}

// ============================================================================
// GET SUGGESTED BEST TIMES
// ============================================================================

export async function getSuggestedBestTimes(
  pollId: string,
  minAvailabilityPercentage: number = 70
): Promise<ActionResult<SuggestedTime[]>> {
  try {
    const supabase = await createClient();

    const { data: suggestions, error } = await supabase
      .rpc('get_suggested_best_times', {
        p_poll_id: pollId,
        p_min_availability_percentage: minAvailabilityPercentage,
      });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: suggestions || [] };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get best times',
    };
  }
}

// ============================================================================
// SCHEDULE EVENT FROM POLL
// ============================================================================

export async function scheduleEventFromPoll(
  pollId: string,
  selectedDate: string,
  selectedTime: string,
  eventData: {
    title?: string;
    description?: string;
    location?: string;
    eventType: string;
  }
): Promise<ActionResult<{ eventId: string }>> {
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

    // Get poll details
    const { data: poll } = await supabase
      .from('golf_availability_polls')
      .select('*')
      .eq('id', pollId)
      .single();

    if (!poll || poll.created_by !== coach.id) {
      return { success: false, error: 'Poll not found or unauthorized' };
    }

    // Calculate end time
    const endDate = new Date(`${selectedDate}T${selectedTime}`);
    endDate.setMinutes(endDate.getMinutes() + poll.duration_minutes);
    const endTime = `${String(endDate.getHours()).padStart(2, '0')}:${String(endDate.getMinutes()).padStart(2, '0')}`;

    // Create event
    const { data: event, error: createError } = await supabase
      .from('golf_events')
      .insert({
        title: eventData.title || poll.title,
        description: eventData.description || poll.description,
        event_type: eventData.eventType as GolfEventType,
        start_date: selectedDate,
        start_time: selectedTime,
        end_time: endTime,
        location: eventData.location,
        created_by: coach.id,
        team_id: poll.team_id,
        status: 'confirmed' as GolfEventStatus,
      })
      .select('id')
      .single();

    if (createError) {
      return { success: false, error: createError.message };
    }

    // Update poll status
    await supabase
      .from('golf_availability_polls')
      .update({
        status: 'scheduled',
        selected_date: selectedDate,
        selected_time: selectedTime,
        created_event_id: event.id,
      })
      .eq('id', pollId);

    revalidatePath('/golf/(dashboard)/dashboard/calendar');
    return { success: true, data: { eventId: event.id } };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to schedule event',
    };
  }
}

// ============================================================================
// CLOSE POLL
// ============================================================================

export async function closePoll(pollId: string): Promise<ActionResult> {
  try {
    const supabase = await createClient();

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return { success: false, error: 'Not authenticated' };
    }

    const { error: updateError } = await supabase
      .from('golf_availability_polls')
      .update({ status: 'closed' })
      .eq('id', pollId);

    if (updateError) {
      return { success: false, error: updateError.message };
    }

    revalidatePath('/golf/(dashboard)/dashboard/calendar');
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to close poll',
    };
  }
}
