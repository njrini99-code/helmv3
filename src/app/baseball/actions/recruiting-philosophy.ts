'use server';

import { withAdminObserved } from '@/lib/admin/observed-action';
import { createClient } from '@/lib/supabase/server';
import { sanitizeDbError } from '@/lib/db-error';
import { revalidatePath } from 'next/cache';
import { logServerError } from '@/lib/server-error-logger';
import { BaseballCapabilityError } from '@/lib/baseball/capabilities';
import {
  withBaseballAction,
  BaseballUnauthorizedError,
  BaseballNoActiveTeamError,
  BaseballActionError,
} from '@/lib/baseball/with-baseball-action';
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

const PHILOSOPHY_PATHS = [
  '/baseball/dashboard/discover',
  '/baseball/dashboard/settings/recruiting-preferences',
] as const;

function revalidatePhilosophyPaths() {
  for (const path of PHILOSOPHY_PATHS) {
    revalidatePath(path);
  }
}

function mapRecruitingPhilosophyActionError(
  error: unknown,
): { success: false; error: string } {
  if (error instanceof BaseballUnauthorizedError) {
    return { success: false, error: 'Not authenticated' };
  }
  if (error instanceof BaseballNoActiveTeamError) {
    return { success: false, error: 'Coach not found' };
  }
  if (error instanceof BaseballCapabilityError) {
    return { success: false, error: 'You do not have permission to manage recruiting settings' };
  }
  if (error instanceof BaseballActionError) {
    return { success: false, error: 'Could not complete the recruiting settings action. Please try again.' };
  }
  if (error instanceof Error) {
    return { success: false, error: error.message };
  }
  return { success: false, error: 'An unexpected error occurred' };
}

// ============================================================================
// RECRUITING PHILOSOPHY CRUD
// ============================================================================

/**
 * Get the current coach's recruiting philosophy.
 */
async function getRecruitingPhilosophyImpl(): Promise<{
  data: CoachRecruitingPhilosophy | null;
  error: string | null;
}> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { data: null, error: 'Not authenticated' };
  }

  const { data: coach, error: coachError } = await (supabase as SupabaseAny)
    .from('baseball_coaches')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (coachError || !coach) {
    return { data: null, error: 'Coach not found' };
  }

  const { data, error } = await (supabase as SupabaseAny)
    .from('baseball_coach_recruiting_philosophy')
    .select('*')
    .eq('coach_id', coach.id)
    .single();

  if (error && error.code !== 'PGRST116') {
    return { data: null, error: sanitizeDbError(error, 'recruiting-philosophy') };
  }

  return { data: data as CoachRecruitingPhilosophy | null, error: null };
}

/**
 * Save the current coach's recruiting philosophy.
 * Creates if doesn't exist, updates if exists.
 */
export async function saveRecruitingPhilosophy(
  philosophy: CoachRecruitingPhilosophyUpdate,
): Promise<{ success: boolean; error: string | null }> {
  try {
    return await saveRecruitingPhilosophyAction(philosophy);
  } catch (error) {
    await logServerError(
      `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
      { action: 'recruiting-philosophy.saveRecruitingPhilosophy', featureArea: 'baseball-recruiting-philosophy' },
    );
    const mapped = mapRecruitingPhilosophyActionError(error);
    return { success: false, error: mapped.error };
  }
}

const saveRecruitingPhilosophyAction = withBaseballAction(
  'saveRecruitingPhilosophy',
  { featureArea: 'baseball-recruiting-philosophy', requiredCapability: 'can_manage_settings' },
  async (ctx, philosophy: CoachRecruitingPhilosophyUpdate): Promise<{ success: boolean; error: string | null }> => {
    const supabase = await createClient();
    const coachId = ctx.activeCoachId;
    if (!coachId) {
      return { success: false, error: 'Coach not found' };
    }

    const { data: existing } = await (supabase as SupabaseAny)
      .from('baseball_coach_recruiting_philosophy')
      .select('id')
      .eq('coach_id', coachId)
      .single();

    if (existing) {
      const { error: updateError } = await (supabase as SupabaseAny)
        .from('baseball_coach_recruiting_philosophy')
        .update({
          ...philosophy,
          updated_at: new Date().toISOString(),
        })
        .eq('coach_id', coachId);

      if (updateError) {
        return { success: false, error: updateError.message };
      }
    } else {
      const insertData: CoachRecruitingPhilosophyInsert = {
        coach_id: coachId,
        ...philosophy,
      };

      const { error: insertError } = await (supabase as SupabaseAny)
        .from('baseball_coach_recruiting_philosophy')
        .insert(insertData);

      if (insertError) {
        return { success: false, error: insertError.message };
      }
    }

    revalidatePhilosophyPaths();
    return { success: true, error: null };
  },
);

/**
 * Update specific weights in the philosophy.
 */
async function updateRecruitingWeightsImpl(weights: {
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
async function updatePositionPrioritiesImpl(
  positions: string[],
): Promise<{ success: boolean; error: string | null }> {
  return saveRecruitingPhilosophy({ position_priorities: positions });
}

/**
 * Update minimum standards.
 */
async function updateMinimumStandardsImpl(standards: {
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
async function updateGeographicPreferencesImpl(prefs: {
  preferred_states?: string[];
  max_distance_miles?: number | null;
}): Promise<{ success: boolean; error: string | null }> {
  return saveRecruitingPhilosophy(prefs);
}

/**
 * Update target grad years.
 */
async function updateTargetGradYearsImpl(
  gradYears: number[],
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
  try {
    return await resetRecruitingPhilosophyAction();
  } catch (error) {
    await logServerError(
      `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
      { action: 'recruiting-philosophy.resetRecruitingPhilosophy', featureArea: 'baseball-recruiting-philosophy' },
    );
    const mapped = mapRecruitingPhilosophyActionError(error);
    return { success: false, error: mapped.error };
  }
}

