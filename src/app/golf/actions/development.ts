'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

// ============================================================================
// TYPES
// ============================================================================

export interface DevelopmentActionResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

interface CreateFocusAreaData {
  player_id: string;
  coach_id: string;
  area_type: string;
  title: string;
  description: string | null;
  priority: number;
  target_metric: string | null;
  current_value: number | null;
  target_value: number | null;
}

interface UpdateFocusAreaData {
  area_type?: string;
  title?: string;
  description?: string | null;
  priority?: number;
  status?: string;
  target_metric?: string | null;
  current_value?: number | null;
  target_value?: number | null;
  completed_at?: string | null;
}

// ============================================================================
// FOCUS AREA OPERATIONS
// ============================================================================

/**
 * Create a new focus area for a player
 * Only coaches can create focus areas
 */
export async function createFocusArea(
  data: CreateFocusAreaData
): Promise<DevelopmentActionResult> {
  const supabase = await createClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return { success: false, error: 'Not authenticated' };
  }

  // Verify user is a coach
  const { data: coach, error: coachError } = await supabase
    .from('golf_coaches')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (coachError || !coach) {
    return { success: false, error: 'Not authorized to create focus areas' };
  }

  const { error } = await supabase.from('golf_player_focus_areas').insert({
    player_id: data.player_id,
    coach_id: data.coach_id,
    area_type: data.area_type,
    title: data.title,
    description: data.description,
    priority: data.priority,
    status: 'active',
    target_metric: data.target_metric,
    current_value: data.current_value,
    target_value: data.target_value,
    source: 'coach',
    started_at: new Date().toISOString(),
  });

  if (error) {
    console.error('Failed to create focus area:', error);
    return { success: false, error: 'Failed to create focus area. Please try again.' };
  }

  revalidatePath('/golf/dashboard/development');
  revalidatePath('/golf/dashboard/my-development');

  return { success: true };
}

/**
 * Update an existing focus area
 * Only coaches can update focus areas
 */
export async function updateFocusArea(
  id: string,
  data: UpdateFocusAreaData
): Promise<DevelopmentActionResult> {
  const supabase = await createClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return { success: false, error: 'Not authenticated' };
  }

  // Verify user is a coach
  const { data: coach, error: coachError } = await supabase
    .from('golf_coaches')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (coachError || !coach) {
    return { success: false, error: 'Not authorized to update focus areas' };
  }

  const { error } = await supabase
    .from('golf_player_focus_areas')
    .update({
      ...data,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) {
    console.error('Failed to update focus area:', error);
    return { success: false, error: 'Failed to update focus area. Please try again.' };
  }

  revalidatePath('/golf/dashboard/development');
  revalidatePath('/golf/dashboard/my-development');

  return { success: true };
}

/**
 * Delete a focus area
 * Only coaches can delete focus areas
 */
export async function deleteFocusArea(id: string): Promise<DevelopmentActionResult> {
  const supabase = await createClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return { success: false, error: 'Not authenticated' };
  }

  // Verify user is a coach
  const { data: coach, error: coachError } = await supabase
    .from('golf_coaches')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (coachError || !coach) {
    return { success: false, error: 'Not authorized to delete focus areas' };
  }

  const { error } = await supabase
    .from('golf_player_focus_areas')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Failed to delete focus area:', error);
    return { success: false, error: 'Failed to delete focus area. Please try again.' };
  }

  revalidatePath('/golf/dashboard/development');
  revalidatePath('/golf/dashboard/my-development');

  return { success: true };
}

/**
 * Update progress on a focus area
 * Players or coaches can update progress
 */
export async function updateFocusAreaProgress(
  id: string,
  currentValue: number
): Promise<DevelopmentActionResult> {
  const supabase = await createClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return { success: false, error: 'Not authenticated' };
  }

  const { error } = await supabase
    .from('golf_player_focus_areas')
    .update({
      current_value: currentValue,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) {
    console.error('Failed to update focus area progress:', error);
    return { success: false, error: 'Failed to update progress. Please try again.' };
  }

  revalidatePath('/golf/dashboard/development');
  revalidatePath('/golf/dashboard/my-development');

  return { success: true };
}
