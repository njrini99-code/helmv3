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
 * Shape of the columns we select from `baseball_practice_effectiveness_reviews`
 * joined with `baseball_practices` for the practice title.
 * Mirrors the live schema from 20260624000094_baseball_practice_effectiveness.sql.
 */
interface EffectivenessReviewRow {
  id: string;
  focus_area: string;
  metric_id: string | null;
  direction: string;
  conclusion: string;
  recommended_next_action: { label?: string; type?: string; owner_role?: string } | null;
  baseball_practices: { title: string }[] | null;
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
      'id, focus_area, metric_id, direction, conclusion, recommended_next_action, baseball_practices(title)',
    )
    .eq('team_id', teamId)
    .order('generated_at', { ascending: false })
    .limit(RECENT_REVIEWS_LIMIT);

  if (error || !data) return [];

  return (data as EffectivenessReviewRow[]).map((row) => {
    // Map DB direction values to the DecisionRoomEffectivenessReview union.
    // DB: 'improved'|'stable'|'worse'|'insufficient_sample'|'too_early'|'not_tracked'
    // Type: 'improved'|'regressed'|'no_change'|null
    let direction: 'improved' | 'regressed' | 'no_change' | null;
    if (row.direction === 'improved') {
      direction = 'improved';
    } else if (row.direction === 'worse') {
      direction = 'regressed';
    } else if (row.direction === 'stable') {
      direction = 'no_change';
    } else {
      direction = null;
    }

    return {
      id: row.id,
      practiceTitle: row.baseball_practices?.[0]?.title ?? '',
      focusArea: row.focus_area,
      metricLabel: row.metric_id,
      direction,
      conclusion: row.conclusion,
      recommendedLabel: row.recommended_next_action?.label ?? null,
    };
  });
}
