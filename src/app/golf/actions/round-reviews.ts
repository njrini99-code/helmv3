'use server';

import { createClient } from '@/lib/supabase/server';
import { fromUntyped } from '@/lib/supabase/untyped';
import { revalidatePath } from 'next/cache';
import { logServerError } from '@/lib/server-error-logger';
import { verifyPlayerAccess as sharedVerifyPlayerAccess } from '@/lib/auth/verify-player-access';
import { resolveCoachTeamIdWithCookie } from '@/lib/golf/resolve-team-server';
import { pct } from '@/lib/golf/stat-formulas';

// UUID format validation
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isValidUuid(id: string): boolean { return UUID_REGEX.test(id); }
import type {
  GolfRoundReview,
  ReviewStatus,
  CoachFeedbackInput,
  GenerateReviewResponse,
  ReviewKeyStats,
  RoundReviewWithDetails,
} from '@/lib/types/golf';
import type { Json } from '@/lib/types/database';

// ============================================================================
// INTERNAL TYPES
// ============================================================================

/**
 * Extended round data type to handle database columns
 */
interface RoundDataForReview {
  id: string;
  player_id: string;
  total_score: number | null;
  score_to_par: number | null;
  total_putts: number | null;
  total_fairways_hit: number | null;
  total_fairways: number | null;
  total_gir: number | null;
  total_gir_possible: number | null;
  status?: string | null;
  course_name?: string | null;
}

/**
 * Database row type for golf_round_reviews (matching actual schema)
 */
