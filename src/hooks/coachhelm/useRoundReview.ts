'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { RoundReview } from '@/lib/coachhelm/types';

// Map database to TypeScript
function dbToReview(row: any): RoundReview {
  return {
    id: row.id,
    roundId: row.round_id,
    playerId: row.player_id,
    roundScore: row.round_score,
    roundScoreToPar: row.round_score_to_par,
    scoringAvgBefore: row.scoring_avg_before ? parseFloat(row.scoring_avg_before) : null,
    scoringAvgAfter: row.scoring_avg_after ? parseFloat(row.scoring_avg_after) : null,
    qualifyingPositionBefore: row.qualifying_position_before,
    qualifyingPositionAfter: row.qualifying_position_after,
    gapToNextPosition: row.gap_to_next_position ? parseFloat(row.gap_to_next_position) : null,
    goalImpacts: row.goal_impacts || [],
    highlights: row.highlights || [],
    areasToReview: row.areas_to_review || [],
    roundStats: row.round_stats,
    playerAverages: row.player_averages,
    teamAverages: row.team_averages,
    strokesGained: row.strokes_gained,
    patternsDetected: row.patterns_detected || [],
    patternsRecurring: row.patterns_recurring || [],
    summary: row.summary,
    primaryTakeaway: row.primary_takeaway,
    nextPracticePriority: row.next_practice_priority,
    linkedFocusAreaId: row.linked_focus_area_id,
    sharedWithCoach: row.shared_with_coach,
    sharedAt: row.shared_at,
    coachViewedAt: row.coach_viewed_at,
    coachNotes: row.coach_notes,
    createdAt: row.created_at,
  };
}

export function useRoundReview(roundId: string | null) {
  const [review, setReview] = useState<RoundReview | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();

  // Fetch existing review
  useEffect(() => {
    if (!roundId) {
      setLoading(false);
      return;
    }

    const currentRoundId = roundId;

    async function fetchReview() {
      setLoading(true);
      setError(null);

      // Note: golf_round_reviews table types will be available after running db:types
      const { data, error: fetchError } = await (supabase as any)
        .from('golf_round_reviews')
        .select('*')
        .eq('round_id', currentRoundId)
        .maybeSingle();

      if (fetchError) {
        setError(fetchError.message);
        setLoading(false);
        return;
      }

      if (data) {
        setReview(dbToReview(data));
      }
      // If no data, review needs to be generated

      setLoading(false);
    }

    fetchReview();
  }, [roundId, supabase]);

  // Generate review (calls API route)
  const generate = useCallback(async () => {
    if (!roundId) return;

    setGenerating(true);
    setError(null);

    try {
      const response = await fetch('/api/golf/rounds/generate-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roundId }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate review');
      }

      const data = await response.json();
      setReview(data.review);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate review');
    } finally {
      setGenerating(false);
    }
  }, [roundId]);

  // Share with coach
  const shareWithCoach = useCallback(async () => {
    if (!review?.id) return false;

    // Note: golf_round_reviews table types will be available after running db:types
    const { error: updateError } = await (supabase as any)
      .from('golf_round_reviews')
      .update({
        shared_with_coach: true,
        shared_at: new Date().toISOString(),
      })
      .eq('id', review.id);

    if (updateError) {
      setError(updateError.message);
      return false;
    }

    setReview(prev => prev ? {
      ...prev,
      sharedWithCoach: true,
      sharedAt: new Date().toISOString(),
    } : null);

    return true;
  }, [review?.id, supabase]);

  return {
    review,
    loading,
    generating,
    error,
    generate,
    shareWithCoach,
    needsGeneration: !loading && !review,
  };
}
