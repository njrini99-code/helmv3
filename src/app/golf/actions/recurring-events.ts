'use server';

//@ts-nocheck
/* eslint-disable @typescript-eslint/no-explicit-any */

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
import { expandRecurringEvent, fromRRULE, type RecurringEvent, type AcademicExclusion, type ExpandedEvent } from '@/lib/calendar/recurrence';
import { parseISO, format } from 'date-fns';

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
      .select('id, team_id')
      .eq('user_id', user.id)
      .single();

    if (coachError || !coach) {
      return { success: false, error: 'Coach not found' };
    }

    // Validate recurrence rule
    const parsedRule = fromRRULE(input.recurrenceRule);
    if (!parsedRule) {
      return { success: false, error: 'Invalid recurrence rule' };
    }

    // Create the parent recurring event
    const { data: event, error: eventError } = await supabase
      .from('golf_events')
      .insert({
        title: input.title,
        description: input.description,
        event_type: input.eventType as any,
        start_date: input.startDate,
        end_date: input.endDate,
        start_time: input.startTime,
        end_time: input.endTime,
        location: input.location,
        created_by: coach.id,
        team_id: input.teamId || coach.team_id,
        recurrence_rule: input.recurrenceRule,
        requires_rsvp: input.requiresRsvp || false,
        rsvp_deadline: input.rsvpDeadline,
        max_attendees: input.maxAttendees,
      } as any)
      .select('id')
      .single();

    if (eventError) {
      return { success: false, error: eventError.message };
    }

    revalidatePath('/golf/(dashboard)/dashboard/calendar');
    return { success: true, data: { eventId: event.id } };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create recurring event',
    };
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

    switch (input.scope) {
      case 'this': {
        // Create an exception instance for this specific date
        const { error: exceptionError } = await supabase
          .from('golf_events')
          .insert({
            ...parentEvent,
            id: undefined, // Let database generate new ID
            title: input.updates.title || parentEvent.title,
            description: input.updates.description !== undefined ? input.updates.description : parentEvent.description,
            start_date: input.updates.startDate || input.originalStartDate,
            end_date: input.updates.endDate !== undefined ? input.updates.endDate : parentEvent.end_date,
            start_time: input.updates.startTime !== undefined ? input.updates.startTime : parentEvent.start_time,
            end_time: input.updates.endTime !== undefined ? input.updates.endTime : parentEvent.end_time,
            location: input.updates.location !== undefined ? input.updates.location : parentEvent.location,
            recurrence_rule: null, // Exception instances don't have recurrence
            recurrence_parent_id: parentEvent.id,
            original_start_date: input.originalStartDate,
            is_exception: true,
          });

        if (exceptionError) {
          return { success: false, error: exceptionError.message };
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
            return { success: false, error: updateError.message };
          }
        }

        // 2. Create a new series starting from this instance
        const { error: newSeriesError } = await supabase
          .from('golf_events')
          .insert({
            ...parentEvent,
            id: undefined,
            title: input.updates.title || parentEvent.title,
            description: input.updates.description !== undefined ? input.updates.description : parentEvent.description,
            start_date: input.updates.startDate || input.originalStartDate,
            end_date: input.updates.endDate !== undefined ? input.updates.endDate : parentEvent.end_date,
            start_time: input.updates.startTime !== undefined ? input.updates.startTime : parentEvent.start_time,
            end_time: input.updates.endTime !== undefined ? input.updates.endTime : parentEvent.end_time,
            location: input.updates.location !== undefined ? input.updates.location : parentEvent.location,
            recurrence_rule: input.updates.recurrenceRule || parentEvent.recurrence_rule,
            recurrence_parent_id: null, // This is a new parent
          });

        if (newSeriesError) {
          return { success: false, error: newSeriesError.message };
        }
        break;
      }

      case 'all': {
        // Update the parent event
        const updates: any = {};
        if (input.updates.title) updates.title = input.updates.title;
        if (input.updates.description !== undefined) updates.description = input.updates.description;
        if (input.updates.startDate) updates.start_date = input.updates.startDate;
        if (input.updates.endDate !== undefined) updates.end_date = input.updates.endDate;
        if (input.updates.startTime !== undefined) updates.start_time = input.updates.startTime;
        if (input.updates.endTime !== undefined) updates.end_time = input.updates.endTime;
        if (input.updates.location !== undefined) updates.location = input.updates.location;
        if (input.updates.recurrenceRule) updates.recurrence_rule = input.updates.recurrenceRule;

        const { error: updateError } = await supabase
          .from('golf_events')
          .update(updates)
          .eq('id', parentEvent.id);

        if (updateError) {
          return { success: false, error: updateError.message };
        }

        // Also update all exception instances
        if (Object.keys(updates).length > 0) {
          await supabase
            .from('golf_events')
            .update(updates)
            .eq('recurrence_parent_id', parentEvent.id);
        }
        break;
      }
    }

    revalidatePath('/golf/(dashboard)/dashboard/calendar');
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to edit recurring event',
    };
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
        const { error: exclusionError } = await supabase
          .from('golf_event_exclusions')
          .insert({
            event_id: parentEvent.id,
            excluded_date: originalStartDate,
            reason: 'Deleted by user',
          });

        if (exclusionError) {
          return { success: false, error: exclusionError.message };
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
            return { success: false, error: updateError.message };
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
          return { success: false, error: deleteError.message };
        }
        break;
      }
    }

    revalidatePath('/golf/(dashboard)/dashboard/calendar');
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete recurring event',
    };
  }
}