interface ReviewDbRow {
  id: string;
  round_id: string;
  player_id: string;
  summary: string | null;
  highlights: unknown | null;
  areas_to_review: unknown | null;
  patterns_detected: unknown | null;
  round_stats: unknown | null;
  primary_takeaway: string | null;
  next_practice_priority: string | null;
  round_score: number | null;
  round_score_to_par: number | null;
  scoring_avg_before: number | null;
  scoring_avg_after: number | null;
  engine_version: string | null;
  shared_with_coach: boolean | null;
  shared_at: string | null;
  coach_notes: string | null;
  coach_viewed_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

/**
 * Extended data stored in JSON columns
 */
interface ReviewExtendedData {
  status?: ReviewStatus;
  generation_attempts?: number;
  generation_started_at?: string;
  generation_completed_at?: string;
  last_error?: string;
  ai_recommendations?: string[];
  ai_model_used?: string;
  ai_generation_duration_ms?: number;
  coach_rating?: number;
  coach_highlights?: string[];
  coach_focus_areas?: string[];
  coach_approved?: boolean;
  coach_approved_at?: string;
  coach_approved_by?: string;
  shared_with_player?: boolean;
  player_viewed_at?: string;
  player_feedback?: string;
  player_acknowledged?: boolean;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const REVIEW_GENERATION_TIMEOUT_MS = 60000; // 60 seconds
const MAX_GENERATION_ATTEMPTS = 3;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Calculate key stats from round data
 */
function calculateKeyStats(round: RoundDataForReview): ReviewKeyStats {
  const fairway_pct = round.total_fairways_hit != null && round.total_fairways != null
    ? pct(round.total_fairways_hit, round.total_fairways)
    : null;

  const gir_pct = round.total_gir != null && round.total_gir_possible != null
    ? pct(round.total_gir, round.total_gir_possible)
    : null;

  // Note: putts_per_gir cannot be accurately calculated from round-level data alone.
  // The correct calculation requires hole-level data (sum of putts ONLY on GIR holes / GIR count).
  // Dividing total_putts by total_gir is incorrect and would give misleading numbers.
  // This should be calculated by the shot-level stats calculator and stored in golf_round_stats_cache.
  const putts_per_gir: number | null = null;

  return {
    scoring_avg: round.total_score,
    score_vs_par: round.score_to_par,
    putts_per_round: round.total_putts,
    putts_per_gir,
    fairway_pct,
    gir_pct,
    scramble_pct: null, // Would need to compute from holes
    three_putt_pct: null,
    one_putt_pct: null,
    penalty_count: null,
    strokes_gained: undefined,
  };
}

/**
 * Generate AI review content
 */
async function generateAIReviewContent(round: RoundDataForReview, keyStats: ReviewKeyStats): Promise<{
  summary: string;
  strengths: string[];
  areas_for_improvement: string[];
  ai_recommendations: string[];
}> {
  const score_vs_par = keyStats.score_vs_par ?? 0;
  const strengths: string[] = [];
  const areas_for_improvement: string[] = [];
  const ai_recommendations: string[] = [];

  // Analyze putting
  if (keyStats.putts_per_round) {
    if (keyStats.putts_per_round <= 28) {
      strengths.push('Excellent putting performance - staying below 28 putts shows great touch on the greens');
    } else if (keyStats.putts_per_round >= 34) {
      areas_for_improvement.push('Putting needs attention - 34+ putts per round significantly impacts scoring');
      ai_recommendations.push('Focus on lag putting drills to reduce three-putts');
    }
  }

  // Analyze GIR
  if (keyStats.gir_pct !== null) {
    if (keyStats.gir_pct >= 65) {
      strengths.push(`Strong ball striking with ${keyStats.gir_pct}% greens in regulation`);
    } else if (keyStats.gir_pct < 50) {
      areas_for_improvement.push(`Greens in regulation at ${keyStats.gir_pct}% - work on approach shot accuracy`);
      ai_recommendations.push('Practice 150-yard and in approach shots to improve GIR percentage');
    }
  }

  // Analyze fairways
  if (keyStats.fairway_pct !== null) {
    if (keyStats.fairway_pct >= 70) {
      strengths.push(`Excellent accuracy off the tee with ${keyStats.fairway_pct}% fairways hit`);
    } else if (keyStats.fairway_pct < 50) {
      areas_for_improvement.push(`Fairway accuracy at ${keyStats.fairway_pct}% needs improvement`);
      ai_recommendations.push('Consider using a more conservative club off the tee on tight holes');
    }
  }

  // Generate summary
  const totalScore = round.total_score ?? 0;
  let summary = '';
  if (score_vs_par <= -2) {
    summary = `Exceptional round of ${totalScore} (${score_vs_par >= 0 ? '+' : ''}${score_vs_par}). `;
  } else if (score_vs_par <= 0) {
    summary = `Solid round of ${totalScore} (${score_vs_par === 0 ? 'E' : score_vs_par}). `;
  } else if (score_vs_par <= 5) {
    summary = `Decent round of ${totalScore} (+${score_vs_par}) with room for improvement. `;
  } else {
    summary = `Challenging round of ${totalScore} (+${score_vs_par}). `;
  }

  const firstStrength = strengths[0];
  if (firstStrength) {
    summary += `Key strength: ${firstStrength.toLowerCase()}. `;
  }

  const firstArea = areas_for_improvement[0];
  if (firstArea) {
    summary += `Focus area: ${firstArea.toLowerCase()}.`;
  }

  // Ensure we have at least some content
  if (strengths.length === 0) {
    strengths.push('Completed the round - consistency is key to improvement');
  }

  if (areas_for_improvement.length === 0) {
    areas_for_improvement.push('Continue working on all aspects of your game');
  }

  if (ai_recommendations.length === 0) {
    ai_recommendations.push('Maintain your current practice routine');
    ai_recommendations.push('Consider tracking more detailed shot data for better insights');
  }

  return {
    summary,
    strengths,
    areas_for_improvement,
    ai_recommendations,
  };
}

/**
 * Convert database row to GolfRoundReview type
 */
function dbRowToReview(row: ReviewDbRow, callerRole: 'player' | 'coach' = 'coach'): GolfRoundReview {
  const extData = row.patterns_detected as ReviewExtendedData | null;
  const highlights = row.highlights as string[] | null;
  const areasToReview = row.areas_to_review as string[] | null;
  const roundStats = row.round_stats as ReviewKeyStats | null;

  const review: GolfRoundReview = {
    id: row.id,
    round_id: row.round_id,
    player_id: row.player_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    summary: row.summary,
    highlights: row.highlights,
    areas_to_review: row.areas_to_review,
    patterns_detected: row.patterns_detected,
    primary_takeaway: row.primary_takeaway,
    next_practice_priority: row.next_practice_priority,
    round_stats: row.round_stats,
    round_score: row.round_score,
    round_score_to_par: row.round_score_to_par,
    scoring_avg_before: row.scoring_avg_before,
    scoring_avg_after: row.scoring_avg_after,
    engine_version: row.engine_version,
    shared_with_coach: row.shared_with_coach,
    shared_at: row.shared_at,
    coach_notes: row.coach_notes,
    coach_viewed_at: row.coach_viewed_at,
    // Extended fields from patterns_detected JSON
    status: extData?.status ?? (row.shared_with_coach ? 'shared' : 'draft'),
    strengths: highlights ?? undefined,
    areas_for_improvement: areasToReview ?? undefined,
    key_stats: roundStats ?? undefined,
    ai_recommendations: extData?.ai_recommendations,
    ai_model_used: extData?.ai_model_used,
    ai_generation_duration_ms: extData?.ai_generation_duration_ms,
    generation_attempts: extData?.generation_attempts,
    generation_started_at: extData?.generation_started_at,
    generation_completed_at: extData?.generation_completed_at,
    last_error: extData?.last_error,
    coach_rating: extData?.coach_rating,
    coach_highlights: extData?.coach_highlights,
    coach_focus_areas: extData?.coach_focus_areas,
    coach_approved: extData?.coach_approved,
    coach_approved_at: extData?.coach_approved_at,
    coach_approved_by: extData?.coach_approved_by,
    shared_with_player: extData?.shared_with_player,
    player_viewed_at: extData?.player_viewed_at,
    player_feedback: extData?.player_feedback,
    player_acknowledged: extData?.player_acknowledged,
  };

  // Strip coach-internal fields when the caller is a player
  if (callerRole === 'player') {
    review.coach_notes = null;
    review.coach_viewed_at = null;
    review.coach_rating = undefined;
    review.coach_highlights = undefined;
    review.coach_focus_areas = undefined;
    review.coach_approved = undefined;
    review.coach_approved_at = undefined;
    review.coach_approved_by = undefined;
    // Redact patterns_detected to avoid leaking raw internal data
    review.patterns_detected = null;
  }

  return review;
}

// ============================================================================
// OWNERSHIP VERIFICATION HELPER
// ============================================================================

/**
 * Verify the current user has access to a review's player data.
 *
 * Thin wrapper over the shared `verifyPlayerAccess` helper
 * (`@/lib/auth/verify-player-access`) that preserves the local
 * `{ authorized, callerRole, error }` shape callers in this file rely on.
 *
 * Access is granted if:
 *   1. The user IS the player (self), OR
 *   2. `role === 'player_or_coach'` and the user is a coach staffing ANY team
 *      the player is an active member of (multi-team-safe via
 *      `public.verify_coach_owns_player` RPC).
 */
async function verifyReviewAccess(
  supabase: Awaited<ReturnType<typeof createClient>>,
  playerId: string,
  role: 'player' | 'player_or_coach'
): Promise<{ authorized: boolean; userId?: string; playerId?: string; callerRole?: 'player' | 'coach'; error?: string }> {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { authorized: false, error: 'Not authenticated' };
  }

  const access = await sharedVerifyPlayerAccess(playerId, user.id, supabase);
  if (!access.allowed) {
    return { authorized: false, error: 'Not authorized to access this review' };
  }

  if (access.reason === 'self') {
    return { authorized: true, userId: user.id, playerId, callerRole: 'player' };
  }

  // Coach branch — player-only actions deny coaches.
  if (role === 'player') {
    return { authorized: false, error: 'Not authorized - you do not own this review' };
  }

