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
 */

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { formatSafeErrorResponse } from '@/lib/validation/server-action-validator';
import { expandRecurringEvent, fromRRULE, type RecurringEvent, type AcademicExclusion, type ExpandedEvent } from '@/lib/calendar/recurrence';
import { parseISO, format } from 'date-fns';
import { DEFAULT_TIMEZONE, getValidTimezone, parseInTimezone } from '@/lib/calendar/timezone';

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

/**
 * Get the timezone for a team from golf_team_settings
 * Falls back to DEFAULT_TIMEZONE if not set
 */
async function getTeamTimezone(
  supabase: Awaited<ReturnType<typeof createClient>>,
  teamId: string | null
): Promise<string> {
  if (!teamId) return DEFAULT_TIMEZONE;

  const { data: settings } = await supabase
    .from('golf_team_settings')
    .select('timezone')
    .eq('team_id', teamId)
    .maybeSingle();

  return getValidTimezone(settings?.timezone);
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

    // Create the parent recurring event
    // Build start_time and end_time as ISO datetime strings
    const startDateTime = input.startTime
      ? `${input.startDate}T${input.startTime}:00`
      : `${input.startDate}T00:00:00`;
    const endDateTime = input.endTime
      ? `${input.endDate || input.startDate}T${input.endTime}:00`
      : input.endDate
        ? `${input.endDate}T23:59:59`
        : null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: event, error: eventError } = await (supabase as any)
      .from('golf_events')
      .insert({
        title: input.title,
        description: input.description,
        event_type: input.eventType,
        start_time: startDateTime,
        end_time: endDateTime,
        location: input.location,
        created_by: coach.id,
        team_id: input.teamId || coachTeamId,
        recurrence_rule: input.recurrenceRule,
      })
      .select('id')
      .single();

    if (eventError) {
      console.error('[createRecurringEvent Error]', eventError);
      return { success: false, error: 'Failed to create recurring event. Please try again.' };
    }

    revalidatePath('/golf/dashboard/calendar');
    return { success: true, data: { eventId: event.id } };
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

    // Get the parent event
    const { data: parentEvent, error: fetchError } = await supabase
      .from('golf_events')
      .select('*')
      .eq('id', input.eventId)
      .single();

    if (fetchError || !parentEvent) {
      return { success: false, error: 'Event not found' };
    }

    // Verify ownership
    if (parentEvent.created_by !== coach.id) {
      return { success: false, error: 'Not authorized' };
    }

    // Helper to build datetime from date and time parts
    const buildDateTime = (date: string | undefined, time: string | undefined | null, fallbackDateTime: string): string => {
      if (date && time) {
        return `${date}T${time}:00`;
      } else if (date) {
        // Extract time from fallback datetime
        const fallbackTime = fallbackDateTime.includes('T') ? fallbackDateTime.split('T')[1] : '00:00:00';
        return `${date}T${fallbackTime}`;
      }
      return fallbackDateTime;
    };

    switch (input.scope) {
      case 'this': {
        // Create an exception instance for this specific date
        const newStartTime = buildDateTime(
          input.updates.startDate || input.originalStartDate,
          input.updates.startTime,
          parentEvent.start_time
        );
        const newEndTime = input.updates.endTime !== undefined || input.updates.endDate !== undefined
          ? buildDateTime(
              input.updates.endDate || input.originalStartDate,
              input.updates.endTime,
              parentEvent.end_time || parentEvent.start_time
            )
          : parentEvent.end_time;

        const { error: exceptionError } = await supabase
          .from('golf_events')
          .insert({
            title: input.updates.title || parentEvent.title,
            description: input.updates.description !== undefined ? input.updates.description : parentEvent.description,
            event_type: parentEvent.event_type,
            start_time: newStartTime,
            end_time: newEndTime,
            location: input.updates.location !== undefined ? input.updates.location : parentEvent.location,
            created_by: parentEvent.created_by,
            team_id: parentEvent.team_id,
            recurrence_rule: null, // Exception instances don't have recurrence
            parent_event_id: parentEvent.id,
          } as any);

        if (exceptionError) {
          console.error('[editRecurringEvent Error]', exceptionError);
          return { success: false, error: 'Failed to edit event occurrence. Please try again.' };
        }
        break;
      }

      case 'thisAndFuture': {
        // 1. End the current series at the day before this instance
        const originalDate = parseISO(input.originalStartDate);
        const dayBefore = new Date(originalDate);
        dayBefore.setDate(dayBefore.getDate() - 1);

        // Update the original series UNTIL date
        const existingRule = fromRRULE(parentEvent.recurrence_rule!);
        if (existingRule) {
          existingRule.until = format(dayBefore, 'yyyy-MM-dd');
          existingRule.count = undefined; // Clear count if until is set

          const { toRRULE } = await import('@/lib/calendar/recurrence');
          const updatedRule = toRRULE(existingRule);

          const { error: updateError } = await supabase
            .from('golf_events')
            .update({
              recurrence_rule: updatedRule,
            })
            .eq('id', parentEvent.id);

          if (updateError) {
            console.error('[editRecurringEvent Error]', updateError);
            return { success: false, error: 'Failed to update recurring event series. Please try again.' };
          }
        }

        // 2. Create a new series starting from this instance
        const newSeriesStartTime = buildDateTime(
          input.updates.startDate || input.originalStartDate,
          input.updates.startTime,
          parentEvent.start_time
        );
        const newSeriesEndTime = input.updates.endTime !== undefined || input.updates.endDate !== undefined
          ? buildDateTime(
              input.updates.endDate || input.originalStartDate,
              input.updates.endTime,
              parentEvent.end_time || parentEvent.start_time
            )
          : parentEvent.end_time;

        const { error: newSeriesError } = await supabase
          .from('golf_events')
          .insert({
            title: input.updates.title || parentEvent.title,
            description: input.updates.description !== undefined ? input.updates.description : parentEvent.description,
            event_type: parentEvent.event_type,
            start_time: newSeriesStartTime,
            end_time: newSeriesEndTime,
            location: input.updates.location !== undefined ? input.updates.location : parentEvent.location,
            created_by: parentEvent.created_by,
            team_id: parentEvent.team_id,
            recurrence_rule: input.updates.recurrenceRule || parentEvent.recurrence_rule,
            parent_event_id: null, // This is a new parent
          } as any);

        if (newSeriesError) {
          console.error('[editRecurringEvent Error]', newSeriesError);
          return { success: false, error: 'Failed to create new event series. Please try again.' };
        }
        break;
      }

      case 'all': {
        // Update the parent event
        const updates: any = {};
        if (input.updates.title) updates.title = input.updates.title;
        if (input.updates.description !== undefined) updates.description = input.updates.description;
        // For 'all' scope, we need to update start_time/end_time as full datetime
        if (input.updates.startDate || input.updates.startTime !== undefined) {
          updates.start_time = buildDateTime(
            input.updates.startDate,
            input.updates.startTime,
            parentEvent.start_time
          );
        }
        if (input.updates.endDate !== undefined || input.updates.endTime !== undefined) {
          updates.end_time = buildDateTime(
            input.updates.endDate,
            input.updates.endTime,
            parentEvent.end_time || parentEvent.start_time
          );
        }
        if (input.updates.location !== undefined) updates.location = input.updates.location;
        if (input.updates.recurrenceRule) updates.recurrence_rule = input.updates.recurrenceRule;

        const { error: updateError } = await supabase
          .from('golf_events')
          .update(updates)
          .eq('id', parentEvent.id);

        if (updateError) {
          console.error('[editRecurringEvent Error]', updateError);
          return { success: false, error: 'Failed to update all event occurrences. Please try again.' };
        }

        // Also update all exception instances
        if (Object.keys(updates).length > 0) {
          await supabase
            .from('golf_events')
            .update(updates)
            .eq('parent_event_id', parentEvent.id);
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

    // Get the parent event
    const { data: parentEvent, error: fetchError } = await supabase
      .from('golf_events')
      .select('*')
      .eq('id', eventId)
      .single();

    if (fetchError || !parentEvent) {
      return { success: false, error: 'Event not found' };
    }

    // Verify ownership
    if (parentEvent.created_by !== coach.id) {
      return { success: false, error: 'Not authorized' };
    }

    switch (scope) {
      case 'this': {
        // Add this date to event exclusions
        // Note: golf_event_exclusions schema may differ - use (supabase as any)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: exclusionError } = await (supabase as any)
          .from('golf_event_exclusions')
          .insert({
            event_id: parentEvent.id,
            excluded_date: originalStartDate,
            reason: 'Deleted by user',
          });

        if (exclusionError) {
          console.error('[deleteRecurringEvent Error]', exclusionError);
          return { success: false, error: 'Failed to exclude event occurrence. Please try again.' };
        }
        break;
      }

      case 'thisAndFuture': {
        // End the series at the day before this instance
        const originalDate = parseISO(originalStartDate);
        const dayBefore = new Date(originalDate);
        dayBefore.setDate(dayBefore.getDate() - 1);

        const existingRule = fromRRULE(parentEvent.recurrence_rule!);
        if (existingRule) {
          existingRule.until = format(dayBefore, 'yyyy-MM-dd');
          existingRule.count = undefined;

          const { toRRULE } = await import('@/lib/calendar/recurrence');
          const updatedRule = toRRULE(existingRule);

          const { error: updateError } = await supabase
            .from('golf_events')
            .update({
              recurrence_rule: updatedRule,
            })
            .eq('id', parentEvent.id);

          if (updateError) {
            console.error('[deleteRecurringEvent Error]', updateError);
            return { success: false, error: 'Failed to end event series. Please try again.' };
          }
        }
        break;
      }

      case 'all': {
        // Delete the parent event (cascades to exclusions and exceptions)
        const { error: deleteError } = await supabase
          .from('golf_events')
          .delete()
          .eq('id', parentEvent.id);

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
 * Get expanded recurring events for a date range
 *
 * This function handles timezone-aware expansion:
 * 1. Fetches team timezone from golf_team_settings
 * 2. Uses team timezone for interpreting date boundaries
 * 3. Returns expanded events with correct local times
 *
 * @param startDate - Start of date range (ISO string, interpreted in team timezone)
 * @param endDate - End of date range (ISO string, interpreted in team timezone)
 * @param teamId - Optional team ID to filter events
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

    // Get team timezone for proper date interpretation
    const teamTimezone = await getTeamTimezone(supabase, teamId ?? null);

    // Build query for events
    let query = supabase
      .from('golf_events')
      .select('*')
      .or(`recurrence_rule.is.null,and(recurrence_rule.not.is.null,parent_event_id.is.null)`)
      .gte('start_time', startDate)
      .lte('start_time', endDate);

    if (teamId) {
      query = query.eq('team_id', teamId);
    }

    const { data: events, error: eventsError } = await query;

    if (eventsError) {
      console.error('[getExpandedEvents Error]', eventsError);
      return { success: false, error: 'Failed to fetch events. Please try again.' };
    }

    // Get exclusions for all recurring events
    const recurringEventIds = events
      ?.filter(e => e.recurrence_rule)
      .map(e => e.id) || [];

    let exclusions: any[] = [];
    if (recurringEventIds.length > 0) {
      const { data: exclusionData } = await supabase
        .from('golf_event_exclusions')
        .select('*')
        .in('event_id', recurringEventIds);
      exclusions = exclusionData || [];
    }

    // Get academic exclusions for the team
    // Note: golf_academic_exclusions has a simpler schema (player_id, reason, start_date, end_date)
    // The AcademicExclusion interface expects more fields - we provide defaults
    let academicExclusions: AcademicExclusion[] = [];
    if (teamId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: academicData } = await (supabase as any)
        .from('golf_academic_exclusions')
        .select('*')
        .gte('end_date', startDate)
        .lte('start_date', endDate);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      academicExclusions = (academicData || []).map((exc: any) => ({
        id: exc.id,
        name: exc.reason || 'Academic Exclusion', // Use reason as name
        // Parse dates in team timezone for correct boundary interpretation
        startDate: parseInTimezone(exc.start_date, teamTimezone),
        endDate: parseInTimezone(exc.end_date, teamTimezone),
        excludePractices: true, // Default to excluding all events
        excludeMatches: true,
        excludeAllEvents: true,
      }));
    }

    // Expand all events using team timezone for date interpretation
    const allExpandedEvents: ExpandedEvent[] = [];

    // Parse date range boundaries in team timezone
    const rangeStart = parseInTimezone(startDate, teamTimezone);
    const rangeEnd = parseInTimezone(endDate, teamTimezone);

    for (const event of events || []) {
      // Parse event times - these are stored in UTC but we interpret
      // recurring expansions in the team's local timezone
      const recurringEvent: RecurringEvent = {
        id: event.id,
        title: event.title,
        eventType: event.event_type,
        // Parse event start/end times (stored as UTC, parsed to Date)
        startDate: parseISO(event.start_time),
        endDate: event.end_time ? parseISO(event.end_time) : null,
        startTime: null, // Time is embedded in start_time datetime
        endTime: null, // Time is embedded in end_time datetime
        recurrenceRule: event.recurrence_rule,
        recurrenceParentId: event.parent_event_id,
        originalStartDate: null, // Not used in this schema
        isException: false, // Determined by parent_event_id presence
      };

      // Parse exclusion dates in team timezone
      const eventExclusions = exclusions
        .filter(exc => exc.event_id === event.id)
        .map(exc => parseInTimezone(exc.excluded_date, teamTimezone));

      const expanded = expandRecurringEvent(
        recurringEvent,
        rangeStart,
        rangeEnd,
        eventExclusions,
        academicExclusions
      );

      allExpandedEvents.push(...expanded);
    }

    return { success: true, data: allExpandedEvents };
  } catch (error) {
    console.error('[getExpandedEvents Error]', error);
    return formatSafeErrorResponse(error);
  }
}

// ============================================================================
// ACADEMIC EXCLUSIONS
// ============================================================================

export async function createAcademicExclusion(input: {
  name: string;
  startDate: string;
  endDate: string;
  excludePractices: boolean;
  excludeMatches: boolean;
  excludeAllEvents: boolean;
  teamId?: string;
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

    // Note: golf_academic_exclusions may not have all these columns - use (supabase as any)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: exclusion, error: insertError } = await (supabase as any)
      .from('golf_academic_exclusions')
      .insert({
        name: input.name,
        start_date: input.startDate,
        end_date: input.endDate,
        exclude_practices: input.excludePractices,
        exclude_matches: input.excludeMatches,
        exclude_all_events: input.excludeAllEvents,
        team_id: teamId,
        created_by: coach.id,
      })
      .select('id')
      .single();

    if (insertError) {
      console.error('[createAcademicExclusion Error]', insertError);
      return { success: false, error: 'Failed to create academic exclusion. Please try again.' };
    }

    revalidatePath('/golf/dashboard/calendar');
    return { success: true, data: { id: exclusion.id } };
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
