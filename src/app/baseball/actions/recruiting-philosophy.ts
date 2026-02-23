'use server';

import { createClient } from '@/lib/supabase/server';
import { sanitizeDbError } from '@/lib/db-error';
import { revalidatePath } from 'next/cache';
import type {
  CoachRecruitingPhilosophy,
  CoachRecruitingPhilosophyInsert,
  CoachRecruitingPhilosophyUpdate,
  PlayerPercentiles,
} from '@/lib/types';

// Note: Tables 'coach_recruiting_philosophy' and 'player_percentiles' are new.
// Run migration and regenerate Supabase types to remove type assertions.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseAny = any;

// ============================================================================
// RECRUITING PHILOSOPHY CRUD
// ============================================================================

/**
 * Get the current coach's recruiting philosophy.
 */
export async function getRecruitingPhilosophy(): Promise<{
  data: CoachRecruitingPhilosophy | null;
  error: string | null;
}> {
  const supabase = await createClient();

  // Get authenticated user
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { data: null, error: 'Not authenticated' };
  }

  // Get coach record
  const { data: coach, error: coachError } = await (supabase as SupabaseAny)
    .from('baseball_coaches')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (coachError || !coach) {
    return { data: null, error: 'Coach not found' };
  }

  // Get philosophy (table will exist after migration is run)
  const { data, error } = await (supabase as SupabaseAny)
    .from('baseball_coach_recruiting_philosophy')
    .select('*')
    .eq('coach_id', coach.id)
    .single();

  if (error && error.code !== 'PGRST116') {
    // PGRST116 = no rows found, which is OK
    return { data: null, error: sanitizeDbError(error, 'recruiting-philosophy') };
  }

  return { data: data as CoachRecruitingPhilosophy | null, error: null };
}

/**
 * Save the current coach's recruiting philosophy.
 * Creates if doesn't exist, updates if exists.
 */
export async function saveRecruitingPhilosophy(
  philosophy: CoachRecruitingPhilosophyUpdate
): Promise<{ success: boolean; error: string | null }> {
  const supabase = await createClient();

  // Get authenticated user
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { success: false, error: 'Not authenticated' };
  }

  // Get coach record
  const { data: coach, error: coachError } = await (supabase as SupabaseAny)
    .from('baseball_coaches')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (coachError || !coach) {
    return { success: false, error: 'Coach not found' };
  }

  // Check if philosophy exists
  const { data: existing } = await (supabase as SupabaseAny)
    .from('baseball_coach_recruiting_philosophy')
    .select('id')
    .eq('coach_id', coach.id)
    .single();

  if (existing) {
    // Update existing
    const { error: updateError } = await (supabase as SupabaseAny)
      .from('baseball_coach_recruiting_philosophy')
      .update({
        ...philosophy,
        updated_at: new Date().toISOString(),
      })
      .eq('coach_id', coach.id);

    if (updateError) {
      return { success: false, error: updateError.message };
    }
  } else {
    // Insert new
    const insertData: CoachRecruitingPhilosophyInsert = {
      coach_id: coach.id,
      ...philosophy,
    };

    const { error: insertError } = await (supabase as SupabaseAny)
      .from('baseball_coach_recruiting_philosophy')
      .insert(insertData);

    if (insertError) {
      return { success: false, error: insertError.message };
    }
  }

  revalidatePath('/baseball/dashboard/discover');
  revalidatePath('/baseball/dashboard/settings/recruiting-preferences');

  return { success: true, error: null };
}

/**
 * Update specific weights in the philosophy.
 */
export async function updateRecruitingWeights(weights: {
  weight_exit_velocity?: number;
  weight_pitch_velocity?: number;
  weight_sixty_time?: number;
  weight_gpa?: number;
  weight_height?: number;
  weight_weight?: number;
  weight_arm_strength?: number;
}): Promise<{ success: boolean; error: string | null }> {
  return saveRecruitingPhilosophy(weights);
}

/**
 * Update position priorities.
 */
export async function updatePositionPriorities(
  positions: string[]
): Promise<{ success: boolean; error: string | null }> {
  return saveRecruitingPhilosophy({ position_priorities: positions });
}

/**
 * Update minimum standards.
 */
export async function updateMinimumStandards(standards: {
  min_gpa?: number | null;
  min_exit_velocity?: number | null;
  min_pitch_velocity?: number | null;
  max_sixty_time?: number | null;
}): Promise<{ success: boolean; error: string | null }> {
  return saveRecruitingPhilosophy(standards);
}

/**
 * Update geographic preferences.
 */
export async function updateGeographicPreferences(prefs: {
  preferred_states?: string[];
  max_distance_miles?: number | null;
}): Promise<{ success: boolean; error: string | null }> {
  return saveRecruitingPhilosophy(prefs);
}