  return { authorized: true, userId: user.id, playerId, callerRole: 'coach' };
}

// ============================================================================
// ROUND REVIEW ACTIONS
// ============================================================================

/**
 * Generate a review for a completed round
 */
export async function generateRoundReview(
  roundId: string,
  forceRegenerate: boolean = false
): Promise<GenerateReviewResponse> {
  const supabase = await createClient();

  try {
    // 1. Verify user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return { success: false, error: 'Not authenticated' };
    }

    // 2. Get the round
    const { data: round, error: roundError } = await supabase
      .from('golf_rounds')
      .select('*')
      .eq('id', roundId)
      .single();

    if (roundError || !round) {
      return { success: false, error: 'Round not found' };
    }

    // Verify the current user owns this round or is a coach on the player's team
    const access = await verifyReviewAccess(supabase, round.player_id, 'player_or_coach');
    if (!access.authorized) {
      return { success: false, error: access.error || 'Not authorized' };
    }

    // Check if round is complete
    if (round.status !== 'completed') {
      return { success: false, error: 'Round must be marked as complete before generating a review' };
    }

    // 3. Check if review already exists
    const { data: existingReview } = await supabase
      .from('golf_round_reviews')
      .select('*')
      .eq('round_id', roundId)
      .single();

    if (existingReview && !forceRegenerate) {
      const extData = existingReview.patterns_detected as ReviewExtendedData | null;
      const status = extData?.status ?? 'draft';

      if (status === 'generating') {
        return {
          success: true,
          review_id: existingReview.id,
          status: 'generating',
          message: 'Review generation is already in progress',
        };
      }

      if (!['pending', 'failed'].includes(status)) {
        return {
          success: true,
          review_id: existingReview.id,
          status: status as ReviewStatus,
          message: 'Review already exists',
        };
      }

      // Check max attempts
      const attempts = extData?.generation_attempts ?? 0;
      if (attempts >= MAX_GENERATION_ATTEMPTS && !forceRegenerate) {
        return {
          success: false,
          review_id: existingReview.id,
          status: 'failed',
          error: 'Maximum generation attempts exceeded. Please try again with force regenerate.',
        };
      }
    }

    // 4. Create or update review record
    let reviewId: string;
    const generationStartTime = new Date().toISOString();
    const roundData = round as RoundDataForReview;

    if (existingReview) {
      const existingExt = existingReview.patterns_detected as ReviewExtendedData | null;
      const newExtData: ReviewExtendedData = {
        ...existingExt,
        status: 'generating',
        generation_started_at: generationStartTime,
        generation_attempts: (existingExt?.generation_attempts ?? 0) + 1,
        last_error: undefined,
      };

      const { error: updateError } = await supabase
        .from('golf_round_reviews')
        .update({
          patterns_detected: newExtData as Json,
        })
        .eq('id', existingReview.id);

      if (updateError) {
        return { success: false, error: 'Failed to update review status' };
      }
      reviewId = existingReview.id;
    } else {
      const initialExtData: ReviewExtendedData = {
        status: 'generating',
        generation_started_at: generationStartTime,
        generation_attempts: 1,
      };

      const { data: newReview, error: insertError } = await supabase
        .from('golf_round_reviews')
        .insert({
          round_id: roundId,
          player_id: round.player_id,
          patterns_detected: initialExtData as Json,
        })
        .select('id')
        .single();

      if (insertError || !newReview) {
        return { success: false, error: 'Failed to create review record' };
      }
      reviewId = newReview.id;
    }

    // 5. Calculate key stats
    const keyStats = calculateKeyStats(roundData);

    // 6. Generate AI content
    const startTime = Date.now();

    try {
      const aiContentPromise = generateAIReviewContent(roundData, keyStats);

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Review generation timed out')), REVIEW_GENERATION_TIMEOUT_MS);
      });

      const aiContent = await Promise.race([aiContentPromise, timeoutPromise]);

      const generationDuration = Date.now() - startTime;

      // 7. Update review with generated content
      const finalExtData: ReviewExtendedData = {
        status: 'draft',
        generation_completed_at: new Date().toISOString(),
        ai_recommendations: aiContent.ai_recommendations,
        ai_model_used: 'rule-based-v1',
        ai_generation_duration_ms: generationDuration,
      };

      const { error: finalUpdateError } = await supabase
        .from('golf_round_reviews')
        .update({
          summary: aiContent.summary,
          highlights: aiContent.strengths,
          areas_to_review: aiContent.areas_for_improvement,
          round_stats: keyStats as unknown as Json,
          patterns_detected: finalExtData as Json,
          round_score: round.total_score,
          round_score_to_par: round.score_to_par,
          engine_version: 'v1.0',
        })
        .eq('id', reviewId);

      if (finalUpdateError) {
        throw new Error('Failed to save review content');
      }

      // 8. Revalidate paths
      revalidatePath('/golf/dashboard/rounds');
      revalidatePath(`/golf/dashboard/rounds/${roundId}/review`);
      revalidatePath('/golf/dashboard');

      return {
        success: true,
        review_id: reviewId,
        status: 'draft',
        message: 'Review generated successfully',
      };

    } catch (genError) {
      const errorMessage = genError instanceof Error ? genError.message : 'Unknown generation error';

      const failedExtData: ReviewExtendedData = {
        status: 'failed',
        generation_completed_at: new Date().toISOString(),
        last_error: errorMessage,
      };

      await supabase
        .from('golf_round_reviews')
        .update({
          patterns_detected: failedExtData as Json,
        })
        .eq('id', reviewId);

      return {
        success: false,
        review_id: reviewId,
        status: 'failed',
        error: errorMessage,
      };
    }

  } catch (error) {
    await logServerError(`generateRoundReview failed: ${error instanceof Error ? error.message : String(error)}`, {
      action: 'generateRoundReview',
      featureArea: 'round_reviews',
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unexpected error occurred',
    };
  }
}

/**
 * Get a review by ID with full details
 */
