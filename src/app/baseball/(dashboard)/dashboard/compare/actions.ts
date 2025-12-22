'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { PlayerComparisonInsert } from '@/lib/types';

interface SaveComparisonParams {
  name: string;
  description?: string;
  playerIds: string[];
  comparisonData?: Record<string, any>;
}

export async function saveComparison(params: SaveComparisonParams) {
  const supabase = await createClient();

  // Get current user
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { error: 'Unauthorized' };
  }

  // Get coach record
  const { data: coach, error: coachError } = await supabase
    .from('coaches')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (coachError || !coach) {
    return { error: 'Coach not found' };
  }

  // Validate player IDs
  if (!params.playerIds || params.playerIds.length < 2) {
    return { error: 'At least 2 players required for comparison' };
  }

  if (params.playerIds.length > 4) {
    return { error: 'Maximum 4 players allowed' };
  }

  // Validate name
  if (!params.name || params.name.trim().length === 0) {
    return { error: 'Comparison name is required' };
  }

  // Create comparison insert object
  const comparisonInsert: PlayerComparisonInsert = {
    coach_id: coach.id,
    name: params.name.trim(),
    description: params.description?.trim() || null,
    player_ids: params.playerIds,
    comparison_data: params.comparisonData || {},
  };

  // Insert into database
  const { data: comparison, error: insertError } = await supabase
    .from('player_comparisons')
    .insert(comparisonInsert)
    .select()
    .single();

  if (insertError) {
    console.error('Error saving comparison:', insertError);
    return { error: 'Failed to save comparison' };
  }

  // Revalidate the comparisons page
  revalidatePath('/baseball/dashboard/compare');
  revalidatePath('/baseball/dashboard/comparisons');

  return { success: true, comparison };
}

export async function deleteComparison(comparisonId: string) {
  const supabase = await createClient();

  // Get current user
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { error: 'Unauthorized' };
  }

  // Get coach record
  const { data: coach, error: coachError } = await supabase
    .from('coaches')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (coachError || !coach) {
    return { error: 'Coach not found' };
  }

  // Delete comparison (RLS will ensure only coach's own comparisons can be deleted)
  const { error: deleteError } = await supabase
    .from('player_comparisons')
    .delete()
    .eq('id', comparisonId)
    .eq('coach_id', coach.id);

  if (deleteError) {
    console.error('Error deleting comparison:', deleteError);
    return { error: 'Failed to delete comparison' };
  }

  // Revalidate the comparisons page
  revalidatePath('/baseball/dashboard/compare');
  revalidatePath('/baseball/dashboard/comparisons');

  return { success: true };
}

export async function getSavedComparisons() {
  const supabase = await createClient();

  // Get current user
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { error: 'Unauthorized', comparisons: [] };
  }

  // Get coach record
  const { data: coach, error: coachError } = await supabase
    .from('coaches')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (coachError || !coach) {
    return { error: 'Coach not found', comparisons: [] };
  }

  // Fetch comparisons
  const { data: comparisons, error: fetchError } = await supabase
    .from('player_comparisons')
    .select('*')
    .eq('coach_id', coach.id)
    .order('created_at', { ascending: false });

  if (fetchError) {
    console.error('Error fetching comparisons:', fetchError);
    return { error: 'Failed to fetch comparisons', comparisons: [] };
  }

  // Transform to match PlayerComparison type
  const typedComparisons = (comparisons || []).map(comp => ({
    ...comp,
    comparison_data: comp.comparison_data as Record<string, any>
  }));

  return { comparisons: typedComparisons };
}
