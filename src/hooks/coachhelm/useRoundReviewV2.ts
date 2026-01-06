'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { RoundReview } from '@/lib/coachhelm/types';
import type { IntelligentRoundReview } from '@/lib/coachhelm/v2/types';
import { generateRoundReviewV2, getCoachHelmStatus } from '@/app/golf/actions/insights-v2';

// Map database to TypeScript for V1 reviews
function dbToReview(row: Record<string, unknown>): RoundReview {
  return {
    id: row.id as string,
    roundId: row.round_id as string,
    playerId: row.player_id as string,
    roundScore: row.round_score as number,
    roundScoreToPar: row.round_score_to_par as number,
    scoringAvgBefore: row.scoring_avg_before ? parseFloat(row.scoring_avg_before as string) : null,
    scoringAvgAfter: row.scoring_avg_after ? parseFloat(row.scoring_avg_after as string) : null,
    qualifyingPositionBefore: row.qualifying_position_before as number | null,
    qualifyingPositionAfter: row.qualifying_position_after as number | null,
    gapToNextPosition: row.gap_to_next_position ? parseFloat(row.gap_to_next_position as string) : null,
    goalImpacts: (row.goal_impacts as RoundReview['goalImpacts']) || [],
    highlights: (row.highlights as RoundReview['highlights']) || [],
    areasToReview: (row.areas_to_review as RoundReview['areasToReview']) || [],
    roundStats: row.round_stats as RoundReview['roundStats'],
    playerAverages: row.player_averages as RoundReview['playerAverages'],
    teamAverages: row.team_averages as RoundReview['teamAverages'] | null,
    strokesGained: row.strokes_gained as RoundReview['strokesGained'],
    patternsDetected: (row.patterns_detected as RoundReview['patternsDetected']) || [],
    patternsRecurring: (row.patterns_recurring as RoundReview['patternsRecurring']) || [],
    summary: row.summary as string,
    primaryTakeaway: row.primary_takeaway as string,
    nextPracticePriority: row.next_practice_priority as string,
    linkedFocusAreaId: row.linked_focus_area_id as string | null,
    sharedWithCoach: row.shared_with_coach as boolean,
    sharedAt: row.shared_at as string | null,
    coachViewedAt: row.coach_viewed_at as string | null,
    coachNotes: row.coach_notes as string | null,
    createdAt: row.created_at as string,
  };
}

export interface UseRoundReviewV2Result {
  // V1 review data (always available)
  review: RoundReview | null;
  
  // V2 enhanced data (when V2 is enabled)
  v2Review: IntelligentRoundReview | null;
  isV2Enabled: boolean;
  
  // State
  loading: boolean;
  generating: boolean;
  error: string | null;
  
  // Actions
  generate: () => Promise<void>;
  shareWithCoach: () => Promise<boolean>;
  needsGeneration: boolean;
}