export async function getReviewById(reviewId: string): Promise<{
  success: boolean;
  review?: RoundReviewWithDetails;
  error?: string;
}> {
  if (!isValidUuid(reviewId)) return { success: false, error: 'Invalid review ID format' };
  const supabase = await createClient();

  try {
    // Select string widened to `string` so PostgREST stops deep type-parsing this
    // 4-level embed — that recursive instantiation tipped over TS2589 once the
    // schema grew (the new P1-12 ledger tables). Result is cast to the known shape.
    const reviewDetailSelect: string = `
        *,
        round:golf_rounds!inner(
          *,
          player:golf_players!inner(
            *,
            profile:profiles!inner(id, first_name, last_name, email, avatar_url)
          ),
          course:golf_courses(*)
        )
      `;
    const { data, error } = await supabase
      .from('golf_round_reviews')
      .select(reviewDetailSelect)
      .eq('id', reviewId)
      .single();
    const review = data as unknown as RoundReviewWithDetails | null;

    if (error || !review) {
      return { success: false, error: 'Review not found' };
    }

    // Verify the current user owns this review or is a coach on the player's team
    const access = await verifyReviewAccess(supabase, review.player_id, 'player_or_coach');
    if (!access.authorized) {
      return { success: false, error: 'Review not found or not accessible' };
    }

    return { success: true, review };
  } catch (error) {
    await logServerError(`getReviewById failed: ${error instanceof Error ? error.message : String(error)}`, {
      action: 'getReviewById',
      featureArea: 'round_reviews',
      extra: { reviewId },
    });
    return { success: false, error: 'Failed to fetch review' };
  }
}

/**
 * Get review by round ID
 */
export async function getReviewByRoundId(roundId: string): Promise<{
  success: boolean;
  review?: GolfRoundReview;
  error?: string;
}> {
  if (!isValidUuid(roundId)) {
    return { success: false, error: 'Invalid round ID' };
  }

  const supabase = await createClient();

  try {
    const { data: review, error } = await supabase
      .from('golf_round_reviews')
      .select('*')
      .eq('round_id', roundId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return { success: true, review: undefined };
      }
      return { success: false, error: 'Failed to fetch review' };
    }

    // Verify the current user owns this review or is a coach on the player's team
    const access = await verifyReviewAccess(supabase, review.player_id, 'player_or_coach');
    if (!access.authorized) {
      return { success: true, review: undefined };
    }

    return { success: true, review: dbRowToReview(review as ReviewDbRow, access.callerRole ?? 'player') };
  } catch (error) {
    await logServerError(`getReviewByRoundId failed: ${error instanceof Error ? error.message : String(error)}`, {
      action: 'getReviewByRoundId',
      featureArea: 'round_reviews',
      extra: { roundId },
    });
    return { success: false, error: 'Failed to fetch review' };
  }
}

/**
 * Add or update coach feedback on a review
 */
export async function saveCoachFeedback(
  reviewId: string,
  feedback: CoachFeedbackInput,
  approve: boolean = false
): Promise<{ success: boolean; error?: string }> {
  if (!isValidUuid(reviewId)) {
    return { success: false, error: 'Invalid review ID' };
  }

  const supabase = await createClient();

  try {
    // 1. Verify user is authenticated and is a coach
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return { success: false, error: 'Not authenticated' };
    }

    // Get coach info
    const { data: coach, error: coachError } = await supabase
      .from('golf_coaches')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (coachError || !coach) {
      return { success: false, error: 'Only coaches can add feedback' };
    }

    // 2. Get the existing review
    const { data: review, error: reviewError } = await supabase
      .from('golf_round_reviews')
      .select('*')
      .eq('id', reviewId)
      .single();

    if (reviewError || !review) {
      return { success: false, error: 'Review not found or access denied' };
    }

    // 3. Build update object
    const existingExt = review.patterns_detected as ReviewExtendedData | null;
    const status = existingExt?.status ?? 'draft';

    const editableStatuses = ['draft', 'coach_review', 'approved'];
    if (!editableStatuses.includes(status)) {
      return { success: false, error: `Cannot edit review in ${status} status` };
    }

    const updatedExtData: ReviewExtendedData = {
      ...existingExt,
      status: approve ? 'approved' : 'coach_review',
      coach_approved: approve,
    };

    if (feedback.coach_notes !== undefined) {
      // coach_notes is a direct column
    }

    if (feedback.coach_rating !== undefined) {
      updatedExtData.coach_rating = feedback.coach_rating;
    }

    if (feedback.coach_highlights !== undefined) {
      updatedExtData.coach_highlights = feedback.coach_highlights;
    }

    if (feedback.coach_focus_areas !== undefined) {
      updatedExtData.coach_focus_areas = feedback.coach_focus_areas;
    }

    if (approve) {
      updatedExtData.coach_approved_at = new Date().toISOString();
      updatedExtData.coach_approved_by = coach.id;
    }

    // 4. Update the review
    const updateData: Record<string, unknown> = {
      patterns_detected: updatedExtData,
    };

    if (feedback.coach_notes !== undefined) {
      updateData.coach_notes = feedback.coach_notes;
    }

    const { error: updateError } = await fromUntyped(supabase, 'golf_round_reviews')
      .update(updateData)
      .eq('id', reviewId);

    if (updateError) {
      await logServerError(`saveCoachFeedback update failed: ${updateError.message}`, {
        action: 'saveCoachFeedback',
        featureArea: 'round_reviews',
        extra: { reviewId, errorCode: updateError.code },
      });
      return { success: false, error: 'Failed to save feedback' };
    }

    // 5. Revalidate paths. The review is read from the player-facing page
    //    at /golf/dashboard/rounds/[id]/review — revalidate the dynamic
    //    segment (not the non-existent /golf/reviews route) so the client
    //    picks up the coach's feedback on next nav.
    revalidatePath('/golf/dashboard/rounds/[id]/review', 'page');
    revalidatePath('/golf/dashboard/rounds');

    return { success: true };

  } catch (error) {
    await logServerError(`saveCoachFeedback failed: ${error instanceof Error ? error.message : String(error)}`, {
      action: 'saveCoachFeedback',
      featureArea: 'round_reviews',
      extra: { reviewId },
    });
    return { success: false, error: 'An unexpected error occurred' };
  }
}

