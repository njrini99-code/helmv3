'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type {
  GolfRound,
  GolfRoundReview,
  ReviewStatus,
  CoachFeedbackInput,
  GenerateReviewResponse,
  ReviewKeyStats,
  DrillRecommendation,
  RoundReviewWithDetails,
} from '@/types/golf';

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
function calculateKeyStats(round: GolfRound): ReviewKeyStats {
  const fairway_pct = round.fairways_hit && round.fairways_total
    ? Math.round((round.fairways_hit / round.fairways_total) * 100)
    : null;

  const gir_pct = round.greens_in_regulation
    ? Math.round((round.greens_in_regulation / round.greens_total) * 100)
    : null;

  const putts_per_gir = round.total_putts && round.greens_in_regulation && round.greens_in_regulation > 0
    ? Math.round((round.total_putts / round.greens_in_regulation) * 100) / 100
    : null;

  // Calculate scramble percentage (up and downs / (18 - GIR))
  const missed_greens = round.greens_total - (round.greens_in_regulation || 0);
  const scramble_pct = round.up_and_downs && missed_greens > 0
    ? Math.round((round.up_and_downs / missed_greens) * 100)
    : null;

  // Three-putt and one-putt percentages
  const three_putt_pct = round.three_putts && round.greens_total > 0
    ? Math.round((round.three_putts / round.greens_total) * 100)
    : null;

  const one_putt_pct = round.one_putts && round.greens_total > 0
    ? Math.round((round.one_putts / round.greens_total) * 100)
    : null;

  return {
    scoring_avg: round.gross_score,
    score_vs_par: round.gross_score - round.par,
    putts_per_round: round.total_putts,
    putts_per_gir,
    fairway_pct,
    gir_pct,
    scramble_pct,
    three_putt_pct,
    one_putt_pct,
    penalty_count: round.total_penalties,
    strokes_gained: round.strokes_gained_total ? {
      total: round.strokes_gained_total,
      off_tee: round.strokes_gained_off_tee,
      approach: round.strokes_gained_approach,
      around_green: round.strokes_gained_around_green,
      putting: round.strokes_gained_putting,
    } : undefined,
  };
}

/**
 * Generate AI review content using the round data
 * This is a placeholder that would be replaced with actual AI integration
 */
