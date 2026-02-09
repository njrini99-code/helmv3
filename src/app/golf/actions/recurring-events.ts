'use server';

/**
 * Server Actions for Recurring Events
 *
 * Handles:
 * - Creating recurring events with RRULE
 * - Editing recurring events (this/thisAndFuture/all)
 * - Deleting recurring events with scope
 * - Expanding recurring events for display
 * - Managing event exclusions and academic exclusions
 *
 * NOTE: The golf_events table does NOT have recurrence_rule or parent_event_id columns.
 * Recurring events are implemented by creating individual event rows for each occurrence.
 * The recurrence logic lives in the client/lib layer for expansion, but storage is flat.
 */

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { formatSafeErrorResponse } from '@/lib/validation/server-action-validator';
import { fromRRULE, type ExpandedEvent } from '@/lib/calendar/recurrence';
import { parseISO, format, addDays, addWeeks, addMonths, isBefore } from 'date-fns';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get team_id for a coach via organization lookup
 * Note: golf_coaches doesn't have team_id directly - we get it from golf_teams via organization_id
 */
async function getCoachTeamId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string | null
): Promise<string | null> {
  if (!organizationId) return null;
  const { data: team } = await supabase
    .from('golf_teams')
    .select('id')
    .eq('organization_id', organizationId)
    .maybeSingle();
  return team?.id ?? null;
}

// ============================================================================
// TYPES
// ============================================================================

export type RecurringEditScope = 'this' | 'thisAndFuture' | 'all';

interface ActionResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

interface CreateRecurringEventInput {
  title: string;
  description?: string;
  eventType: string;
  startDate: string; // ISO date
  endDate?: string; // ISO date
  startTime?: string; // HH:mm
  endTime?: string; // HH:mm
  location?: string;
  recurrenceRule: string; // RRULE string
  requiresRsvp?: boolean;
  rsvpDeadline?: string;
  maxAttendees?: number;
  teamId?: string;
}

interface EditRecurringEventInput {
  eventId: string;
  originalStartDate: string; // ISO date - identifies which instance
  scope: RecurringEditScope;
  updates: {
    title?: string;
    description?: string;
    startDate?: string;
    endDate?: string;
    startTime?: string;
    endTime?: string;
    location?: string;
    recurrenceRule?: string;
  };
}

// ============================================================================
// HELPER: Generate occurrence dates from RRULE
// ============================================================================

/**
 * Generate individual event occurrences from a recurrence rule.
 * Since golf_events doesn't have recurrence_rule/parent_event_id columns,
 * we create one row per occurrence.
 */
function generateOccurrenceDates(
  startDate: string,
  recurrenceRule: string,
  maxOccurrences: number = 52
): string[] {
  const parsed = fromRRULE(recurrenceRule);
  if (!parsed) return [startDate];

  const dates: string[] = [];
  let current = parseISO(startDate);
  const until = parsed.until ? parseISO(parsed.until) : addMonths(current, 12);
  const count = parsed.count || maxOccurrences;

  while (dates.length < count && isBefore(current, until)) {
    dates.push(format(current, 'yyyy-MM-dd'));

    switch (parsed.frequency) {
      case 'daily':
        current = addDays(current, parsed.interval || 1);
        break;
      case 'weekly':
        current = addWeeks(current, parsed.interval || 1);
        break;
      case 'monthly':
        current = addMonths(current, parsed.interval || 1);
        break;
      default:
        current = addWeeks(current, 1);
    }
  }

  return dates;
}

// ============================================================================
// CREATE RECURRING EVENT
// ============================================================================

