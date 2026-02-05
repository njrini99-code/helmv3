'use server';

/**
 * Round Review System - Server Actions
 *
 * Complete round review management including:
 * - Fetching existing reviews
 * - Generating and storing AI reviews
 * - Regenerating reviews with latest AI
 */

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { generateRoundReview as generateAIRoundReview } from '@/app/golf/actions/insights';
import type { Json } from '@/lib/types/database';

// ============================================================================
// TYPES
// ============================================================================

export type ReviewSentiment = 'positive' | 'neutral' | 'challenging';
export type OverallGrade = 'A' | 'B' | 'C' | 'D' | 'F';
export type StatComparison = 'above' | 'below' | 'average';

export interface RoundReviewHighlight {
  title: string;
  description: string;
}

export interface RoundReviewImprovementArea {
  area: string;
  recommendation: string;
}

export interface RoundReviewKeyStat {
  label: string;
  value: string;
  comparison: StatComparison;
}

export interface RoundReviewContent {
  summary: string;
  sentiment: ReviewSentiment;
  highlights: RoundReviewHighlight[];
  areasForImprovement: RoundReviewImprovementArea[];
  keyStats: RoundReviewKeyStat[];
  recommendations: string[];
  overallGrade: OverallGrade;
}

export interface StoredRoundReview {
  id: string;
  player_id: string;
  round_id: string;
  review_content: RoundReviewContent;
  generated_at: string;
  ai_model_version: string;
  shared_with_coach: boolean;
  shared_at: string | null;
  coach_notes: string | null;
  coach_viewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface RoundReviewWithRound extends StoredRoundReview {
  round: {
    id: string;
    player_id: string;
    course_name: string | null;
    round_date: string;
    total_score: number | null;
    score_to_par: number | null;
    total_putts: number | null;
    total_fairways_hit: number | null;
    total_fairways: number | null;
    total_gir: number | null;
    total_gir_possible: number | null;
  };
}

// Internal round type for processing (matches database.types.ts schema)
interface RoundData {
  id: string;
  player_id: string;
  course_name: string | null;
  round_date: string;
  total_score: number | null;
  score_to_par: number | null;
  total_putts: number | null;
  total_fairways_hit: number | null;
  total_fairways: number | null;
  total_gir: number | null;
  total_gir_possible: number | null;
  status?: string;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Determine sentiment based on score to par
 */
function determineSentiment(scoreToPar: number | null): ReviewSentiment {
  if (scoreToPar === null) return 'neutral';
  if (scoreToPar <= -1) return 'positive';
  if (scoreToPar <= 3) return 'neutral';
  return 'challenging';
}

/**
 * Determine overall grade based on performance
 */
function determineGrade(
  scoreToPar: number | null,
  girPct: number | null,
  fairwayPct: number | null,
  putts: number | null
): OverallGrade {
  let score = 0;
  let factors = 0;

  // Score to par (most important)
  if (scoreToPar !== null) {
    if (scoreToPar <= -3) score += 5;
    else if (scoreToPar <= -1) score += 4;
    else if (scoreToPar <= 1) score += 3.5;
    else if (scoreToPar <= 3) score += 3;
    else if (scoreToPar <= 5) score += 2;
    else if (scoreToPar <= 8) score += 1;
    factors += 2; // Weight score to par more heavily
    score *= 2;
  }

  // GIR percentage
  if (girPct !== null) {
    if (girPct >= 70) score += 5;
    else if (girPct >= 60) score += 4;
    else if (girPct >= 50) score += 3;
    else if (girPct >= 40) score += 2;
    else score += 1;
    factors++;
  }

  // Fairway percentage
  if (fairwayPct !== null) {
    if (fairwayPct >= 70) score += 5;
    else if (fairwayPct >= 60) score += 4;
    else if (fairwayPct >= 50) score += 3;
    else if (fairwayPct >= 40) score += 2;
    else score += 1;
    factors++;
  }

  // Putts per round
  if (putts !== null) {
    if (putts <= 28) score += 5;
    else if (putts <= 30) score += 4;
    else if (putts <= 32) score += 3;
    else if (putts <= 34) score += 2;
    else score += 1;
    factors++;
  }

  if (factors === 0) return 'C';

  const avg = score / factors;
  if (avg >= 4.2) return 'A';
  if (avg >= 3.5) return 'B';
  if (avg >= 2.5) return 'C';
  if (avg >= 1.5) return 'D';
  return 'F';
}

/**
 * Generate review content from round data
 */
function generateReviewContent(
  round: RoundData,
  playerAvgs: {
    avgScore: number;
    avgPutts: number;
    avgGirPct: number;
    avgFairwayPct: number;
  } | null
): RoundReviewContent {
  const highlights: RoundReviewHighlight[] = [];
  const areasForImprovement: RoundReviewImprovementArea[] = [];
  const keyStats: RoundReviewKeyStat[] = [];
  const recommendations: string[] = [];

  const scoreToPar = round.score_to_par ?? 0;
  const totalScore = round.total_score ?? 72;
  const putts = round.total_putts;
  const fairwaysHit = round.total_fairways_hit;
  const fairwaysPossible = round.total_fairways ?? 14;
  const girHit = round.total_gir;
  const girPossible = round.total_gir_possible ?? 18;

  const fairwayPct = fairwaysHit !== null && fairwaysPossible > 0
    ? Math.round((fairwaysHit / fairwaysPossible) * 100)
    : null;

  const girPct = girHit !== null && girPossible > 0
    ? Math.round((girHit / girPossible) * 100)
    : null;

  // Determine sentiment and grade
  const sentiment = determineSentiment(scoreToPar);
  const overallGrade = determineGrade(scoreToPar, girPct, fairwayPct, putts);

  // Generate summary based on performance
  let summary = '';
  if (scoreToPar <= -3) {
    summary = `Outstanding round of ${totalScore}! This was an exceptional performance that showcases your potential at the highest level. `;
  } else if (scoreToPar <= -1) {
    summary = `Solid under-par round of ${totalScore}. This performance demonstrates strong fundamentals and good scoring ability. `;
  } else if (scoreToPar === 0) {
    summary = `Even-par round of ${totalScore}. A steady, consistent performance that shows good course management. `;
  } else if (scoreToPar <= 3) {
    summary = `Round of ${totalScore} (+${scoreToPar}). A respectable effort with room for improvement in key areas. `;
  } else if (scoreToPar <= 6) {
    summary = `Challenging round of ${totalScore} (+${scoreToPar}). Let's identify the patterns that led to dropped shots and create a plan for improvement. `;
  } else {
    summary = `Tough day on the course with a ${totalScore} (+${scoreToPar}). Every round is a learning opportunity - let's analyze what happened and build from it. `;
  }

  // Analyze putting
  if (putts !== null) {
    const comparison: StatComparison =
      playerAvgs && putts < playerAvgs.avgPutts - 1 ? 'above' :
      playerAvgs && putts > playerAvgs.avgPutts + 1 ? 'below' : 'average';

    keyStats.push({
      label: 'Total Putts',
      value: putts.toString(),
      comparison,
    });

    if (putts <= 28) {
      highlights.push({
        title: 'Excellent Putting',
        description: `${putts} putts demonstrates exceptional touch on the greens. Your lag putting and short putt conversion were both strong.`,
      });
      summary += `Your putting was the star of this round. `;
    } else if (putts >= 34) {
      areasForImprovement.push({
        area: 'Putting',
        recommendation: 'Focus on lag putting to reduce three-putts, and work on 4-6 foot putts to improve conversion rate.',
      });
      recommendations.push('Schedule a putting session focusing on distance control from 20+ feet');
    }
  }

  // Analyze GIR
  if (girPct !== null) {
    const comparison: StatComparison =
      playerAvgs && girPct > playerAvgs.avgGirPct + 5 ? 'above' :
      playerAvgs && girPct < playerAvgs.avgGirPct - 5 ? 'below' : 'average';

    keyStats.push({
      label: 'Greens in Regulation',
      value: `${girPct}%`,
      comparison,
    });

    if (girPct >= 65) {
      highlights.push({
        title: 'Strong Ball Striking',
        description: `Hitting ${girPct}% of greens shows excellent approach play and iron precision.`,
      });
    } else if (girPct < 45) {
      areasForImprovement.push({
        area: 'Approach Shots',
        recommendation: 'Work on distance control with your irons, particularly from 125-175 yards.',
      });
      recommendations.push('Practice approach shots from your most common yardages');
    }
  }

  // Analyze fairways
  if (fairwayPct !== null) {
    const comparison: StatComparison =
      playerAvgs && fairwayPct > playerAvgs.avgFairwayPct + 5 ? 'above' :
      playerAvgs && fairwayPct < playerAvgs.avgFairwayPct - 5 ? 'below' : 'average';

    keyStats.push({
      label: 'Fairways Hit',
      value: `${fairwayPct}%`,
      comparison,
    });

    if (fairwayPct >= 70) {
      highlights.push({
        title: 'Accurate Driving',
        description: `${fairwayPct}% fairways hit shows excellent control off the tee.`,
      });
    } else if (fairwayPct < 45) {
      areasForImprovement.push({
        area: 'Driving Accuracy',
        recommendation: 'Consider using a more controlled swing or different club on tight holes.',
      });
      recommendations.push('Identify your miss pattern (left/right) and adjust your aim accordingly');
    }
  }

  // Add default recommendations if needed
  if (recommendations.length === 0) {
    if (sentiment === 'positive') {
      recommendations.push('Keep up the great work and maintain your current practice routine');
      recommendations.push('Consider scheduling a playing lesson to fine-tune your course management');
    } else if (sentiment === 'neutral') {
      recommendations.push('Review your pre-shot routine for consistency');
      recommendations.push('Track your stats over the next few rounds to identify patterns');
    } else {
      recommendations.push('Focus on the fundamentals in your next practice session');
      recommendations.push('Consider a short game focused practice session');
    }
  }

  // Add highlights if we have none
  if (highlights.length === 0 && sentiment !== 'challenging') {
    highlights.push({
      title: 'Completed Round',
      description: 'Finishing strong and logging your stats is the first step to improvement.',
    });
  }

  return {
    summary,
    sentiment,
    highlights,
    areasForImprovement,
    keyStats,
    recommendations,
    overallGrade,
  };
}

// ============================================================================
// SERVER ACTIONS
// ============================================================================

/**
 * Get existing round review by round ID
 */
export async function getRoundReview(roundId: string): Promise<{
  success: boolean;
  review?: RoundReviewWithRound;
  error?: string;
}> {
  const supabase = await createClient();

  try {
    // First check if review exists in the golf_round_reviews table
    const { data: existingReview, error: fetchError } = await supabase
      .from('golf_round_reviews')
      .select(`
        *,
        round:golf_rounds!inner(
          id,
          player_id,
          course_name,
          round_date,
          total_score,
          score_to_par,
          total_putts,
          total_fairways_hit,
          total_fairways,
          total_gir,
          total_gir_possible
        )
      `)
      .eq('round_id', roundId)
      .maybeSingle();

    if (fetchError) {
      return { success: false, error: 'Failed to fetch review' };
    }

    if (!existingReview) {
      return { success: true, review: undefined };
    }

    // Transform the data to our expected format
    const roundData = existingReview.round as RoundData;
    const review: RoundReviewWithRound = {
      id: existingReview.id,
      player_id: existingReview.player_id,
      round_id: existingReview.round_id,
      review_content: (existingReview.round_stats as unknown as RoundReviewContent) || generateReviewContent(
        roundData,
        null
      ),
      generated_at: existingReview.created_at ?? new Date().toISOString(),
      ai_model_version: existingReview.engine_version ?? 'v1.0',
      shared_with_coach: existingReview.shared_with_coach ?? false,
      shared_at: existingReview.shared_at,
      coach_notes: existingReview.coach_notes,
      coach_viewed_at: existingReview.coach_viewed_at,
      created_at: existingReview.created_at ?? new Date().toISOString(),
      updated_at: existingReview.updated_at ?? new Date().toISOString(),
      round: roundData,
    };

    return { success: true, review };
  } catch (error) {
    console.error('Error fetching round review:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

/**
 * Generate and store a new round review
 */
export async function generateAndStoreRoundReview(
  roundId: string,
  playerId: string
): Promise<{
  success: boolean;
  review?: RoundReviewWithRound;
  error?: string;
}> {
  const supabase = await createClient();

  try {
    // 1. Verify user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return { success: false, error: 'Not authenticated' };
    }

    // 2. Get the round data
    const { data: round, error: roundError } = await supabase
      .from('golf_rounds')
      .select(`
        id,
        player_id,
        course_name,
        round_date,
        total_score,
        score_to_par,
        total_putts,
        total_fairways_hit,
        total_fairways,
        total_gir,
        total_gir_possible,
        status
      `)
      .eq('id', roundId)
      .single();

    if (roundError || !round) {
      return { success: false, error: 'Round not found' };
    }

    const roundData = round as unknown as RoundData;

    if (roundData.status !== 'completed') {
      return { success: false, error: 'Round must be completed before generating a review' };
    }

    // 3. Get player averages for comparison
    const { data: playerRounds } = await supabase
      .from('golf_rounds')
      .select('total_score, total_putts, total_gir, total_gir_possible, total_fairways_hit, total_fairways')
      .eq('player_id', playerId)
      .eq('status', 'completed')
      .not('total_score', 'is', null)
      .neq('id', roundId)
      .order('round_date', { ascending: false })
      .limit(20);

    let playerAvgs = null;
    if (playerRounds && playerRounds.length >= 3) {
      const validRounds = playerRounds.filter(r => r.total_score !== null);
      const avgScore = validRounds.reduce((sum, r) => sum + (r.total_score ?? 0), 0) / validRounds.length;
      const avgPutts = validRounds.filter(r => r.total_putts !== null).reduce((sum, r) => sum + (r.total_putts ?? 0), 0) /
        validRounds.filter(r => r.total_putts !== null).length || 32;

      const girRounds = validRounds.filter(r => r.total_gir !== null && r.total_gir_possible);
      const avgGirPct = girRounds.length > 0
        ? girRounds.reduce((sum, r) => {
            const pct = ((r.total_gir ?? 0) / (r.total_gir_possible ?? 18)) * 100;
            return sum + pct;
          }, 0) / girRounds.length
        : 50;

      const fwRounds = validRounds.filter(r => r.total_fairways_hit !== null && r.total_fairways);
      const avgFairwayPct = fwRounds.length > 0
        ? fwRounds.reduce((sum, r) => {
            const pct = ((r.total_fairways_hit ?? 0) / (r.total_fairways ?? 14)) * 100;
            return sum + pct;
          }, 0) / fwRounds.length
        : 50;

      playerAvgs = { avgScore, avgPutts, avgGirPct, avgFairwayPct };
    }

    // 4. Generate review content
    const reviewContent = generateReviewContent(roundData, playerAvgs);

    // 5. Try to get enhanced AI review from CoachHelm
    let aiEnhanced = false;
    try {
      const aiResult = await generateAIRoundReview(roundId, playerId);
      if (aiResult.success && aiResult.review) {
        // Merge AI insights with our review content
        if (aiResult.review.summary) {
          reviewContent.summary = aiResult.review.summary;
        }
        if (aiResult.review.primaryTakeaway) {
          reviewContent.recommendations.unshift(aiResult.review.primaryTakeaway);
        }
        aiEnhanced = true;
      }
    } catch (err) {
      // AI enhancement failed, continue with rule-based review
      console.error('[GolfHelm] AI review enhancement failed, using rule-based review:', err);
    }

    // 6. Check if review already exists
    const { data: existingReview } = await supabase
      .from('golf_round_reviews')
      .select('id')
      .eq('round_id', roundId)
      .maybeSingle();

    let reviewId: string;

    if (existingReview) {
      // Update existing review
      const { error: updateError } = await supabase
        .from('golf_round_reviews')
        .update({
          round_stats: reviewContent as unknown as Json,
          summary: reviewContent.summary,
          highlights: reviewContent.highlights as unknown as Json,
          areas_to_review: reviewContent.areasForImprovement as unknown as Json,
          engine_version: aiEnhanced ? 'coachhelm-v2' : 'rule-based-v1',
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingReview.id);

      if (updateError) {
        return { success: false, error: 'Failed to update review' };
      }

      reviewId = existingReview.id;
    } else {
      // Create new review
      const { data: newReview, error: insertError } = await supabase
        .from('golf_round_reviews')
        .insert({
          round_id: roundId,
          player_id: playerId,
          round_stats: reviewContent as unknown as Json,
          summary: reviewContent.summary,
          highlights: reviewContent.highlights as unknown as Json,
          areas_to_review: reviewContent.areasForImprovement as unknown as Json,
          round_score: roundData.total_score,
          round_score_to_par: roundData.score_to_par,
          engine_version: aiEnhanced ? 'coachhelm-v2' : 'rule-based-v1',
        })
        .select('id')
        .single();

      if (insertError || !newReview) {
        return { success: false, error: 'Failed to create review' };
      }

      reviewId = newReview.id;
    }

    // 7. Revalidate paths
    revalidatePath('/golf/dashboard/rounds');
    revalidatePath(`/golf/dashboard/rounds/${roundId}`);
    revalidatePath(`/golf/dashboard/rounds/${roundId}/review`);

    // 8. Return the complete review
    const review: RoundReviewWithRound = {
      id: reviewId,
      player_id: playerId,
      round_id: roundId,
      review_content: reviewContent,
      generated_at: new Date().toISOString(),
      ai_model_version: aiEnhanced ? 'coachhelm-v2' : 'rule-based-v1',
      shared_with_coach: false,
      shared_at: null,
      coach_notes: null,
      coach_viewed_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      round: {
        id: roundData.id,
        player_id: roundData.player_id,
        course_name: roundData.course_name,
        round_date: roundData.round_date,
        total_score: roundData.total_score,
        score_to_par: roundData.score_to_par,
        total_putts: roundData.total_putts,
        total_fairways_hit: roundData.total_fairways_hit,
        total_fairways: roundData.total_fairways,
        total_gir: roundData.total_gir,
        total_gir_possible: roundData.total_gir_possible,
      },
    };

    return { success: true, review };
  } catch (error) {
    console.error('Error generating round review:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

/**
 * Regenerate a round review with latest AI
 */
export async function regenerateRoundReview(roundId: string): Promise<{
  success: boolean;
  review?: RoundReviewWithRound;
  error?: string;
}> {
  const supabase = await createClient();

  try {
    // Get the round to find player_id
    const { data: round, error: roundError } = await supabase
      .from('golf_rounds')
      .select('player_id')
      .eq('id', roundId)
      .single();

    if (roundError || !round) {
      return { success: false, error: 'Round not found' };
    }

    // Force regeneration by calling generateAndStoreRoundReview
    return generateAndStoreRoundReview(roundId, round.player_id);
  } catch (error) {
    console.error('Error regenerating round review:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

/**
 * Share a round review with the coach
 */
export async function shareRoundReviewWithCoach(reviewId: string): Promise<{
  success: boolean;
  error?: string;
}> {
  const supabase = await createClient();

  try {
    const { error } = await supabase
      .from('golf_round_reviews')
      .update({
        shared_with_coach: true,
        shared_at: new Date().toISOString(),
      })
      .eq('id', reviewId);

    if (error) {
      return { success: false, error: 'Failed to share review' };
    }

    revalidatePath('/golf/dashboard/rounds');
    return { success: true };
  } catch (error) {
    console.error('Error sharing review:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

/**
 * Get player and team averages for stat comparison
 */
export async function getStatAverages(
  playerId: string,
  teamId?: string
): Promise<{
  success: boolean;
  playerAvg?: {
    avgScore: number;
    avgPutts: number;
    avgGirPct: number;
    avgFairwayPct: number;
  };
  teamAvg?: {
    avgScore: number;
    avgPutts: number;
    avgGirPct: number;
    avgFairwayPct: number;
  };
  error?: string;
}> {
  const supabase = await createClient();

  try {
    // Get player averages from last 20 rounds
    const { data: playerRounds, error: playerError } = await supabase
      .from('golf_rounds')
      .select('total_score, total_putts, total_gir, total_gir_possible, total_fairways_hit, total_fairways')
      .eq('player_id', playerId)
      .eq('status', 'completed')
      .not('total_score', 'is', null)
      .order('round_date', { ascending: false })
      .limit(20);

    if (playerError) {
      return { success: false, error: 'Failed to fetch player stats' };
    }

    let playerAvg = undefined;
    if (playerRounds && playerRounds.length >= 3) {
      const validRounds = playerRounds.filter(r => r.total_score !== null);
      const avgScore = validRounds.reduce((sum, r) => sum + (r.total_score ?? 0), 0) / validRounds.length;
      const avgPutts = validRounds.filter(r => r.total_putts !== null).reduce((sum, r) => sum + (r.total_putts ?? 0), 0) /
        validRounds.filter(r => r.total_putts !== null).length || 32;

      const girRounds = validRounds.filter(r => r.total_gir !== null && r.total_gir_possible);
      const avgGirPct = girRounds.length > 0
        ? girRounds.reduce((sum, r) => {
            const pct = ((r.total_gir ?? 0) / (r.total_gir_possible ?? 18)) * 100;
            return sum + pct;
          }, 0) / girRounds.length
        : 50;

      const fwRounds = validRounds.filter(r => r.total_fairways_hit !== null && r.total_fairways);
      const avgFairwayPct = fwRounds.length > 0
        ? fwRounds.reduce((sum, r) => {
            const pct = ((r.total_fairways_hit ?? 0) / (r.total_fairways ?? 14)) * 100;
            return sum + pct;
          }, 0) / fwRounds.length
        : 50;

      playerAvg = { avgScore, avgPutts, avgGirPct, avgFairwayPct };
    }

    // Get team averages if team ID provided
    let teamAvg = undefined;
    if (teamId) {
      const { data: teamMembers } = await supabase
        .from('golf_team_members')
        .select('player_id')
        .eq('team_id', teamId);

      if (teamMembers && teamMembers.length > 0) {
        const playerIds = teamMembers.map(m => m.player_id);
        const { data: teamRounds } = await supabase
          .from('golf_rounds')
          .select('total_score, total_putts, total_gir, total_gir_possible, total_fairways_hit, total_fairways')
          .in('player_id', playerIds)
          .eq('status', 'completed')
          .not('total_score', 'is', null)
          .gte('round_date', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
          .limit(100);

        if (teamRounds && teamRounds.length >= 5) {
          const validRounds = teamRounds.filter(r => r.total_score !== null);
          const avgScore = validRounds.reduce((sum, r) => sum + (r.total_score ?? 0), 0) / validRounds.length;
          const avgPutts = validRounds.filter(r => r.total_putts !== null).reduce((sum, r) => sum + (r.total_putts ?? 0), 0) /
            validRounds.filter(r => r.total_putts !== null).length || 32;

          const girRounds = validRounds.filter(r => r.total_gir !== null && r.total_gir_possible);
          const avgGirPct = girRounds.length > 0
            ? girRounds.reduce((sum, r) => {
                const pct = ((r.total_gir ?? 0) / (r.total_gir_possible ?? 18)) * 100;
                return sum + pct;
              }, 0) / girRounds.length
            : 50;

          const fwRounds = validRounds.filter(r => r.total_fairways_hit !== null && r.total_fairways);
          const avgFairwayPct = fwRounds.length > 0
            ? fwRounds.reduce((sum, r) => {
                const pct = ((r.total_fairways_hit ?? 0) / (r.total_fairways ?? 14)) * 100;
                return sum + pct;
              }, 0) / fwRounds.length
            : 50;

          teamAvg = { avgScore, avgPutts, avgGirPct, avgFairwayPct };
        }
      }
    }

    return { success: true, playerAvg, teamAvg };
  } catch (error) {
    console.error('Error fetching stat averages:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
}
