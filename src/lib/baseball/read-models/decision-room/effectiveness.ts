/**
 * Read model: Decision Room — Practice Effectiveness Reviews.
 *
 * Backs the Coach Room (Decision Room) "Effectiveness" panel by reading the
 * EXISTING prod table `baseball_practice_effectiveness_reviews`.
 *
 * RLS SAFETY: callers MUST pass the AUTHENTICATED server client
 * (`await createClient()` from '@/lib/supabase/server'). All rows returned here
 * are scoped to the caller's team both by the explicit `team_id` filter below
 * and by row-level security on the table. NEVER call this with the
 * service-role/admin client — it would bypass RLS and leak cross-team data.
 *
 * This is a plain server module (NO 'use server'). Reads only; no writes.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

import type { DecisionRoomEffectivenessReview } from '@/app/baseball/actions/decision-room';

/**
 * Hard server-side row cap. PostgREST also enforces a max-rows ceiling, but the
 * Decision Room only needs the most recent reviews, so we bound the result set
 * here and rely on the `reviewed_at` ordering to surface the newest first.
 */
const RECENT_REVIEWS_LIMIT = 50;

/**
 * Shape of the columns we select from `baseball_practice_effectiveness_reviews`.
 * Mirrors the live schema verified via information_schema (no guessed columns).
 */
interface EffectivenessReviewRow {
  id: string;
  practice_id: string;
  team_id: string;
  block_id: string | null;
  reviewed_by_coach_id: string | null;
  overall_grade: string | null;
  reps_quality: number | null;
  energy_level: number | null;
  focus_level: number | null;
  objective_completion_pct: number | null;
  notes: string | null;
  signal_raised: boolean;
  reviewed_at: string;
  created_at: string;
}

/**
 * Load the most recent practice-effectiveness reviews for a team, newest first.
 *
 * Returns honest rows from the backing table — never fabricated data. When the
 * team has no reviews, returns an empty array.
 *
 * @param supabase Authenticated server Supabase client (RLS-applied).
 * @param teamId   The caller's team id; reviews are scoped to this team.
 */
export async function loadEffectivenessReviews(
  supabase: SupabaseClient,
  teamId: string,
): Promise<DecisionRoomEffectivenessReview[]> {
  if (!teamId) return [];

  const { data, error } = await supabase
    .from('baseball_practice_effectiveness_reviews')
    .select(
      'id, practice_id, team_id, block_id, reviewed_by_coach_id, overall_grade, reps_quality, energy_level, focus_level, objective_completion_pct, notes, signal_raised, reviewed_at, created_at',
    )
    .eq('team_id', teamId)
    .order('reviewed_at', { ascending: false })
    .limit(RECENT_REVIEWS_LIMIT);

  if (error || !data) return [];

  return (data as EffectivenessReviewRow[]).map((row) => ({
    id: row.id,
    practiceId: row.practice_id,
    teamId: row.team_id,
    blockId: row.block_id,
    reviewedByCoachId: row.reviewed_by_coach_id,
    overallGrade: row.overall_grade,
    repsQuality: row.reps_quality,
    energyLevel: row.energy_level,
    focusLevel: row.focus_level,
    objectiveCompletionPct: row.objective_completion_pct,
    notes: row.notes,
    signalRaised: row.signal_raised,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
  }));
}