export async function createRecurringEvent(
  input: CreateRecurringEventInput
): Promise<ActionResult<{ eventId: string }>> {
  try {
    const supabase = await createClient();

    // Get current coach
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return { success: false, error: 'Not authenticated' };
    }

    const { data: coach, error: coachError } = await supabase
      .from('golf_coaches')
      .select('id, organization_id')
      .eq('user_id', user.id)
      .single();

    if (coachError || !coach) {
      return { success: false, error: 'Coach not found' };
    }

    // Get team_id via organization
    const coachTeamId = await getCoachTeamId(supabase, coach.organization_id);

    // Validate recurrence rule
    const parsedRule = fromRRULE(input.recurrenceRule);
    if (!parsedRule) {
      return { success: false, error: 'Invalid recurrence rule' };
    }

    // Generate occurrence dates
    const occurrenceDates = generateOccurrenceDates(input.startDate, input.recurrenceRule);

    if (occurrenceDates.length === 0) {
      return { success: false, error: 'No occurrences generated from recurrence rule' };
    }

    // Create individual events for each occurrence
    // golf_events schema: start_time (required), end_time (nullable), no start_date/end_date
    const teamId = input.teamId || coachTeamId;
    const events = occurrenceDates.map(date => ({
      title: input.title,
      description: input.description || null,
      event_type: input.eventType,
      start_time: input.startTime ? `${date}T${input.startTime}` : `${date}T00:00:00`,
      end_time: input.endTime ? `${date}T${input.endTime}` : null,
      location: input.location || null,
      created_by: coach.id,
      team_id: teamId,
      status: 'confirmed',
      requires_rsvp: input.requiresRsvp || false,
      rsvp_deadline: input.rsvpDeadline || null,
      max_attendees: input.maxAttendees || null,
    }));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: createdEvents, error: eventError } = await (supabase as any)
      .from('golf_events')
      .insert(events)
      .select('id');

    if (eventError) {
      console.error('[createRecurringEvent Error]', eventError);
      return { success: false, error: 'Failed to create recurring event. Please try again.' };
    }

    revalidatePath('/golf/dashboard/calendar');
    return { success: true, data: { eventId: createdEvents?.[0]?.id || '' } };
  } catch (error) {
    console.error('[createRecurringEvent Error]', error);
    return formatSafeErrorResponse(error);
  }
}

// ============================================================================
// EDIT RECURRING EVENT
// ============================================================================

export async function editRecurringEvent(
  input: EditRecurringEventInput
): Promise<ActionResult> {
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

    // Get the target event
    const { data: targetEvent, error: fetchError } = await supabase
      .from('golf_events')
      .select('*')
      .eq('id', input.eventId)
      .single();

    if (fetchError || !targetEvent) {
      return { success: false, error: 'Event not found' };
    }

    // Verify ownership
    if (targetEvent.created_by !== coach.id) {
      return { success: false, error: 'Not authorized' };
    }

    // Build update object from provided fields
    // golf_events uses start_time/end_time (ISO timestamps), no start_date/end_date
    const updates: Record<string, unknown> = {};
    if (input.updates.title) updates.title = input.updates.title;
    if (input.updates.description !== undefined) updates.description = input.updates.description;
    if (input.updates.startDate && input.updates.startTime) {
      updates.start_time = `${input.updates.startDate}T${input.updates.startTime}`;
    } else if (input.updates.startDate) {
      updates.start_time = `${input.updates.startDate}T00:00:00`;
    }
    if (input.updates.endDate !== undefined && input.updates.endTime) {
      updates.end_time = `${input.updates.endDate}T${input.updates.endTime}`;
    } else if (input.updates.endTime !== undefined) {
      updates.end_time = input.updates.endTime;
    }
    if (input.updates.location !== undefined) updates.location = input.updates.location;

    switch (input.scope) {
      case 'this': {
        // Edit just this single event
        const { error: updateError } = await supabase
          .from('golf_events')
          .update(updates)
          .eq('id', input.eventId);

        if (updateError) {
          console.error('[editRecurringEvent Error]', updateError);
          return { success: false, error: 'Failed to edit event occurrence. Please try again.' };
        }
        break;
      }

      case 'thisAndFuture': {
        // Update this event and all future events with the same title/team
        const { error: updateError } = await supabase
          .from('golf_events')
          .update(updates)
          .eq('team_id', targetEvent.team_id)
          .eq('title', targetEvent.title)
          .eq('event_type', targetEvent.event_type)
          .gte('start_time', input.originalStartDate);

        if (updateError) {
          console.error('[editRecurringEvent Error]', updateError);
          return { success: false, error: 'Failed to update future event occurrences. Please try again.' };
        }
        break;
      }

      case 'all': {
        // Update all events with the same title/team/type
        const { error: updateError } = await supabase
          .from('golf_events')
          .update(updates)
          .eq('team_id', targetEvent.team_id)
          .eq('title', targetEvent.title)
          .eq('event_type', targetEvent.event_type);

        if (updateError) {
          console.error('[editRecurringEvent Error]', updateError);
          return { success: false, error: 'Failed to update all event occurrences. Please try again.' };
        }
        break;
      }
    }

    revalidatePath('/golf/dashboard/calendar');
    return { success: true };
  } catch (error) {
    console.error('[editRecurringEvent Error]', error);
    return formatSafeErrorResponse(error);
  }
}

