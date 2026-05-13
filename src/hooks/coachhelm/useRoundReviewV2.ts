'use client';

/**
 * useRoundReview - Hook for generating and managing CoachHelm round reviews
 *
 * Features:
 * - Load existing reviews from database
 * - Generate AI-powered reviews via CoachHelm
 * - Share reviews with coach
 * - Check CoachHelm enabled status
 * - Supports both player and coach access
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { RoundReview } from '@/lib/coachhelm/types';
import type { IntelligentRoundReview } from '@/lib/coachhelm/v2/types';
import { generateRoundReview as generateAIRoundReview, getCoachHelmStatus } from '@/app/golf/actions/insights';
import { generateAndStoreRoundReview, type RoundReviewContent } from '@/app/golf/actions/round-review-system';

// Map database row to TypeScript RoundReview type
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

interface UseRoundReviewResult {
  // Standard review data (always available)
  review: RoundReview | null;

  // Rule-based review content (always available when review exists)
  ruleBasedContent: RoundReviewContent | null;

  // Enhanced AI review data (when CoachHelm is enabled)
  intelligentReview: IntelligentRoundReview | null;
  isCoachHelmEnabled: boolean;

  // Legacy property names for backwards compatibility
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

function useRoundReview(roundId: string | null, isCoach?: boolean): UseRoundReviewResult {
  const [review, setReview] = useState<RoundReview | null>(null);
  const [ruleBasedContent, setRuleBasedContent] = useState<RoundReviewContent | null>(null);
  const [intelligentReview, setIntelligentReview] = useState<IntelligentRoundReview | null>(null);
  const [isCoachHelmEnabled, setIsCoachHelmEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);

  // Use ref to keep a stable supabase reference
  const supabaseRef = useRef(createClient());

  // Single-flight guard for generate(). Two effects historically raced here:
  // (a) the post-mount setTimeout retry inside fetchReviewAndCheckStatus, and
  // (b) the auto-retry effect at the bottom of this hook. If both fired the
  // server got two concurrent generateAndStoreRoundReview calls for the same
  // round, which competed for the (round_id) UNIQUE row and burned compute.
  // While a generate() promise is in flight, every additional caller awaits
  // the same promise instead of starting a new one.
  const inFlightRef = useRef<Promise<void> | null>(null);

  // Fetch existing review and check CoachHelm status
  useEffect(() => {
    if (!roundId) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    const currentRoundId = roundId;
    const supabase = supabaseRef.current;

    async function fetchReview(): Promise<boolean> {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error: fetchError } = await (supabase as any)
        .from('golf_round_reviews')
        .select('*')
        .eq('round_id', currentRoundId)
        .maybeSingle();

      if (!fetchError && data && data.summary) {
        if (!cancelled) {
          setReview(dbToReview(data as Record<string, unknown>));

          // If the review has rule-based content stored in round_stats, extract it
          const roundStats = data.round_stats;
          if (roundStats && typeof roundStats === 'object' && 'summary' in roundStats) {
            const content = roundStats as RoundReviewContent;
            // Sanitize stale NaN text from previously generated reviews
            if (content.summary && content.summary.includes('NaN')) {
              content.summary = content.summary
                .replace(/This occurs in NaN% of rounds with NaN% reliability\.?\s*/g, '')
                .replace(/\bNaN%/g, '')
                .replace(/\bNaN\b/g, '')
                .replace(/\s{2,}/g, ' ')
                .trim();
            }
            setRuleBasedContent(content);
          }
        }
        return true;
      }
      return false;
    }

    async function fetchReviewAndCheckStatus() {
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

        if (!cancelled) setPlayerId(round.player_id);

        // Check CoachHelm status - for coaches, also check coach-level
        let enabled = false;
        try {
          const playerStatus = await getCoachHelmStatus('player', round.player_id);
          enabled = playerStatus.enabled;

          // If coach and player status isn't enabled, check coach-level too
          if (!enabled && isCoach) {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
              const { data: coach } = await supabase
                .from('golf_coaches')
                .select('id')
                .eq('user_id', user.id)
                .single();
              if (coach) {
                const coachStatus = await getCoachHelmStatus('coach', coach.id);
                enabled = coachStatus.enabled;
              }
            }
          }
        } catch {
          // CoachHelm status check failed, continue without it
        }
        if (!cancelled) setIsCoachHelmEnabled(enabled);

        // Fetch existing review - wrapped in try/catch for RLS issues.
        //
        // NOTE: A previous version retried after a 3-second setTimeout on the
        // theory that a background generator might still be writing. That path
        // raced with the auto-retry effect at the bottom of this hook (both
        // could fire generate() concurrently for the same round). The single-
        // flight inFlightRef in generate() now serializes those calls, and the
        // auto-retry effect handles late completion via state-driven retry.
        try {
          await fetchReview();
        } catch {
          // Silently skip if table doesn't exist or RLS blocks
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load review');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchReviewAndCheckStatus();

    return () => { cancelled = true; };
  }, [roundId, isCoach]);

  // Generate review - uses rule-based generator (always works) with optional AI enhancement
  const generate = useCallback(async () => {
    if (!roundId || !playerId) return;

    // Single-flight: if a generation is already running, await that one
    // instead of dispatching a second concurrent call. See inFlightRef comment.
    if (inFlightRef.current) {
      return inFlightRef.current;
    }

    const run = (async () => {
      setGenerating(true);
      setError(null);

      try {
        // Primary path: generateAndStoreRoundReview from round-review-system.ts
        // This ALWAYS works with rule-based analysis and optionally enhances with CoachHelm AI
        const result = await generateAndStoreRoundReview(roundId, playerId);

        if (result.success && result.review) {
          // Extract the review_content which has our RoundReviewContent shape
          const content = result.review.review_content;

          // Store the full rule-based content for the viewer
          setRuleBasedContent(content);

          // Build a RoundReview from the stored review data
          //
          // NOTE: This is a V1-fallback shape. `playerAverages` is intentionally
          // null here — the real averages live in `golf_round_reviews.player_averages`
          // and on the canonical `/rounds/[id]/review` page come from
          // `getStatAverages(playerId)`. We previously zeroed every field, which
          // any consumer that reads this prop renders as "0/0/0" stat
          // comparisons (anti-marketing risk). Consumers MUST null-check
          // `playerAverages` before reading it. The hook return type still says
          // `RoundReview`, but at runtime this slot is now nullable in the V1
          // fallback path; A5 (review/page.tsx) is informed.
          const basicReview = {
            id: result.review.id,
            roundId: result.review.round_id,
            playerId: result.review.player_id,
            roundScore: result.review.round?.total_score ?? 0,
            roundScoreToPar: result.review.round?.score_to_par ?? 0,
            scoringAvgBefore: null,
            scoringAvgAfter: null,
            qualifyingPositionBefore: null,
            qualifyingPositionAfter: null,
            gapToNextPosition: null,
            goalImpacts: [],
            highlights: [],
            areasToReview: [],
            roundStats: {
              totalScore: result.review.round?.total_score ?? 0,
              scoreToPar: result.review.round?.score_to_par ?? 0,
              frontNine: 0,
              backNine: 0,
              eagles: 0,
              birdies: 0,
              pars: 0,
              bogeys: 0,
              doublePlus: 0,
              fairwaysHit: result.review.round?.total_fairways_hit ?? 0,
              fairwaysPossible: result.review.round?.total_fairways ?? 14,
              fairwayPct: result.review.round?.total_fairways
                ? Math.round(((result.review.round?.total_fairways_hit ?? 0) / result.review.round.total_fairways) * 100)
                : 0,
              greensHit: result.review.round?.total_gir ?? 0,
              greensPossible: result.review.round?.total_gir_possible ?? 18,
              girPct: result.review.round?.total_gir_possible
                ? Math.round(((result.review.round?.total_gir ?? 0) / result.review.round.total_gir_possible) * 100)
                : 0,
              totalPutts: result.review.round?.total_putts ?? 0,
              puttsPerHole: result.review.round?.total_putts ? +(result.review.round.total_putts / 18).toFixed(2) : 0,
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
            // Null instead of zeroed RoundStats — see note above. Cast through
            // unknown because the canonical `RoundReview` type (owned outside
            // this file) still types this slot as non-null `RoundStats`.
            playerAverages: null as unknown as RoundReview['playerAverages'],
            teamAverages: null,
            strokesGained: null,
            patternsDetected: [],
            patternsRecurring: [],
            summary: content?.summary ?? 'Round review generated.',
            primaryTakeaway: content?.recommendations?.[0] ?? '',
            nextPracticePriority: content?.recommendations?.[1] ?? null,
            linkedFocusAreaId: null,
            sharedWithCoach: result.review.shared_with_coach ?? false,
            sharedAt: result.review.shared_at ?? null,
            coachViewedAt: result.review.coach_viewed_at ?? null,
            coachNotes: result.review.coach_notes ?? null,
            createdAt: result.review.created_at,
          } satisfies RoundReview;
          setReview(basicReview);

          // If CoachHelm is enabled, also try to get the enhanced AI review
          if (isCoachHelmEnabled) {
            try {
              const aiResult = await generateAIRoundReview(roundId, playerId);
              if (aiResult.success && aiResult.review) {
                setIntelligentReview(aiResult.review);
              }
            } catch {
              // AI enhancement failed, rule-based review is already set above
            }
          }

          return;
        }

        // If generateAndStoreRoundReview failed, show error
        throw new Error(result.error || 'Failed to generate review');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to generate review');
      } finally {
        setGenerating(false);
      }
    })();

    inFlightRef.current = run;
    try {
      await run;
    } finally {
      // Always clear the in-flight ref so a future user-initiated retry can
      // dispatch a fresh call. Concurrent callers awaiting this same promise
      // will still resolve from the original run.
      inFlightRef.current = null;
    }
  }, [roundId, playerId, isCoachHelmEnabled]);

  // Share with coach
  const shareWithCoach = useCallback(async () => {
    if (!review?.id) return false;
    const supabase = supabaseRef.current;

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
  }, [review?.id]);

  // Auto-generate once when a round has no cached review. Keeps the round
  // detail page from sitting on an empty "Generate review" prompt — the
  // review materializes on mount if the backing data exists.
  //
  // Data guard: only auto-fire when the round actually has score or shot
  // data. Empty/in-progress rounds otherwise burn a generator pass and
  // produce noisy "insufficient data" errors.
  const autoGenAttempted = useRef(false);
  const [hasRoundData, setHasRoundData] = useState(false);
  useEffect(() => {
    if (!roundId) {
      setHasRoundData(false);
      return;
    }
    let cancelled = false;
    const supabase = supabaseRef.current;
    (async () => {
      const { data: round } = await supabase
        .from('golf_rounds')
        .select('total_score, status')
        .eq('id', roundId)
        .maybeSingle();
      if (cancelled) return;
      const r = round as { total_score: number | null; status: string | null } | null;
      const hasScore = r?.total_score !== null && r?.total_score !== undefined;
      const isCompleted = r?.status === 'completed';
      if (hasScore || isCompleted) {
        setHasRoundData(true);
        return;
      }
      // Fall back to a shot-existence probe — short rounds without a cached
      // total_score still warrant generation if any shots were logged.
      const { count } = await supabase
        .from('golf_shots')
        .select('id', { count: 'exact', head: true })
        .eq('round_id', roundId);
      if (cancelled) return;
      setHasRoundData((count ?? 0) > 0);
    })();
    return () => { cancelled = true; };
  }, [roundId]);

  const needsGeneration = !loading && !review && !intelligentReview;
  useEffect(() => {
    if (!needsGeneration) return;
    if (generating) return;
    if (autoGenAttempted.current) return;
    if (!roundId || !playerId) return;
    if (!hasRoundData) return;
    autoGenAttempted.current = true;
    void generate();
  }, [needsGeneration, generating, roundId, playerId, generate, hasRoundData]);

  return {
    review,
    ruleBasedContent,
    intelligentReview,
    isCoachHelmEnabled,
    // Legacy property names for backwards compatibility
    v2Review: intelligentReview,
    isV2Enabled: isCoachHelmEnabled,
    loading,
    generating,
    error,
    generate,
    shareWithCoach,
    needsGeneration,
  };
}

// Backwards compatible alias
export const useRoundReviewV2 = useRoundReview;