async function generateAIReviewContent(round: GolfRound, keyStats: ReviewKeyStats): Promise<{
  summary: string;
  strengths: string[];
  areas_for_improvement: string[];
  ai_recommendations: string[];
}> {
  // In production, this would call OpenAI/Anthropic API
  // For now, we generate intelligent content based on the stats

  const score_vs_par = round.gross_score - round.par;
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

  // Analyze penalties
  if (keyStats.penalty_count > 0) {
    if (keyStats.penalty_count >= 3) {
      areas_for_improvement.push(`${keyStats.penalty_count} penalty strokes cost you significantly this round`);
      ai_recommendations.push('Work on course management to avoid penalty situations');
    }
  }

  // Analyze three-putts
  if (keyStats.three_putt_pct && keyStats.three_putt_pct > 15) {
    areas_for_improvement.push('Three-putt frequency is high - focus on speed control');
    ai_recommendations.push('Practice 30-40 foot lag putts to get closer on first putt');
  }

  // One-putts are a strength
  if (keyStats.one_putt_pct && keyStats.one_putt_pct >= 40) {
    strengths.push(`Outstanding one-putt percentage at ${keyStats.one_putt_pct}%`);
  }

  // Scrambling
  if (keyStats.scramble_pct !== null) {
    if (keyStats.scramble_pct >= 50) {
      strengths.push(`Solid short game with ${keyStats.scramble_pct}% scrambling`);
    } else if (keyStats.scramble_pct < 30) {
      areas_for_improvement.push('Short game needs work - scrambling is below 30%');
      ai_recommendations.push('Dedicate practice time to chipping and pitching from various lies');
    }
  }

  // Generate summary
  let summary = '';
  if (score_vs_par <= -2) {
    summary = `Exceptional round of ${round.gross_score} (${score_vs_par >= 0 ? '+' : ''}${score_vs_par}). `;
  } else if (score_vs_par <= 0) {
    summary = `Solid round of ${round.gross_score} (${score_vs_par === 0 ? 'E' : score_vs_par}). `;
  } else if (score_vs_par <= 5) {
    summary = `Decent round of ${round.gross_score} (+${score_vs_par}) with room for improvement. `;
  } else {
    summary = `Challenging round of ${round.gross_score} (+${score_vs_par}). `;
  }

  if (strengths.length > 0) {
    summary += `Key strength: ${strengths[0].toLowerCase()}. `;
  }

  if (areas_for_improvement.length > 0) {
    summary += `Focus area: ${areas_for_improvement[0].toLowerCase()}.`;
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

// ============================================================================
// ROUND REVIEW ACTIONS
// ============================================================================

/**
 * Generate a review for a completed round
 * Handles timeout and retry logic for reliable generation
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

    // 2. Get the round and verify it exists and is complete
    const { data: round, error: roundError } = await supabase
      .from('golf_rounds')
      .select(`
        *,
        player:golf_players!inner(
          id,
          profile_id,
          profile:profiles!inner(id, first_name, last_name)
        ),
        course:golf_courses(*)
      `)
      .eq('id', roundId)
      .single();

    if (roundError || !round) {
      return { success: false, error: 'Round not found' };
    }

    if (!round.is_complete) {
      return { success: false, error: 'Round must be marked as complete before generating a review' };
    }

    // 3. Check if review already exists
    const { data: existingReview } = await supabase
      .from('golf_round_reviews')
      .select('id, status, generation_attempts')
      .eq('round_id', roundId)
      .single();

    if (existingReview && !forceRegenerate) {
      if (existingReview.status === 'generating') {
        return {
          success: true,
          review_id: existingReview.id,
          status: 'generating',
          message: 'Review generation is already in progress',
        };
      }

      if (!['pending', 'failed'].includes(existingReview.status)) {
        return {
          success: true,
          review_id: existingReview.id,
          status: existingReview.status as ReviewStatus,
          message: 'Review already exists',
        };
      }

      // Check max attempts
      if (existingReview.generation_attempts >= MAX_GENERATION_ATTEMPTS && !forceRegenerate) {
        return {
          success: false,
          review_id: existingReview.id,
          status: 'failed',
          error: 'Maximum generation attempts exceeded. Please try again with force regenerate.',
        };
      }
    }

    // 4. Create or update review record with status='generating'
    let reviewId: string;
    const generationStartTime = new Date().toISOString();

    if (existingReview) {
      const { error: updateError } = await supabase
        .from('golf_round_reviews')
        .update({
          status: 'generating',
          status_message: 'Analyzing round data...',
          generation_started_at: generationStartTime,
          generation_attempts: existingReview.generation_attempts + 1,
          last_error: null,
        })
        .eq('id', existingReview.id);

      if (updateError) {
        return { success: false, error: 'Failed to update review status' };
      }
      reviewId = existingReview.id;
    } else {
      const { data: newReview, error: insertError } = await supabase
        .from('golf_round_reviews')
        .insert({
          round_id: roundId,
          status: 'generating',
          status_message: 'Analyzing round data...',
          generation_started_at: generationStartTime,
          generation_attempts: 1,
        })
        .select('id')
        .single();

      if (insertError || !newReview) {
        return { success: false, error: 'Failed to create review record' };
      }
      reviewId = newReview.id;
    }

    // 5. Calculate key stats synchronously (fast)
    const keyStats = calculateKeyStats(round as GolfRound);

    // 6. Generate AI content with timeout handling
    const startTime = Date.now();

    try {
      // Update status
      await supabase
        .from('golf_round_reviews')
        .update({ status_message: 'Generating insights...' })
        .eq('id', reviewId);

      // Generate AI content (with timeout)
      const aiContentPromise = generateAIReviewContent(round as GolfRound, keyStats);

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Review generation timed out')), REVIEW_GENERATION_TIMEOUT_MS);
      });

      const aiContent = await Promise.race([aiContentPromise, timeoutPromise]);

      const generationDuration = Date.now() - startTime;

      // 7. Update review with generated content
      const { error: finalUpdateError } = await supabase
        .from('golf_round_reviews')
        .update({
          summary: aiContent.summary,
          strengths: aiContent.strengths,
          areas_for_improvement: aiContent.areas_for_improvement,
          key_stats: keyStats,
          ai_recommendations: aiContent.ai_recommendations,
          ai_model_used: 'rule-based-v1', // Would be 'gpt-4' or 'claude-3' in production
          ai_generation_duration_ms: generationDuration,
          status: 'draft',
          status_message: 'Ready for coach review',
          generation_completed_at: new Date().toISOString(),
          last_error: null,
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
      // Handle generation failure
      const errorMessage = genError instanceof Error ? genError.message : 'Unknown generation error';

      await supabase
        .from('golf_round_reviews')
        .update({
          status: 'failed',
          status_message: 'Generation failed',
          last_error: errorMessage,
          generation_completed_at: new Date().toISOString(),
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
        return { success: true, review: undefined }; // No review yet
      }
      return { success: false, error: 'Failed to fetch review' };
    }

    return { success: true, review: review as GolfRoundReview };
  } catch (error) {
    console.error('Error fetching review:', error);
    return { success: false, error: 'Failed to fetch review' };
  }
}

/**
 * Add or update coach feedback on a review
 * This is the critical missing piece for the coach feedback loop
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
      .from('coaches')
      .select('id')
      .eq('profile_id', user.id)
      .single();

    if (coachError || !coach) {
      return { success: false, error: 'Only coaches can add feedback' };
    }

    // 2. Verify the review exists and coach has access
    const { data: review, error: reviewError } = await supabase
      .from('golf_round_reviews')
      .select(`
        id,
        status,
        round:golf_rounds!inner(
          player_id,
          player:golf_players!inner(id)
        )
      `)
      .eq('id', reviewId)
      .single();

    if (reviewError || !review) {
      return { success: false, error: 'Review not found or access denied' };
    }

    // Check if review is in an editable state
    const editableStatuses = ['draft', 'coach_review', 'approved'];
    if (!editableStatuses.includes(review.status)) {
      return { success: false, error: `Cannot edit review in ${review.status} status` };
    }

    // 3. Build update object
    const updateData: Partial<GolfRoundReview> = {
      status: approve ? 'approved' : 'coach_review',
      coach_approved: approve,
    };

    if (feedback.coach_notes !== undefined) {
      updateData.coach_notes = feedback.coach_notes;
    }

    if (feedback.coach_rating !== undefined) {
      updateData.coach_rating = feedback.coach_rating;
    }

    if (feedback.coach_highlights !== undefined) {
      updateData.coach_highlights = feedback.coach_highlights;
    }

    if (feedback.coach_focus_areas !== undefined) {
      updateData.coach_focus_areas = feedback.coach_focus_areas;
    }

    if (feedback.coach_drill_recommendations !== undefined) {
      updateData.coach_drill_recommendations = feedback.coach_drill_recommendations;
    }

    if (approve) {
      updateData.coach_approved_at = new Date().toISOString();
      updateData.coach_approved_by = coach.id;
    }

    // 4. Update the review
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
  includeCoachNotes: boolean = true
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  try {
    // 1. Verify user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return { success: false, error: 'Not authenticated' };
    }

    // 2. Get the review and verify it can be shared
    const { data: review, error: reviewError } = await supabase
      .from('golf_round_reviews')
      .select('id, status, coach_approved, shared_with_player')
      .eq('id', reviewId)
      .single();

    if (reviewError || !review) {
      return { success: false, error: 'Review not found or access denied' };
    }

    if (review.shared_with_player) {
      return { success: false, error: 'Review is already shared with the player' };
    }

    if (!review.coach_approved && review.status !== 'approved') {
      return { success: false, error: 'Review must be approved before sharing' };
    }

    // 3. Update review to shared status
    const { error: updateError } = await supabase
      .from('golf_round_reviews')
      .update({
        shared_with_player: true,
        shared_at: new Date().toISOString(),
        status: 'shared',
        // Optionally clear coach notes if not including them
        ...(includeCoachNotes ? {} : { coach_notes: null }),
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
  const { status, limit = 20, offset = 0 } = options;

  try {
    let query = supabase
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

    if (status) {
      query = query.eq('status', status);
    }

    const { data: reviews, error, count } = await query;

    if (error) {
      console.error('Error fetching team reviews:', error);
      return { success: false, error: 'Failed to fetch reviews' };
    }

    return {
      success: true,
      reviews: reviews as unknown as RoundReviewWithDetails[],
      total: count || 0,
    };

  } catch (error) {
    console.error('Error fetching team reviews:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

/**
 * Get reviews pending coach action
 */
export async function getPendingCoachReviews(coachId?: string): Promise<{
  success: boolean;
  reviews?: RoundReviewWithDetails[];
  error?: string;
}> {
  const supabase = await createClient();

  try {
    // Get the coach's profile ID if not provided
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
          course:golf_courses(*),
          team:golf_teams!inner(
            coach:coaches!inner(profile_id)
          )
        )
      `)
      .in('status', ['draft', 'coach_review'])
      .eq('round.team.coach.profile_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching pending reviews:', error);
      return { success: false, error: 'Failed to fetch pending reviews' };
    }

    return {
      success: true,
      reviews: reviews as unknown as RoundReviewWithDetails[],
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
      .select(`
        *,
        round:golf_rounds!inner(
          id,
          round_date,
          gross_score,
          par,
          course:golf_courses(name)
        )
      `)
      .eq('round.player_id', playerId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching player reviews:', error);
      return { success: false, error: 'Failed to fetch reviews' };
    }

    return { success: true, reviews: reviews as GolfRoundReview[] };

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
    const { error } = await supabase
      .from('golf_round_reviews')
      .update({
        player_viewed_at: new Date().toISOString(),
      })
      .eq('id', reviewId)
      .is('player_viewed_at', null); // Only update if not already viewed

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
    const { error } = await supabase
      .from('golf_round_reviews')
      .update({
        player_feedback: feedback,
        player_acknowledged: true,
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
    // Get the review to find the round ID
    const { data: review, error } = await supabase
      .from('golf_round_reviews')
      .select('round_id, status')
      .eq('id', reviewId)
      .single();

    if (error || !review) {
      return { success: false, error: 'Review not found' };
    }

    if (review.status !== 'failed') {
      return { success: false, error: 'Can only retry failed reviews' };
    }

    // Re-run generation
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
      .select('status, status_message, generation_started_at')
      .eq('id', reviewId)
      .single();

    if (error || !review) {
      return { success: false, error: 'Review not found' };
    }

    // Calculate approximate progress for generating status
    let progress = 0;
    if (review.status === 'generating' && review.generation_started_at) {
      const elapsed = Date.now() - new Date(review.generation_started_at).getTime();
      progress = Math.min(90, Math.round((elapsed / REVIEW_GENERATION_TIMEOUT_MS) * 100));
    } else if (review.status === 'draft' || review.status === 'approved' || review.status === 'shared') {
      progress = 100;
    }

    return {
      success: true,
      status: review.status as ReviewStatus,
      message: review.status_message || undefined,
      progress,
    };

  } catch (error) {
    console.error('Error getting review status:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
}