// ============================================================================
// DELETE RECURRING EVENT
// ============================================================================

export async function deleteRecurringEvent(
  eventId: string,
  originalStartDate: string,
  scope: RecurringEditScope
): Promise<ActionResult> {
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

    // Get the target event
    const { data: targetEvent, error: fetchError } = await supabase
      .from('golf_events')
      .select('*')
      .eq('id', eventId)
      .single();

    if (fetchError || !targetEvent) {
      return { success: false, error: 'Event not found' };
    }

    // Verify ownership
    if (targetEvent.created_by !== coach.id) {
      return { success: false, error: 'Not authorized' };
    }

    switch (scope) {
      case 'this': {
        // Delete just this single event
        const { error: deleteError } = await supabase
          .from('golf_events')
          .delete()
          .eq('id', eventId);

        if (deleteError) {
          console.error('[deleteRecurringEvent Error]', deleteError);
          return { success: false, error: 'Failed to delete event occurrence. Please try again.' };
        }
        break;
      }

      case 'thisAndFuture': {
        // Delete this and all future events with same title/team/type
        const { error: deleteError } = await supabase
          .from('golf_events')
          .delete()
          .eq('team_id', targetEvent.team_id)
          .eq('title', targetEvent.title)
          .eq('event_type', targetEvent.event_type)
          .gte('start_time', originalStartDate);

        if (deleteError) {
          console.error('[deleteRecurringEvent Error]', deleteError);
          return { success: false, error: 'Failed to delete future event occurrences. Please try again.' };
        }
        break;
      }

      case 'all': {
        // Delete all events with same title/team/type
        const { error: deleteError } = await supabase
          .from('golf_events')
          .delete()
          .eq('team_id', targetEvent.team_id)
          .eq('title', targetEvent.title)
          .eq('event_type', targetEvent.event_type);

        if (deleteError) {
          console.error('[deleteRecurringEvent Error]', deleteError);
          return { success: false, error: 'Failed to delete event series. Please try again.' };
        }
        break;
      }
    }

    revalidatePath('/golf/dashboard/calendar');
    return { success: true };
  } catch (error) {
    console.error('[deleteRecurringEvent Error]', error);
    return formatSafeErrorResponse(error);
  }
}

// ============================================================================
// GET EXPANDED EVENTS
// ============================================================================

/**
 * Get events for a date range.
 * Since we store individual occurrences (no recurrence_rule column),
 * this is a simple date-range query.
 */