/**
 * Share a review with the player
 */
export async function shareReviewWithPlayer(
  reviewId: string,

  _includeCoachNotes: boolean = true
): Promise<{ success: boolean; error?: string }> {
  if (!isValidUuid(reviewId)) {
    return { success: false, error: 'Invalid review ID' };
  }

  const supabase = await createClient();

  try {
    // 1. Verify user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return { success: false, error: 'Not authenticated' };
    }

    // 2. Get the review
    const { data: review, error: reviewError } = await supabase
      .from('golf_round_reviews')
      .select('*')
      .eq('id', reviewId)
      .single();

    if (reviewError || !review) {
      return { success: false, error: 'Review not found or access denied' };
    }

    const extData = review.patterns_detected as ReviewExtendedData | null;

    if (extData?.shared_with_player) {
      return { success: false, error: 'Review is already shared with the player' };
    }

    const status = extData?.status ?? 'draft';
    if (!extData?.coach_approved && status !== 'approved') {
      return { success: false, error: 'Review must be approved before sharing' };
    }

    // 3. Update review to shared status
    const updatedExtData: ReviewExtendedData = {
      ...extData,
      status: 'shared',
      shared_with_player: true,
    };

    const { error: updateError } = await supabase
      .from('golf_round_reviews')
      .update({
        shared_at: new Date().toISOString(),
        patterns_detected: updatedExtData as Json,
      })
      .eq('id', reviewId);

    if (updateError) {
      return { success: false, error: 'Failed to share review' };
    }

    // 4. Revalidate paths. Same rationale as saveCoachFeedback — the
    //    real player-facing review route is /golf/dashboard/rounds/[id]/review.
    revalidatePath('/golf/dashboard/rounds/[id]/review', 'page');
    revalidatePath('/golf/dashboard/rounds');

    return { success: true };

  } catch (error) {
    await logServerError(`shareReview failed: ${error instanceof Error ? error.message : String(error)}`, {
      action: 'shareReview',
      featureArea: 'round_reviews',
      extra: { reviewId },
    });
    return { success: false, error: 'An unexpected error occurred' };
  }
}

/**
 * Get all reviews for a team (for coach view)
 */
export async function getTeamReviews(
  teamId: string,
  options: {
    status?: ReviewStatus;
    limit?: number;
    offset?: number;
  } = {}
): Promise<{
  success: boolean;
  reviews?: RoundReviewWithDetails[];
  total?: number;
  error?: string;
}> {
  if (!isValidUuid(teamId)) {
    return { success: false, error: 'Invalid team ID' };
  }

  const supabase = await createClient();
  const { limit = 20, offset = 0 } = options;

  try {
    // Verify caller is a coach on this team
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return { success: false, error: 'Not authenticated' };
    }

    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('id, organization_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!coach?.organization_id) {
      return { success: false, error: 'Only coaches can view team reviews' };
    }

    const { data: team } = await supabase
      .from('golf_teams')
      .select('id')
      .eq('id', teamId)
      .eq('organization_id', coach.organization_id)
      .maybeSingle();

    if (!team) {
      return { success: false, error: 'Team not found or not authorized' };
    }

    // widened to `string` to avoid TS2589 deep-embed instantiation (see getReviewById)
    const teamReviewSelect: string = `
        *,
        round:golf_rounds!inner(
          *,
          player:golf_players!inner(
            *,
            profile:profiles!inner(id, first_name, last_name, email, avatar_url)
          ),
          course:golf_courses(*)
        )
      `;
    const { data: reviews, error, count } = await supabase
      .from('golf_round_reviews')
      .select(teamReviewSelect, { count: 'exact' })
      .eq('round.team_id', teamId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      await logServerError(`getTeamReviews query failed: ${error.message}`, {
        action: 'getTeamReviews',
        featureArea: 'round_reviews',
        extra: { teamId, errorCode: error.code },
      });
      return { success: false, error: 'Failed to fetch reviews' };
    }

    // Filter by status if specified (status is in patterns_detected JSON)
    let filteredReviews = reviews as unknown as RoundReviewWithDetails[];
    if (options.status) {
      filteredReviews = filteredReviews.filter(r => {
        const extData = (r as unknown as ReviewDbRow).patterns_detected as ReviewExtendedData | null;
        return extData?.status === options.status;
      });
    }

    return {
      success: true,
      reviews: filteredReviews,
      total: count ?? 0,
    };

  } catch (error) {
    await logServerError(`getTeamReviews failed: ${error instanceof Error ? error.message : String(error)}`, {
      action: 'getTeamReviews',
      featureArea: 'round_reviews',
      extra: { teamId },
    });
    return { success: false, error: 'An unexpected error occurred' };
  }
}

/**
 * Get reviews pending coach action
 */
 