const resetRecruitingPhilosophyAction = withBaseballAction(
  'resetRecruitingPhilosophy',
  { featureArea: 'baseball-recruiting-philosophy', requiredCapability: 'can_manage_settings' },
  async (ctx): Promise<{ success: boolean; error: string | null }> => {
    const supabase = await createClient();
    const coachId = ctx.activeCoachId;
    if (!coachId) {
      return { success: false, error: 'Coach not found' };
    }

    const { error: deleteError } = await (supabase as SupabaseAny)
      .from('baseball_coach_recruiting_philosophy')
      .delete()
      .eq('coach_id', coachId);

    if (deleteError) {
      return { success: false, error: deleteError.message };
    }

    revalidatePhilosophyPaths();
    return { success: true, error: null };
  },
);

// ============================================================================
// PLAYER PERCENTILES
// ============================================================================

/**
 * Get percentiles for a list of players.
 */
async function getPlayerPercentilesImpl(
  playerIds: string[],
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
async function getPlayerPercentileImpl(
  playerId: string,
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
  gradYear: number,
): Promise<{ success: boolean; error: string | null }> {
  try {
    return await recalculatePercentilesAction(gradYear);
  } catch (error) {
    await logServerError(
      `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
      { action: 'recruiting-philosophy.recalculatePercentiles', featureArea: 'baseball-recruiting-philosophy' },
    );
    const mapped = mapRecruitingPhilosophyActionError(error);
    return { success: false, error: mapped.error };
  }
}

const recalculatePercentilesAction = withBaseballAction(
  'recalculatePercentiles',
  { featureArea: 'baseball-recruiting-philosophy', requiredCapability: 'can_manage_settings' },
  async (_ctx, gradYear: number): Promise<{ success: boolean; error: string | null }> => {
    const supabase = await createClient();

    const { error } = await (supabase as SupabaseAny).rpc('calculate_grad_year_percentiles', {
      target_grad_year: gradYear,
    });

    if (error) {
      return { success: false, error: sanitizeDbError(error, 'recruiting-philosophy') };
    }

    return { success: true, error: null };
  },
);

// ============================================================================
// MATCH SCORING (Server-side)
// ============================================================================

/**
 * Calculate match scores for players in a discover query.
 * This is called server-side to enrich player data with match scores.
 */
async function calculateMatchScoresForPlayersImpl(
  playerIds: string[],
): Promise<{
  scores: Map<string, { match_score: number; breakdown: Record<string, unknown> }>;
  error: string | null;
}> {
  if (playerIds.length === 0) {
    return { scores: new Map(), error: null };
  }

  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { scores: new Map(), error: 'Not authenticated' };
  }

  const { data: coach, error: coachError } = await (supabase as SupabaseAny)
    .from('baseball_coaches')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (coachError || !coach) {
    return { scores: new Map(), error: 'Coach not found' };
  }

  const scores = new Map<string, { match_score: number; breakdown: Record<string, unknown> }>();

  for (const playerId of playerIds) {
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

export const getRecruitingPhilosophy = withAdminObserved(
  'getRecruitingPhilosophy',
  { sport: 'baseball', feature: 'baseball_recruiting_philosophy', featureArea: 'baseball-recruiting-philosophy' },
  getRecruitingPhilosophyImpl,
);

export const updateRecruitingWeights = withAdminObserved(
  'updateRecruitingWeights',
  { sport: 'baseball', feature: 'baseball_recruiting_philosophy', featureArea: 'baseball-recruiting-philosophy' },
  updateRecruitingWeightsImpl,
);

export const updatePositionPriorities = withAdminObserved(
  'updatePositionPriorities',
  { sport: 'baseball', feature: 'baseball_recruiting_philosophy', featureArea: 'baseball-recruiting-philosophy' },
  updatePositionPrioritiesImpl,
);

export const updateMinimumStandards = withAdminObserved(
  'updateMinimumStandards',
  { sport: 'baseball', feature: 'baseball_recruiting_philosophy', featureArea: 'baseball-recruiting-philosophy' },
  updateMinimumStandardsImpl,
);

export const updateGeographicPreferences = withAdminObserved(
  'updateGeographicPreferences',
  { sport: 'baseball', feature: 'baseball_recruiting_philosophy', featureArea: 'baseball-recruiting-philosophy' },
  updateGeographicPreferencesImpl,
);

export const updateTargetGradYears = withAdminObserved(
  'updateTargetGradYears',
  { sport: 'baseball', feature: 'baseball_recruiting_philosophy', featureArea: 'baseball-recruiting-philosophy' },
  updateTargetGradYearsImpl,
);

export const getPlayerPercentiles = withAdminObserved(
  'getPlayerPercentiles',
  { sport: 'baseball', feature: 'baseball_recruiting_philosophy', featureArea: 'baseball-recruiting-philosophy' },
  getPlayerPercentilesImpl,
);

export const getPlayerPercentile = withAdminObserved(
  'getPlayerPercentile',
  { sport: 'baseball', feature: 'baseball_recruiting_philosophy', featureArea: 'baseball-recruiting-philosophy' },
  getPlayerPercentileImpl,
);

export const calculateMatchScoresForPlayers = withAdminObserved(
  'calculateMatchScoresForPlayers',
  { sport: 'baseball', feature: 'baseball_recruiting_philosophy', featureArea: 'baseball-recruiting-philosophy' },
  calculateMatchScoresForPlayersImpl,
);