export function useRoundReviewV2(roundId: string | null): UseRoundReviewV2Result {
  const [review, setReview] = useState<RoundReview | null>(null);
  const [v2Review, setV2Review] = useState<IntelligentRoundReview | null>(null);
  const [isV2Enabled, setIsV2Enabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);

  const supabase = createClient();

  // Fetch existing review and check V2 status
  useEffect(() => {
    if (!roundId) {
      setLoading(false);
      return;
    }

    const currentRoundId = roundId;

    async function fetchReviewAndCheckV2() {
      setLoading(true);
      setError(null);

      try {
        // First, get the round to find the player_id
        const { data: round, error: roundError } = await supabase
          .from('golf_rounds')
          .select('player_id')
          .eq('id', currentRoundId)
          .single();

        if (roundError || !round) {
          setError('Round not found');
          setLoading(false);
          return;
        }

        setPlayerId(round.player_id);

        // Check if V2 is enabled for this player
        const status = await getCoachHelmStatus('player', round.player_id);
        setIsV2Enabled(status.enabled);

        // Fetch existing V1 review
        const { data, error: fetchError } = await (supabase as unknown as {
          from: (table: string) => {
            select: (columns: string) => {
              eq: (column: string, value: string) => {
                maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: Error | null }>;
              };
            };
          };
        }).from('golf_round_reviews')
          .select('*')
          .eq('round_id', currentRoundId)
          .maybeSingle();

        if (fetchError) {
          setError((fetchError as Error).message);
          setLoading(false);
          return;
        }

        if (data) {
          setReview(dbToReview(data));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load review');
      } finally {
        setLoading(false);
      }
    }

    fetchReviewAndCheckV2();
  }, [roundId, supabase]);

  // Generate review (uses V2 when enabled, falls back to V1)
  const generate = useCallback(async () => {
    if (!roundId || !playerId) return;

    setGenerating(true);
    setError(null);

    try {
      if (isV2Enabled) {
        // Try V2 first
        const result = await generateRoundReviewV2(roundId, playerId);
        
        if (result.success && result.review) {
          setV2Review(result.review);
          
          // Also create a basic V1-compatible review for display
          const basicReview: RoundReview = {
            id: '',
            roundId,
            playerId,
            roundScore: 0,
            roundScoreToPar: 0,
            scoringAvgBefore: null,
            scoringAvgAfter: null,
            qualifyingPositionBefore: null,
            qualifyingPositionAfter: null,
            gapToNextPosition: null,
            goalImpacts: [],
            highlights: [],
            areasToReview: [],
            roundStats: {
              totalScore: 0,
              scoreToPar: 0,
              frontNine: 0,
              backNine: 0,
              eagles: 0,
              birdies: 0,
              pars: 0,
              bogeys: 0,
              doublePlus: 0,
              fairwaysHit: 0,
              fairwaysPossible: 14,
              fairwayPct: 0,
              greensHit: 0,
              greensPossible: 18,
              girPct: 0,
              totalPutts: 0,
              puttsPerHole: 0,
              puttsPerGir: 0,
              onePutts: 0,
              threePutts: 0,
              upAndDowns: 0,
              upAndDownAttempts: 0,
              scramblePct: 0,
              sandSaves: 0,
              sandAttempts: 0,
              sandPct: 0,
            },
            playerAverages: {
              totalScore: 72,
              scoreToPar: 0,
              frontNine: 36,
              backNine: 36,
              eagles: 0,
              birdies: 0,
              pars: 0,
              bogeys: 0,
              doublePlus: 0,
              fairwaysHit: 0,
              fairwaysPossible: 14,
              fairwayPct: 50,
              greensHit: 0,
              greensPossible: 18,
              girPct: 50,
              totalPutts: 32,
              puttsPerHole: 1.78,
              puttsPerGir: 1.8,
              onePutts: 4,
              threePutts: 1,
              upAndDowns: 3,
              upAndDownAttempts: 6,
              scramblePct: 50,
              sandSaves: 1,
              sandAttempts: 2,
              sandPct: 50,
            },
            teamAverages: null,
            strokesGained: null,
            patternsDetected: [],
            patternsRecurring: [],
            summary: result.review.summary,
            primaryTakeaway: result.review.primaryTakeaway,
            nextPracticePriority: result.review.practicePriority,
            linkedFocusAreaId: null,
            sharedWithCoach: false,
            sharedAt: null,
            coachViewedAt: null,
            coachNotes: null,
            createdAt: new Date().toISOString(),
          };
          setReview(basicReview);
          return;
        }
        
        // Fall back to V1 if V2 fails
        console.warn('V2 review failed, falling back to V1:', result.error);
      }

      // V1 fallback
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
  }, [roundId, playerId, isV2Enabled]);

  // Share with coach
  const shareWithCoach = useCallback(async () => {
    if (!review?.id) return false;

    const { error: updateError } = await (supabase as unknown as {
      from: (table: string) => {
        update: (data: Record<string, unknown>) => {
          eq: (column: string, value: string) => Promise<{ error: Error | null }>;
        };
      };
    }).from('golf_round_reviews')
      .update({
        shared_with_coach: true,
        shared_at: new Date().toISOString(),
      })
      .eq('id', review.id);

    if (updateError) {
      setError((updateError as Error).message);
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
    v2Review,
    isV2Enabled,
    loading,
    generating,
    error,
    generate,
    shareWithCoach,
    needsGeneration: !loading && !review && !v2Review,
  };
}