export async function getPendingCoachReviews(_coachId?: string): Promise<{
  success: boolean;
  reviews?: RoundReviewWithDetails[];
  error?: string;
}> {
  const supabase = await createClient();

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    // Verify user is a coach and get their organization
    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('id, organization_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!coach) {
      return { success: false, error: 'Not authorized - coach access required' };
    }

    if (!coach.organization_id) {
      return { success: true, reviews: [] };
    }

    // Get the coach's active team (cookie-aware, multi-team safe)
    const teamId = await resolveCoachTeamIdWithCookie(supabase, coach.organization_id, coach.id);

    if (!teamId) {
      return { success: true, reviews: [] };
    }

    // Get active player IDs on this team
    const { data: teamMembers } = await supabase
      .from('golf_team_members')
      .select('player_id')
      .eq('team_id', teamId)
      .eq('status', 'active');

    if (!teamMembers || teamMembers.length === 0) {
      return { success: true, reviews: [] };
    }

    const playerIds = teamMembers.map(m => m.player_id);

    // widened to `string` to avoid TS2589 deep-embed instantiation (see getReviewById)
    const pendingReviewSelect: string = `
        *,
        round:golf_rounds!inner(
          *,
          player:golf_players!inner(
            *,
            profile:profiles!inner(id, first_name, last_name, email, avatar_url)
          ),
          course:golf_courses(*)
        )
      `;
    const { data: reviews, error } = await supabase
      .from('golf_round_reviews')
      .select(pendingReviewSelect)
      .in('player_id', playerIds)
      .order('created_at', { ascending: false });

    if (error) {
      await logServerError(`getPendingCoachReviews query failed: ${error.message}`, {
        action: 'getPendingCoachReviews',
        featureArea: 'round_reviews',
        extra: { errorCode: error.code },
      });
      return { success: false, error: 'Failed to fetch pending reviews' };
    }

    // Filter to only draft/coach_review status
    const pendingReviews = (reviews as unknown as RoundReviewWithDetails[]).filter(r => {
      const extData = (r as unknown as ReviewDbRow).patterns_detected as ReviewExtendedData | null;
      const status = extData?.status ?? 'draft';
      return ['draft', 'coach_review'].includes(status);
    });

    return {
      success: true,
      reviews: pendingReviews,
    };

  } catch (error) {
    await logServerError(`getPendingCoachReviews failed: ${error instanceof Error ? error.message : String(error)}`, {
      action: 'getPendingCoachReviews',
      featureArea: 'round_reviews',
    });
    return { success: false, error: 'An unexpected error occurred' };
  }
}

/**
 * Get player's review history
 */
export async function getPlayerReviewHistory(playerId: string): Promise<{
  success: boolean;
  reviews?: GolfRoundReview[];
  error?: string;
}> {
  const supabase = await createClient();

  try {
    // Verify the current user owns this player record or is a coach on their team
    const access = await verifyReviewAccess(supabase, playerId, 'player_or_coach');
    if (!access.authorized) {
      return { success: false, error: access.error || 'Not authorized' };
    }

    const { data: reviews, error } = await supabase
      .from('golf_round_reviews')
      .select('*')
      .eq('player_id', playerId)
      .order('created_at', { ascending: false });

    if (error) {
      await logServerError(`getPlayerReviewHistory query failed: ${error.message}`, {
        action: 'getPlayerReviewHistory',
        featureArea: 'round_reviews',
        playerId,
        extra: { errorCode: error.code },
      });
      return { success: false, error: 'Failed to fetch reviews' };
    }

    const callerRole = access.callerRole ?? 'player';
    return {
      success: true,
      reviews: (reviews as ReviewDbRow[]).map(r => dbRowToReview(r, callerRole))
    };
  } catch (error) {
    await logServerError(`getPlayerReviewHistory failed: ${error instanceof Error ? error.message : String(error)}`, {
      action: 'getPlayerReviewHistory',
      featureArea: 'round_reviews',
      playerId,
    });
    return { success: false, error: 'An unexpected error occurred' };
  }
}

/**
 * Mark review as viewed by player
 */