/**
 * Update target grad years.
 */
export async function updateTargetGradYears(
  gradYears: number[]
): Promise<{ success: boolean; error: string | null }> {
  return saveRecruitingPhilosophy({ target_grad_years: gradYears });
}

/**
 * Reset philosophy to defaults.
 */
export async function resetRecruitingPhilosophy(): Promise<{
  success: boolean;
  error: string | null;
}> {
  const supabase = await createClient();

  // Get authenticated user
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { success: false, error: 'Not authenticated' };
  }

  // Get coach record
  const { data: coach, error: coachError } = await (supabase as SupabaseAny)
    .from('baseball_coaches')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (coachError || !coach) {
    return { success: false, error: 'Coach not found' };
  }

  // Delete existing philosophy (will use defaults)
  const { error: deleteError } = await (supabase as SupabaseAny)
    .from('baseball_coach_recruiting_philosophy')
    .delete()
    .eq('coach_id', coach.id);

  if (deleteError) {
    return { success: false, error: deleteError.message };
  }

  revalidatePath('/baseball/dashboard/discover');
  revalidatePath('/baseball/dashboard/settings/recruiting-preferences');

  return { success: true, error: null };
}

// ============================================================================
// PLAYER PERCENTILES
// ============================================================================

/**
 * Get percentiles for a list of players.
 */
export async function getPlayerPercentiles(
  playerIds: string[]
): Promise<{ data: PlayerPercentiles[]; error: string | null }> {
  if (playerIds.length === 0) {
    return { data: [], error: null };
  }

  const supabase = await createClient();

  const { data, error } = await (supabase as SupabaseAny)
    .from('baseball_player_percentiles')
    .select('*')
    .in('player_id', playerIds);

  if (error) {
    return { data: [], error: sanitizeDbError(error, 'recruiting-philosophy') };
  }

  return { data: data as PlayerPercentiles[], error: null };
}

/**
 * Get percentiles for a single player.
 */
export async function getPlayerPercentile(
  playerId: string
): Promise<{ data: PlayerPercentiles | null; error: string | null }> {
  const supabase = await createClient();

  const { data, error } = await (supabase as SupabaseAny)
    .from('baseball_player_percentiles')
    .select('*')
    .eq('player_id', playerId)
    .single();

  if (error && error.code !== 'PGRST116') {
    return { data: null, error: sanitizeDbError(error, 'recruiting-philosophy') };
  }

  return { data: data as PlayerPercentiles | null, error: null };
}

/**
 * Trigger recalculation of percentiles for a grad year.
 * This calls the database function.
 */
export async function recalculatePercentiles(
  gradYear: number
): Promise<{ success: boolean; error: string | null }> {
  const supabase = await createClient();

  // Verify user is authenticated
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { success: false, error: 'Not authenticated' };
  }

  // Call the database function (custom RPC not in generated types)
  const { error } = await (supabase as SupabaseAny).rpc('calculate_grad_year_percentiles', {
    target_grad_year: gradYear,
  });

  if (error) {
    return { success: false, error: sanitizeDbError(error, 'recruiting-philosophy') };
  }

  return { success: true, error: null };
}

// ============================================================================
// MATCH SCORING (Server-side)
// ============================================================================

/**
 * Calculate match scores for players in a discover query.
 * This is called server-side to enrich player data with match scores.
 */
export async function calculateMatchScoresForPlayers(
  playerIds: string[]
): Promise<{
  scores: Map<string, { match_score: number; breakdown: Record<string, unknown> }>;
  error: string | null;
}> {
  if (playerIds.length === 0) {
    return { scores: new Map(), error: null };
  }

  const supabase = await createClient();

  // Get authenticated user
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { scores: new Map(), error: 'Not authenticated' };
  }

  // Get coach record
  const { data: coach, error: coachError } = await (supabase as SupabaseAny)
    .from('baseball_coaches')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (coachError || !coach) {
    return { scores: new Map(), error: 'Coach not found' };
  }

  // Calculate scores using database function
  const scores = new Map<string, { match_score: number; breakdown: Record<string, unknown> }>();

  for (const playerId of playerIds) {
    // Custom RPC not in generated types
    const { data, error } = await (supabase as SupabaseAny).rpc('calculate_player_match_score', {
      p_player_id: playerId,
      p_coach_id: coach.id,
    });

    if (!error && data && Array.isArray(data) && data.length > 0) {
      const result = data[0] as { match_score: number; score_breakdown: Record<string, unknown> };
      scores.set(playerId, {
        match_score: result.match_score,
        breakdown: result.score_breakdown,
      });
    }
  }

  return { scores, error: null };
}
