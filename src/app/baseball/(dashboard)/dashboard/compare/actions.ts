'use server';

import { withAdminObserved } from '@/lib/admin/observed-action';
import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

interface SaveComparisonParams {
  name: string;
  notes?: string;
  playerIds: string[];
}

async function saveComparisonImpl(params: SaveComparisonParams) {
  const supabase = await createClient();

  // Get current user
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { error: 'Unauthorized' };
  }

  // Get coach record
  const { data: coach, error: coachError } = await supabase
    .from('baseball_coaches')
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

  // Insert into database
  // Database columns: coach_id, name, notes, player_ids
  const { data: comparison, error: insertError } = await supabase
    .from('baseball_player_comparisons')
    .insert({
      coach_id: coach.id,
      name: params.name.trim(),
      notes: params.notes?.trim() || null,
      player_ids: params.playerIds,
    })
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

async function deleteComparisonImpl(comparisonId: string) {
  const supabase = await createClient();

  // Get current user
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { error: 'Unauthorized' };
  }

  // Get coach record
  const { data: coach, error: coachError } = await supabase
    .from('baseball_coaches')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (coachError || !coach) {
    return { error: 'Coach not found' };
  }

  // Delete comparison (RLS will ensure only coach's own comparisons can be deleted)
  const { error: deleteError } = await supabase
    .from('baseball_player_comparisons')
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

interface SavedComparison {
  id: string;
  coach_id: string;
  name: string | null;
  notes: string | null;
  player_ids: string[];
  created_at: string | null;
  updated_at: string | null;
}

async function getSavedComparisonsImpl() {
  const supabase = await createClient();

  // Get current user
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { error: 'Unauthorized', comparisons: [] as SavedComparison[] };
  }

  // Get coach record
  const { data: coach, error: coachError } = await supabase
    .from('baseball_coaches')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (coachError || !coach) {
    return { error: 'Coach not found', comparisons: [] as SavedComparison[] };
  }

  // Fetch comparisons
  const { data: comparisons, error: fetchError } = await supabase
    .from('baseball_player_comparisons')
    .select('*')
    .eq('coach_id', coach.id)
    .order('created_at', { ascending: false });

  if (fetchError) {
    console.error('Error fetching comparisons:', fetchError);
    return { error: 'Failed to fetch comparisons', comparisons: [] as SavedComparison[] };
  }

  return { comparisons: (comparisons || []) as SavedComparison[] };
}

export const saveComparison = withAdminObserved(
  'saveComparison',
  { sport: 'baseball', feature: 'baseball_compare', featureArea: 'baseball-compare' },
  saveComparisonImpl,
);

export const deleteComparison = withAdminObserved(
  'deleteComparison',
  { sport: 'baseball', feature: 'baseball_compare', featureArea: 'baseball-compare' },
  deleteComparisonImpl,
);

export const getSavedComparisons = withAdminObserved(
  'getSavedComparisons',
  { sport: 'baseball', feature: 'baseball_compare', featureArea: 'baseball-compare' },
  getSavedComparisonsImpl,
);
