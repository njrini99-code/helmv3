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
  available_count: number;
  total_responses: number;
  score: number;
}

type GolfEventType = 'practice' | 'tournament' | 'qualifier' | 'meeting' | 'travel' | 'other';

// ============================================================================
// CREATE POLL
// ============================================================================

/**
 * Create an availability poll.
 *
 * golf_availability_polls schema:
 *   id, team_id, title, description, created_by, start_date, end_date,
 *   time_slots (JSONB), status, response_deadline, created_at, updated_at
 *
 * We store dateOptions and timeOptions together in the time_slots JSONB column,
 * since the table does not have separate date_options/time_options/duration_minutes columns.
 */
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
        date_options: input.dateOptions,
        time_options: input.timeOptions,
        duration_minutes: input.durationMinutes,
        deadline: input.deadline || null,
        status: 'open',
      })
      .select('id')
      .single();

    if (createError) {
      console.error('[createAvailabilityPoll Error]', createError);
      return { success: false, error: 'Failed to create poll. Please try again.' };
    }

    revalidatePath('/golf/dashboard/calendar');
    return { success: true, data: { pollId: poll.id } };
  } catch (error) {
    console.error('[createAvailabilityPoll Error]', error);
    return formatSafeErrorResponse(error);
  }
}

// ============================================================================
// SUBMIT RESPONSES
// ============================================================================

/**
 * Submit poll responses for a player.
 *
 * golf_poll_responses schema:
 *   id, poll_id, player_id, responses (JSONB), notes, submitted_at, created_at, updated_at
 *   UNIQUE(poll_id, player_id)
 *
 * All individual response data is stored in the responses JSONB column,
 * since the table does not have date_option/time_option/is_available/preference_level columns.
 */
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

    // Delete existing responses for this player/poll, then insert new ones
    await supabase
      .from('golf_poll_responses')
      .delete()
      .eq('poll_id', pollId)
      .eq('player_id', playerId);

    // Insert individual rows per date/time combination
    const rows = responses.map(r => ({
      poll_id: pollId,
      player_id: playerId,
      date_option: r.dateOption,
      time_option: r.timeOption || null,
      is_available: r.isAvailable,
      preference_level: r.preferenceLevel || 3,
      notes: r.notes || null,
    }));

    const { error: upsertError } = await supabase
      .from('golf_poll_responses')
      .insert(rows);

    if (upsertError) {
      console.error('[submitPollResponses Error]', upsertError);
      return { success: false, error: 'Failed to submit responses. Please try again.' };
    }

    revalidatePath('/golf/dashboard/calendar');
    return { success: true };
  } catch (error) {
    console.error('[submitPollResponses Error]', error);
    return formatSafeErrorResponse(error);
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: results, error } = await (supabase as any)
      .rpc('calculate_poll_results', {
        p_poll_id: pollId,
      });

    if (error) {
      console.error('[getPollResults Error]', error);
      return { success: false, error: 'Failed to get poll results. Please try again.' };
    }

    return { success: true, data: results || [] };
  } catch (error) {
    console.error('[getPollResults Error]', error);
    return formatSafeErrorResponse(error);
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: suggestions, error } = await (supabase as any)
      .rpc('get_suggested_best_times', {
        p_poll_id: pollId,
        p_min_availability_percentage: minAvailabilityPercentage,
      });

    if (error) {
      console.error('[getSuggestedBestTimes Error]', error);
      return { success: false, error: 'Failed to get suggested times. Please try again.' };
    }

    return { success: true, data: (suggestions || []) as unknown as SuggestedTime[] };
  } catch (error) {
    console.error('[getSuggestedBestTimes Error]', error);
    return formatSafeErrorResponse(error);
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
    timezoneOffset?: number;
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

    // Calculate end time from duration
    const durationMinutes = poll.duration_minutes || 60;
    const endDateObj = new Date(`${selectedDate}T${selectedTime}`);
    endDateObj.setMinutes(endDateObj.getMinutes() + durationMinutes);
    const endTime = `${String(endDateObj.getHours()).padStart(2, '0')}:${String(endDateObj.getMinutes()).padStart(2, '0')}`;

    // Create event - golf_events uses start_time (required ISO timestamp), end_time (nullable)
    const tz = eventData.timezoneOffset !== undefined ? formatTimezoneOffset(eventData.timezoneOffset) : '';
    const { data: event, error: createError } = await supabase
      .from('golf_events')
      .insert({
        title: eventData.title || poll.title,
        description: eventData.description || poll.description,
        event_type: eventData.eventType as GolfEventType,
        start_time: `${selectedDate}T${selectedTime}${tz}`,
        end_time: `${selectedDate}T${endTime}${tz}`,
        location: eventData.location,
        created_by: coach.id,
        team_id: poll.team_id,
        status: 'confirmed',
      })
      .select('id')
      .single();

    if (createError) {
      console.error('[scheduleEventFromPoll Error]', createError);
      return { success: false, error: 'Failed to schedule event. Please try again.' };
    }

    // Update poll status to closed (no 'scheduled' enum value; 'selected_date',
    // 'selected_time', 'created_event_id' columns don't exist on golf_availability_polls)
    await supabase
      .from('golf_availability_polls')
      .update({
        status: 'closed',
      })
      .eq('id', pollId);

    revalidatePath('/golf/dashboard/calendar');
    return { success: true, data: { eventId: event.id } };
  } catch (error) {
    console.error('[scheduleEventFromPoll Error]', error);
    return formatSafeErrorResponse(error);
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
      console.error('[closePoll Error]', updateError);
      return { success: false, error: 'Failed to close poll. Please try again.' };
    }

    revalidatePath('/golf/dashboard/calendar');
    return { success: true };
  } catch (error) {
    console.error('[closePoll Error]', error);
    return formatSafeErrorResponse(error);
  }
}