export async function markReviewAsViewed(reviewId: string): Promise<{
  success: boolean;
  error?: string;
}> {
  const supabase = await createClient();

  try {
    // Get existing review
    const { data: review, error: fetchError } = await supabase
      .from('golf_round_reviews')
      .select('player_id, patterns_detected')
      .eq('id', reviewId)
      .single();

    if (fetchError || !review) {
      return { success: false, error: 'Review not found' };
    }

    // Verify the current user is the player who owns this review
    const access = await verifyReviewAccess(supabase, review.player_id, 'player');
    if (!access.authorized) {
      return { success: false, error: 'Review not found or not accessible' };
    }

    const extData = review.patterns_detected as ReviewExtendedData | null;
    if (extData?.player_viewed_at) {
      return { success: true }; // Already viewed
    }

    const updatedExtData: ReviewExtendedData = {
      ...extData,
      player_viewed_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from('golf_round_reviews')
      .update({
        patterns_detected: updatedExtData as Json,
      })
      .eq('id', reviewId);

    if (error) {
      return { success: false, error: 'Failed to mark as viewed' };
    }

    return { success: true };

  } catch (error) {
    await logServerError(`markReviewAsViewed failed: ${error instanceof Error ? error.message : String(error)}`, {
      action: 'markReviewAsViewed',
      featureArea: 'round_reviews',
      extra: { reviewId },
    });
    return { success: false, error: 'An unexpected error occurred' };
  }
}

/**
 * Add player feedback to a review
 */
export async function addPlayerFeedback(
  reviewId: string,
  feedback: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  try {
    // Get existing review
    const { data: review, error: fetchError } = await supabase
      .from('golf_round_reviews')
      .select('player_id, patterns_detected')
      .eq('id', reviewId)
      .single();

    if (fetchError || !review) {
      return { success: false, error: 'Review not found' };
    }

    // Verify the current user is the player who owns this review
    const access = await verifyReviewAccess(supabase, review.player_id, 'player');
    if (!access.authorized) {
      return { success: false, error: 'Review not found or not accessible' };
    }

    const extData = review.patterns_detected as ReviewExtendedData | null;
    const updatedExtData: ReviewExtendedData = {
      ...extData,
      player_feedback: feedback,
      player_acknowledged: true,
    };

    const { error } = await supabase
      .from('golf_round_reviews')
      .update({
        patterns_detected: updatedExtData as Json,
      })
      .eq('id', reviewId);

    if (error) {
      return { success: false, error: 'Failed to save feedback' };
    }

    // Revalidate the actual player-facing pages impacted by a feedback save.
    // /golf/reviews/* was a legacy route that was removed — revalidating it
    // was a silent no-op. Also revalidate the CoachHelm + My Development
    // screens so focus areas / insights driven by player feedback refresh.
    revalidatePath('/golf/dashboard/rounds/[id]/review', 'page');
    revalidatePath('/golf/dashboard/rounds');
    revalidatePath('/golf/dashboard/coachhelm');
    revalidatePath('/golf/dashboard/my-development');
    return { success: true };

  } catch (error) {
    await logServerError(`addPlayerFeedback failed: ${error instanceof Error ? error.message : String(error)}`, {
      action: 'addPlayerFeedback',
      featureArea: 'round_reviews',
      extra: { reviewId },
    });
    return { success: false, error: 'An unexpected error occurred' };
  }
}

/**
 * Retry failed review generation
 */
export async function retryReviewGeneration(reviewId: string): Promise<GenerateReviewResponse> {
  if (!isValidUuid(reviewId)) {
    return { success: false, error: 'Invalid review ID' };
  }

  const supabase = await createClient();

  try {
    const { data: review, error } = await supabase
      .from('golf_round_reviews')
      .select('round_id, player_id, patterns_detected')
      .eq('id', reviewId)
      .single();

    if (error || !review) {
      return { success: false, error: 'Review not found' };
    }

    // Verify the caller owns this review or is a coach
    const access = await verifyReviewAccess(supabase, review.player_id, 'player_or_coach');
    if (!access.authorized) {
      return { success: false, error: 'Not authorized to retry this review' };
    }

    const extData = review.patterns_detected as ReviewExtendedData | null;
    if (extData?.status !== 'failed') {
      return { success: false, error: 'Can only retry failed reviews' };
    }

    return generateRoundReview(review.round_id, true);

  } catch (error) {
    await logServerError(`retryReviewGeneration failed: ${error instanceof Error ? error.message : String(error)}`, {
      action: 'retryReviewGeneration',
      featureArea: 'round_reviews',
      extra: { reviewId },
    });
    return { success: false, error: 'An unexpected error occurred' };
  }
}

/**
 * Get review generation status for polling
 */
export async function getReviewGenerationStatus(reviewId: string): Promise<{
  success: boolean;
  status?: ReviewStatus;
  message?: string;
  progress?: number;
  error?: string;
}> {
  const supabase = await createClient();

  try {
    const { data: review, error } = await supabase
      .from('golf_round_reviews')
      .select('player_id, patterns_detected')
      .eq('id', reviewId)
      .single();

    if (error || !review) {
      return { success: false, error: 'Review not found' };
    }

    // Verify the current user owns this review or is a coach on the player's team
    const access = await verifyReviewAccess(supabase, review.player_id, 'player_or_coach');
    if (!access.authorized) {
      return { success: false, error: 'Review not found' };
    }

    const extData = review.patterns_detected as ReviewExtendedData | null;
    const status = extData?.status ?? 'draft';

    // Calculate approximate progress
    let progress = 0;
    if (status === 'generating' && extData?.generation_started_at) {
      const elapsed = Date.now() - new Date(extData.generation_started_at).getTime();
      progress = Math.min(90, Math.round((elapsed / REVIEW_GENERATION_TIMEOUT_MS) * 100));
    } else if (status === 'draft' || status === 'approved' || status === 'shared') {
      progress = 100;
    }

    return {
      success: true,
      status: status as ReviewStatus,
      message: status === 'generating' ? 'Generating insights...' : undefined,
      progress,
    };

  } catch (error) {
    await logServerError(`getReviewGenerationStatus failed: ${error instanceof Error ? error.message : String(error)}`, {
      action: 'getReviewGenerationStatus',
      featureArea: 'round_reviews',
      extra: { reviewId },
    });
    return { success: false, error: 'An unexpected error occurred' };
  }
}

// ============================================================================
// ANNOTATION FUNCTIONS
// ============================================================================
// `annotateInsight` removed 2026-04-27 — `golf_review_insights` table dropped.
// Reviews now store coach annotations inline in golf_round_reviews.round_stats.

/**
 * Add or update coach notes on a review
 */
export async function annotateReview(
  reviewId: string,
  annotation: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    // Verify user is a coach
    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!coach) {
      return { success: false, error: 'Not authorized - coach access required' };
    }

    const { error } = await supabase
      .from('golf_round_reviews')
      .update({
        coach_notes: annotation,
        updated_at: new Date().toISOString(),
      })
      .eq('id', reviewId);

    if (error) {
      await logServerError(`annotateReview update failed: ${error.message}`, {
        action: 'annotateReview',
        featureArea: 'round_reviews',
        extra: { reviewId, errorCode: error.code },
      });
      return { success: false, error: 'Failed to save annotation' };
    }

    return { success: true };
  } catch (error) {
    await logServerError(`annotateReview failed: ${error instanceof Error ? error.message : String(error)}`, {
      action: 'annotateReview',
      featureArea: 'round_reviews',
      extra: { reviewId },
    });
    return { success: false, error: 'An unexpected error occurred' };
  }
}

/**
 * Publish a review to make it visible to the player
 */
export async function publishReview(
  reviewId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    // Verify user is a coach
    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!coach) {
      return { success: false, error: 'Not authorized - coach access required' };
    }

    const { error } = await supabase
      .from('golf_round_reviews')
      .update({
        status: 'published',
        published_at: new Date().toISOString(),
        published_by: coach.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', reviewId);

    if (error) {
      await logServerError(`publishReview update failed: ${error.message}`, {
        action: 'publishReview',
        featureArea: 'round_reviews',
        extra: { reviewId, errorCode: error.code },
      });
      return { success: false, error: 'Failed to publish review' };
    }

    revalidatePath('/golf/dashboard');
    return { success: true };
  } catch (error) {
    await logServerError(`publishReview failed: ${error instanceof Error ? error.message : String(error)}`, {
      action: 'publishReview',
      featureArea: 'round_reviews',
      extra: { reviewId },
    });
    return { success: false, error: 'An unexpected error occurred' };
  }
}

/**
 * Create a focus area from a review insight
 */
