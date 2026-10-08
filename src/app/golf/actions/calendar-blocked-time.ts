'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath, updateTag } from 'next/cache';
import { CACHE_TAGS } from '@/lib/cache/tags';
import { z } from 'zod';
// roundTypeToDb was a no-op (identity function) and has been removed.
// Frontend and DB both use 'practice' | 'qualifier' | 'tournament'.
import { formatSafeErrorResponse } from '@/lib/validation/server-action-validator';
import { withAdminObserved } from '@/lib/admin/observed-action';
import type { ActionResult } from './golf-action-shared';

/** Blocked time update data */
interface BlockedTimeUpdateData {
  title?: string;
  start_date?: string;
  end_date?: string;
  start_time?: string;
  end_time?: string;
  all_day?: boolean;
  is_recurring?: boolean;
  recurrence_rule?: string | null;
  description?: string | null;
}
/** Coach blocked time period */
export interface BlockedTimePeriod {
  id: string;
  coach_id: string;
  start_date: string;
  end_date: string;
  start_time: string | null;
  end_time: string | null;
  is_recurring: boolean | null;
  reason: string | null;
  recurrence_rule: string | null;
  created_at: string | null;
  updated_at: string | null;
}
// ============================================================================
// COACH BLOCKED TIME MANAGEMENT
// ============================================================================

const blockedTimeSchema = z.object({
  title: z.string().min(1).max(200),
  startDate: z.string(),
  endDate: z.string().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  allDay: z.boolean().optional(),
  recurrenceRule: z.string().optional(),
  description: z.string().max(1000).optional(),
});
/**
 * Add coach blocked time
 */
async function addCoachBlockedTimeImpl(
  data: z.infer<typeof blockedTimeSchema>
): Promise<ActionResult<{ id: string }>> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    // Get coach ID
    const { data: coach, error: coachError } = await supabase
      .from('golf_coaches')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (coachError || !coach) {
      return { success: false, error: 'Coach profile not found' };
    }

    // Validate input
    const validatedData = blockedTimeSchema.parse(data);

    // Insert blocked time
    const { data: blockedTime, error } = await supabase
      .from('golf_coach_blocked_time')
      .insert({
        coach_id: coach.id,
        title: validatedData.title,
        start_date: validatedData.startDate,
        end_date: validatedData.endDate || validatedData.startDate,
        start_time: validatedData.startTime || null,
        end_time: validatedData.endTime || null,
        all_day: validatedData.allDay || false,
        is_recurring: Boolean(validatedData.recurrenceRule),
        recurrence_rule: validatedData.recurrenceRule || null,
        description: validatedData.description || null,
      })
      .select('id')
      .single();

    if (error) {
      return { success: false, error: 'Failed to add blocked time' };
    }

    revalidatePath('/golf/dashboard/calendar');
    updateTag(CACHE_TAGS.CALENDAR);

    return { success: true, data: { id: blockedTime.id } };

  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: 'Invalid blocked time data' };
    }
    return formatSafeErrorResponse(error);
  }
}
const observedAddCoachBlockedTime = withAdminObserved(
  'addCoachBlockedTime',
  { demoSafe: true, sport: 'golf', feature: 'calendar_events' },
  addCoachBlockedTimeImpl,
);
export async function addCoachBlockedTime(
  data: z.infer<typeof blockedTimeSchema>
): Promise<ActionResult<{ id: string }>> {
  return observedAddCoachBlockedTime(data);
}
/**
 * Delete coach blocked time
 */
async function deleteCoachBlockedTimeImpl(id: string): Promise<ActionResult<void>> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    // Get coach ID
    const { data: coach, error: coachError } = await supabase
      .from('golf_coaches')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (coachError || !coach) {
      return { success: false, error: 'Coach profile not found' };
    }

    // Verify blocked time exists and belongs to this coach
    const { data: existing } = await supabase
      .from('golf_coach_blocked_time')
      .select('id')
      .eq('id', id)
      .eq('coach_id', coach.id)
      .maybeSingle();

    if (!existing) {
      return { success: false, error: 'Blocked time not found' };
    }

    // Delete blocked time
    const { error } = await supabase
      .from('golf_coach_blocked_time')
      .delete()
      .eq('id', id)
      .eq('coach_id', coach.id);

    if (error) {
      return { success: false, error: 'Failed to delete blocked time' };
    }

    revalidatePath('/golf/dashboard/calendar');
    updateTag(CACHE_TAGS.CALENDAR);

    return { success: true, data: undefined };

  } catch (error) {
    return formatSafeErrorResponse(error);
  }
}
const observedDeleteCoachBlockedTime = withAdminObserved(
  'deleteCoachBlockedTime',
  { demoSafe: true, sport: 'golf', feature: 'calendar_events' },
  deleteCoachBlockedTimeImpl,
);
export async function deleteCoachBlockedTime(id: string): Promise<ActionResult<void>> {
  return observedDeleteCoachBlockedTime(id);
}
/**
 * Update coach blocked time
 */
