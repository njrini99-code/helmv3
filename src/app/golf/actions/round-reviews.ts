'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
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
  const fairway_pct = round.total_fairways_hit != null && round.total_fairways && round.total_fairways > 0
    ? Math.round((round.total_fairways_hit / round.total_fairways) * 100)
    : null;

  const gir_pct = round.total_gir != null && round.total_gir_possible && round.total_gir_possible > 0
    ? Math.round((round.total_gir / round.total_gir_possible) * 100)
    : null;

  const putts_per_gir = round.total_putts != null && round.total_gir && round.total_gir > 0
    ? Math.round((round.total_putts / round.total_gir) * 100) / 100
    : null;

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
function dbRowToReview(row: ReviewDbRow): GolfRoundReview {
  const extData = row.patterns_detected as ReviewExtendedData | null;
  const highlights = row.highlights as string[] | null;
  const areasToReview = row.areas_to_review as string[] | null;
  const roundStats = row.round_stats as ReviewKeyStats | null;

  return {
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
      revalidatePath('/golf/rounds');
      revalidatePath(`/golf/rounds/${roundId}`);
      revalidatePath('/golf/reviews');

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
    console.error('Error generating round review:', error);
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
  const supabase = await createClient();

  try {
    const { data: review, error } = await supabase
      .from('golf_round_reviews')
      .select(`
        *,
        round:golf_rounds!inner(
          *,
          player:golf_players!inner(
            *,
            profile:profiles!inner(id, first_name, last_name, email, avatar_url)
          ),
          course:golf_courses(*)
        )
      `)
      .eq('id', reviewId)
      .single();

    if (error || !review) {
      return { success: false, error: 'Review not found' };
    }

    return { success: true, review: review as unknown as RoundReviewWithDetails };
  } catch (error) {
    console.error('Error fetching review:', error);
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

    return { success: true, review: dbRowToReview(review as ReviewDbRow) };
  } catch (error) {
    console.error('Error fetching review:', error);
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
      .eq('profile_id', user.id)
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

    const { error: updateError } = await supabase
      .from('golf_round_reviews')
      .update(updateData)
      .eq('id', reviewId);

    if (updateError) {
      console.error('Error updating review:', updateError);
      return { success: false, error: 'Failed to save feedback' };
    }

    // 5. Revalidate paths
    revalidatePath('/golf/reviews');
    revalidatePath(`/golf/reviews/${reviewId}`);

    return { success: true };

  } catch (error) {
    console.error('Error saving coach feedback:', error);
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
        shared_with_coach: true,
        shared_at: new Date().toISOString(),
        patterns_detected: updatedExtData as Json,
      })
      .eq('id', reviewId);

    if (updateError) {
      return { success: false, error: 'Failed to share review' };
    }

    // 4. Revalidate paths
    revalidatePath('/golf/reviews');
    revalidatePath(`/golf/reviews/${reviewId}`);

    return { success: true };

  } catch (error) {
    console.error('Error sharing review:', error);
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
  const supabase = await createClient();
  const { limit = 20, offset = 0 } = options;

  try {
    const { data: reviews, error, count } = await supabase
      .from('golf_round_reviews')
      .select(`
        *,
        round:golf_rounds!inner(
          *,
          player:golf_players!inner(
            *,
            profile:profiles!inner(id, first_name, last_name, email, avatar_url)
          ),
          course:golf_courses(*)
        )
      `, { count: 'exact' })
      .eq('round.team_id', teamId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('Error fetching team reviews:', error);
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
    console.error('Error fetching team reviews:', error);
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

    const { data: reviews, error } = await supabase
      .from('golf_round_reviews')
      .select(`
        *,
        round:golf_rounds!inner(
          *,
          player:golf_players!inner(
            *,
            profile:profiles!inner(id, first_name, last_name, email, avatar_url)
          ),
          course:golf_courses(*)
        )
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching pending reviews:', error);
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
    console.error('Error fetching pending reviews:', error);
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
    const { data: reviews, error } = await supabase
      .from('golf_round_reviews')
      .select('*')
      .eq('player_id', playerId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching player reviews:', error);
      return { success: false, error: 'Failed to fetch reviews' };
    }

    return {
      success: true,
      reviews: (reviews as ReviewDbRow[]).map(dbRowToReview)
    };
  } catch (error) {
    console.error('Error fetching player reviews:', error);
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
      .select('patterns_detected')
      .eq('id', reviewId)
      .single();

    if (fetchError || !review) {
      return { success: false, error: 'Review not found' };
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
    console.error('Error marking review as viewed:', error);
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
      .select('patterns_detected')
      .eq('id', reviewId)
      .single();

    if (fetchError || !review) {
      return { success: false, error: 'Review not found' };
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

    revalidatePath(`/golf/reviews/${reviewId}`);
    return { success: true };

  } catch (error) {
    console.error('Error adding player feedback:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

/**
 * Retry failed review generation
 */
export async function retryReviewGeneration(reviewId: string): Promise<GenerateReviewResponse> {
  const supabase = await createClient();

  try {
    const { data: review, error } = await supabase
      .from('golf_round_reviews')
      .select('round_id, patterns_detected')
      .eq('id', reviewId)
      .single();

    if (error || !review) {
      return { success: false, error: 'Review not found' };
    }

    const extData = review.patterns_detected as ReviewExtendedData | null;
    if (extData?.status !== 'failed') {
      return { success: false, error: 'Can only retry failed reviews' };
    }

    return generateRoundReview(review.round_id, true);

  } catch (error) {
    console.error('Error retrying review:', error);
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
      .select('patterns_detected')
      .eq('id', reviewId)
      .single();

    if (error || !review) {
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
    console.error('Error getting review status:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

// ============================================================================
// ANNOTATION FUNCTIONS
// ============================================================================

/**
 * Add or update annotation on a review insight
 */
export async function annotateInsight(
  insightId: string,
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const insightsTable = supabase.from('golf_review_insights' as any);
    const { error } = await insightsTable
      .update({
        coach_notes: annotation,
        updated_at: new Date().toISOString(),
      })
      .eq('id', insightId);

    if (error) {
      console.error('Error annotating insight:', error);
      return { success: false, error: 'Failed to save annotation' };
    }

    return { success: true };
  } catch (error) {
    console.error('Unexpected error in annotateInsight:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

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
      console.error('Error annotating review:', error);
      return { success: false, error: 'Failed to save annotation' };
    }

    return { success: true };
  } catch (error) {
    console.error('Unexpected error in annotateReview:', error);
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
      console.error('Error publishing review:', error);
      return { success: false, error: 'Failed to publish review' };
    }

    revalidatePath('/golf/dashboard');
    return { success: true };
  } catch (error) {
    console.error('Unexpected error in publishReview:', error);
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
      console.error('Error creating focus area:', error);
      return { success: false, error: 'Failed to create focus area' };
    }

    revalidatePath('/golf/dashboard');
    return { success: true, focusAreaId: focusArea.id };
  } catch (error) {
    console.error('Unexpected error in createFocusAreaFromReview:', error);
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
      .select('player_id')
      .eq('id', reviewId)
      .single();

    if (!review || review.player_id !== player.id) {
      return { success: false, error: 'Review not found or not accessible' };
    }

    // Build update object - only include acknowledgement if provided
    const updateData: Record<string, string> = {
      player_acknowledged_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Store acknowledgement text in a notes field if provided
    if (acknowledgement) {
      updateData.coach_feedback_text = acknowledgement;
    }

    const { error } = await supabase
      .from('golf_round_reviews')
      .update(updateData)
      .eq('id', reviewId);

    if (error) {
      console.error('Error acknowledging review:', error);
      return { success: false, error: 'Failed to acknowledge review' };
    }

    return { success: true };
  } catch (error) {
    console.error('Unexpected error in acknowledgeReview:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

export async function markReviewViewedByCoach(
  reviewId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  try {
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
    console.error('Error marking review as viewed by coach:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
}