// ============================================================================
// GET EXPANDED EVENTS
// ============================================================================

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

    // Build query for events
    let query = supabase
      .from('golf_events')
      .select('*')
      .or(`recurrence_rule.is.null,and(recurrence_rule.not.is.null,recurrence_parent_id.is.null)`)
      .gte('start_date', startDate)
      .lte('start_date', endDate);

    if (teamId) {
      query = query.eq('team_id', teamId);
    }

    const { data: events, error: eventsError } = await query;

    if (eventsError) {
      return { success: false, error: eventsError.message };
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
    let academicExclusions: AcademicExclusion[] = [];
    if (teamId) {
      const { data: academicData } = await supabase
        .from('golf_academic_exclusions')
        .select('*')
        .eq('team_id', teamId)
        .gte('end_date', startDate)
        .lte('start_date', endDate);

      academicExclusions = (academicData || []).map(exc => ({
        id: exc.id,
        name: exc.name,
        startDate: parseISO(exc.start_date),
        endDate: parseISO(exc.end_date),
        excludePractices: exc.exclude_practices ?? false,
        excludeMatches: exc.exclude_matches ?? false,
        excludeAllEvents: exc.exclude_all_events ?? false,
      }));
    }

    // Expand all events
    const allExpandedEvents: ExpandedEvent[] = [];

    for (const event of events || []) {
      const recurringEvent: RecurringEvent = {
        id: event.id,
        title: event.title,
        eventType: event.event_type,
        startDate: parseISO(event.start_date),
        endDate: event.end_date ? parseISO(event.end_date) : null,
        startTime: event.start_time,
        endTime: event.end_time,
        recurrenceRule: event.recurrence_rule,
        recurrenceParentId: event.recurrence_parent_id,
        originalStartDate: event.original_start_date ? parseISO(event.original_start_date) : null,
        isException: event.is_exception || false,
      };

      const eventExclusions = exclusions
        .filter(exc => exc.event_id === event.id)
        .map(exc => parseISO(exc.excluded_date));

      const expanded = expandRecurringEvent(
        recurringEvent,
        parseISO(startDate),
        parseISO(endDate),
        eventExclusions,
        academicExclusions
      );

      allExpandedEvents.push(...expanded);
    }

    return { success: true, data: allExpandedEvents };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get expanded events',
    };
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
      .select('id, team_id')
      .eq('user_id', user.id)
      .single();

    if (!coach) {
      return { success: false, error: 'Coach not found' };
    }

    const teamId = input.teamId || coach.team_id;
    if (!teamId) {
      return { success: false, error: 'Team ID is required' };
    }

    const { data: exclusion, error: insertError } = await supabase
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
      } as any)
      .select('id')
      .single();

    if (insertError) {
      return { success: false, error: insertError.message };
    }

    revalidatePath('/golf/(dashboard)/dashboard/calendar');
    return { success: true, data: { id: exclusion.id } };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create academic exclusion',
    };
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
      return { success: false, error: deleteError.message };
    }

    revalidatePath('/golf/(dashboard)/dashboard/calendar');
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete academic exclusion',
    };
  }
}