async function updateCoachBlockedTimeImpl(
  id: string,
  data: Partial<z.infer<typeof blockedTimeSchema>>
): Promise<ActionResult<void>> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    // Get coach ID
    const { data: coach, error: coachError } = await supabase
      .from('golf_coaches')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (coachError || !coach) {
      return { success: false, error: 'Coach profile not found' };
    }

    // Verify blocked time exists and belongs to this coach
    const { data: existing } = await supabase
      .from('golf_coach_blocked_time')
      .select('id')
      .eq('id', id)
      .eq('coach_id', coach.id)
      .maybeSingle();

    if (!existing) {
      return { success: false, error: 'Blocked time not found' };
    }

    // Build update object
    const updates: BlockedTimeUpdateData = {};
    if (data.title !== undefined) updates.title = data.title;
    if (data.startDate !== undefined) updates.start_date = data.startDate;
    if (data.endDate !== undefined) updates.end_date = data.endDate;
    if (data.startTime !== undefined) updates.start_time = data.startTime;
    if (data.endTime !== undefined) updates.end_time = data.endTime;
    if (data.allDay !== undefined) updates.all_day = data.allDay;
    if (data.recurrenceRule !== undefined) {
      updates.recurrence_rule = data.recurrenceRule || null;
      updates.is_recurring = Boolean(data.recurrenceRule);
    }
    if (data.description !== undefined) updates.description = data.description;

    // Update blocked time
    const { error } = await supabase
      .from('golf_coach_blocked_time')
      .update(updates)
      .eq('id', id)
      .eq('coach_id', coach.id);

    if (error) {
      return { success: false, error: 'Failed to update blocked time' };
    }

    revalidatePath('/golf/dashboard/calendar');
    updateTag(CACHE_TAGS.CALENDAR);

    return { success: true, data: undefined };

  } catch (error) {
    return formatSafeErrorResponse(error);
  }
}
const observedUpdateCoachBlockedTime = withAdminObserved(
  'updateCoachBlockedTime',
  { demoSafe: true, sport: 'golf', feature: 'calendar_events' },
  updateCoachBlockedTimeImpl,
);
export async function updateCoachBlockedTime(
  id: string,
  data: Partial<z.infer<typeof blockedTimeSchema>>
): Promise<ActionResult<void>> {
  return observedUpdateCoachBlockedTime(id, data);
}
/**
 * Get coach blocked time periods
 */
async function getCoachBlockedTimeImpl(
  startDate: string,
  endDate: string
): Promise<ActionResult<BlockedTimePeriod[]>> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    // Get coach ID
    const { data: coach, error: coachError } = await supabase
      .from('golf_coaches')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (coachError || !coach) {
      return { success: false, error: 'Coach profile not found' };
    }

    // Query blocked time in date range
    const { data: blockedTimes, error } = await supabase
      .from('golf_coach_blocked_time')
      .select('*')
      .eq('coach_id', coach.id)
      .gte('end_date', startDate)
      .lte('start_date', endDate)
      .order('start_date', { ascending: true });

    if (error) {
      return { success: false, error: 'Failed to fetch blocked time' };
    }

    return { success: true, data: blockedTimes || [] };

  } catch (error) {
    return formatSafeErrorResponse(error);
  }
}
const observedGetCoachBlockedTime = withAdminObserved(
  'getCoachBlockedTime',
  { sport: 'golf', feature: 'calendar_events' },
  getCoachBlockedTimeImpl,
);
export async function getCoachBlockedTime(
  startDate: string,
  endDate: string
): Promise<ActionResult<BlockedTimePeriod[]>> {
  return observedGetCoachBlockedTime(startDate, endDate);
}