export async function createFocusAreaFromReview(
  reviewId: string,
  focusAreaData: { name: string; description?: string }
): Promise<{ success: boolean; focusAreaId?: string; error?: string }> {
  const supabase = await createClient();

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    // Verify user is a coach
    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!coach) {
      return { success: false, error: 'Not authorized - coach access required' };
    }

    // Get the review to find the player
    const { data: review, error: reviewError } = await supabase
      .from('golf_round_reviews')
      .select('player_id')
      .eq('id', reviewId)
      .single();

    if (reviewError || !review) {
      return { success: false, error: 'Review not found' };
    }

    // Create the focus area
    // Note: area_type and title are required fields per schema
    const { data: focusArea, error } = await supabase
      .from('golf_player_focus_areas')
      .insert({
        player_id: review.player_id,
        coach_id: coach.id,
        area_type: 'improvement', // Default type for review-derived focus areas
        title: focusAreaData.name,
        description: focusAreaData.description,
        status: 'active',
      })
      .select('id')
      .single();

    if (error || !focusArea) {
      await logServerError(`createFocusAreaFromReview insert failed: ${error?.message || 'No focus area returned'}`, {
        action: 'createFocusAreaFromReview',
        featureArea: 'round_reviews',
        extra: { reviewId, errorCode: error?.code },
      });
      return { success: false, error: 'Failed to create focus area' };
    }

    revalidatePath('/golf/dashboard');
    return { success: true, focusAreaId: focusArea.id };
  } catch (error) {
    await logServerError(`createFocusAreaFromReview failed: ${error instanceof Error ? error.message : String(error)}`, {
      action: 'createFocusAreaFromReview',
      featureArea: 'round_reviews',
      extra: { reviewId },
    });
    return { success: false, error: 'An unexpected error occurred' };
  }
}

export async function markReviewViewedByPlayer(
  reviewId: string
): Promise<{ success: boolean; error?: string }> {
  return markReviewAsViewed(reviewId);
}

/**
 * Player acknowledges they have read and understood a review
 */
export async function acknowledgeReview(
  reviewId: string,
  acknowledgement?: string
): Promise<{ success: boolean; error?: string }> {
  if (!isValidUuid(reviewId)) {
    return { success: false, error: 'Invalid review ID' };
  }

  const supabase = await createClient();

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    // Verify user is a player with access to this review
    const { data: player } = await supabase
      .from('golf_players')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!player) {
      return { success: false, error: 'Not authorized - player access required' };
    }

    // Verify the review belongs to this player
    const { data: review } = await supabase
      .from('golf_round_reviews')
      .select('player_id, patterns_detected')
      .eq('id', reviewId)
      .single();

    if (!review || review.player_id !== player.id) {
      return { success: false, error: 'Review not found or not accessible' };
    }

    // Build update object - only include acknowledgement if provided
    const updateData: Record<string, unknown> = {
      player_acknowledged_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Store acknowledgement text in patterns_detected JSONB (not coach_feedback_text which is coach-only)
    if (acknowledgement) {
      const existingExt = (review as unknown as { patterns_detected: Record<string, unknown> | null }).patterns_detected;
      updateData.patterns_detected = {
        ...(typeof existingExt === 'object' && existingExt !== null ? existingExt : {}),
        player_acknowledgement: acknowledgement,
      };
    }

    const { error } = await fromUntyped(supabase, 'golf_round_reviews')
      .update(updateData)
      .eq('id', reviewId);

    if (error) {
      await logServerError(`acknowledgeReview update failed: ${error.message}`, {
        action: 'acknowledgeReview',
        featureArea: 'round_reviews',
        extra: { reviewId, errorCode: error.code },
      });
      return { success: false, error: 'Failed to acknowledge review' };
    }

    // Ack'ing a review can shift the CoachHelm feedback signal for the
    // player — revalidate the screens that read from it.
    revalidatePath('/golf/dashboard/rounds/[id]/review', 'page');
    revalidatePath('/golf/dashboard/rounds');
    revalidatePath('/golf/dashboard/coachhelm');
    revalidatePath('/golf/dashboard/my-development');

    return { success: true };
  } catch (error) {
    await logServerError(`acknowledgeReview failed: ${error instanceof Error ? error.message : String(error)}`, {
      action: 'acknowledgeReview',
      featureArea: 'round_reviews',
      extra: { reviewId },
    });
    return { success: false, error: 'An unexpected error occurred' };
  }
}

export async function markReviewViewedByCoach(
  reviewId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  try {
    // Fetch the review to get its player_id
    const { data: review, error: fetchError } = await supabase
      .from('golf_round_reviews')
      .select('player_id')
      .eq('id', reviewId)
      .single();

    if (fetchError || !review) {
      return { success: false, error: 'Review not found' };
    }

    // Verify the current user is a coach on the player's team
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return { success: false, error: 'Not authenticated' };
    }

    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('id, organization_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!coach) {
      return { success: false, error: 'Not authorized - coach access required' };
    }

    // Verify the player is on the coach's team
    if (coach.organization_id) {
      const teamId = await resolveCoachTeamIdWithCookie(supabase, coach.organization_id, coach.id);

      if (teamId) {
        const { data: teamMember } = await supabase
          .from('golf_team_members')
          .select('id')
          .eq('team_id', teamId)
          .eq('player_id', review.player_id)
          .eq('status', 'active')
          .maybeSingle();

        if (!teamMember) {
          return { success: false, error: 'Not authorized to access this review' };
        }
      } else {
        return { success: false, error: 'Not authorized to access this review' };
      }
    } else {
      return { success: false, error: 'Not authorized to access this review' };
    }

    const { error } = await supabase
      .from('golf_round_reviews')
      .update({
        coach_viewed_at: new Date().toISOString(),
      })
      .eq('id', reviewId)
      .is('coach_viewed_at', null);

    if (error) {
      return { success: false, error: 'Failed to mark as viewed' };
    }

    return { success: true };

  } catch (error) {
    await logServerError(`markReviewViewedByCoach failed: ${error instanceof Error ? error.message : String(error)}`, {
      action: 'markReviewViewedByCoach',
      featureArea: 'round_reviews',
      extra: { reviewId },
    });
    return { success: false, error: 'An unexpected error occurred' };
  }
}