export async function getExpandedEvents(
  startDate: string,
  endDate: string,
  teamId?: string
): Promise<ActionResult<ExpandedEvent[]>> {
  try {
    const supabase = await createClient();

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return { success: false, error: 'Not authenticated' };
    }

    // Build query for events in date range
    // golf_events uses start_time (ISO timestamp), not start_date
    let query = supabase
      .from('golf_events')
      .select('*')
      .gte('start_time', startDate)
      .lte('start_time', endDate)
      .neq('status', 'cancelled');

    if (teamId) {
      query = query.eq('team_id', teamId);
    }

    const { data: events, error: eventsError } = await query.order('start_time', { ascending: true });

    if (eventsError) {
      console.error('[getExpandedEvents Error]', eventsError);
      return { success: false, error: 'Failed to fetch events. Please try again.' };
    }

    // Map to ExpandedEvent format
    const expandedEvents: ExpandedEvent[] = (events || []).map(event => {
      const eventStartDate = event.start_time ? parseISO(event.start_time) : new Date();
      return {
        id: event.id,
        parentId: event.parent_event_id || null,
        title: event.title,
        eventType: event.event_type,
        startDate: eventStartDate,
        endDate: event.end_time ? parseISO(event.end_time) : null,
        startTime: event.start_time || null,
        endTime: event.end_time || null,
        isRecurringInstance: false,
        originalStartDate: eventStartDate,
      };
    });

    return { success: true, data: expandedEvents };
  } catch (error) {
    console.error('[getExpandedEvents Error]', error);
    return formatSafeErrorResponse(error);
  }
}

// ============================================================================
// ACADEMIC EXCLUSIONS
// ============================================================================

/**
 * Create an academic exclusion period.
 * golf_academic_exclusions schema: player_id, start_date, end_date, reason, excluded_by
 */
export async function createAcademicExclusion(input: {
  name: string;
  startDate: string;
  endDate: string;
  excludePractices: boolean;
  excludeMatches: boolean;
  excludeAllEvents: boolean;
  teamId?: string;
  playerIds?: string[]; // Players to exclude
}): Promise<ActionResult<{ id: string }>> {
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

    const coachTeamId = await getCoachTeamId(supabase, coach.organization_id);
    const teamId = input.teamId || coachTeamId;
    if (!teamId) {
      return { success: false, error: 'Team ID is required' };
    }

    // If specific playerIds provided, create exclusions for each
    // Otherwise, get all team members and create exclusions for all
    let playerIds = input.playerIds;
    if (!playerIds || playerIds.length === 0) {
      const { data: members } = await supabase
        .from('golf_team_members')
        .select('player_id')
        .eq('team_id', teamId);
      playerIds = (members || []).map(m => m.player_id);
    }

    if (playerIds.length === 0) {
      return { success: false, error: 'No players found to exclude' };
    }

    // Build reason from exclusion settings
    const reasonParts = [input.name];
    if (!input.excludeAllEvents) {
      if (input.excludePractices) reasonParts.push('(practices)');
      if (input.excludeMatches) reasonParts.push('(matches)');
    }
    const reason = reasonParts.join(' ');

    // Insert academic exclusions - one per player
    // Schema: player_id (NOT NULL), start_date, end_date, reason, excluded_by
    const exclusions = playerIds.map(playerId => ({
      player_id: playerId,
      start_date: input.startDate,
      end_date: input.endDate,
      reason,
      excluded_by: coach.id,
    }));

    const { data: result, error: insertError } = await supabase
      .from('golf_academic_exclusions')
      .insert(exclusions)
      .select('id');

    if (insertError) {
      console.error('[createAcademicExclusion Error]', insertError);
      return { success: false, error: 'Failed to create academic exclusion. Please try again.' };
    }

    revalidatePath('/golf/dashboard/calendar');
    return { success: true, data: { id: result?.[0]?.id || '' } };
  } catch (error) {
    console.error('[createAcademicExclusion Error]', error);
    return formatSafeErrorResponse(error);
  }
}

export async function deleteAcademicExclusion(id: string): Promise<ActionResult> {
  try {
    const supabase = await createClient();

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return { success: false, error: 'Not authenticated' };
    }

    const { error: deleteError } = await supabase
      .from('golf_academic_exclusions')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('[deleteAcademicExclusion Error]', deleteError);
      return { success: false, error: 'Failed to delete academic exclusion. Please try again.' };
    }

    revalidatePath('/golf/dashboard/calendar');
    return { success: true };
  } catch (error) {
    console.error('[deleteAcademicExclusion Error]', error);
    return formatSafeErrorResponse(error);
  }
}
