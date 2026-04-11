'use client';

/**
 * Round Review Page
 *
 * Displays AI-generated analysis of completed rounds using the
 * RoundReviewDisplay component with CoachHelm integration.
 */

import { useParams } from 'next/navigation';
import { useEffect, useState, useCallback, useMemo } from 'react';
import { m } from 'framer-motion';
import { containerVariants, itemVariants } from '@/components/golf/dashboard/premium-components';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useRoundReviewV2 } from '@/hooks/coachhelm/useRoundReviewV2';
import { useToast } from '@/components/ui/toast';
import { RoundReviewDisplay } from '@/components/golf/coachhelm/RoundReviewDisplay';
import { RoundStatsComparison } from '@/components/golf/coachhelm/RoundStatsComparison';
import { MobileNavHeader } from '@/components/golf/layout/MobileNavHeader';
import {
  getRoundReview,
  generateAndStoreRoundReview,
  getStatAverages,
  shareRoundReviewWithCoach,
  type RoundReviewWithRound,
} from '@/app/golf/actions/round-review-system';
import {
  CompletionCard,
  GoalImpactCard,
  ReviewScorecard,
  HighlightsSection,
  AreasToReviewSection,
  StrokesGainedSection,
  ReviewSummary,
  V2PatternsSection,
  V2PredictionCard,
  V2CausalInsights,
  V2ReviewSummary,
} from '@/components/golf/coachhelm/round-review';
import { IconSparkles, IconRefresh } from '@/components/icons';

// ============================================================================
// TYPES
// ============================================================================

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
  holes?: Array<{
    hole_number: number;
    score: number | null;
    par: number | null;
  }>;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function RoundReviewPage() {
  const params = useParams();
  const { addToast } = useToast();
  const roundId = params.id as string;

  // State
  const [round, setRound] = useState<RoundData | null>(null);
  const [storedReview, setStoredReview] = useState<RoundReviewWithRound | null>(null);
  const [playerAvg, setPlayerAvg] = useState<{
    avgScore: number;
    avgPutts: number;
    avgGirPct: number;
    avgFairwayPct: number;
  } | null>(null);
  const [teamAvg, setTeamAvg] = useState<{
    avgScore: number;
    avgPutts: number;
    avgGirPct: number;
    avgFairwayPct: number;
  } | null>(null);
  const [loadingRound, setLoadingRound] = useState(true);
  const [loadingStoredReview, setLoadingStoredReview] = useState(true);
  const [generatingReview, setGeneratingReview] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Use existing CoachHelm hook for V2 features
  const {
    review: v1Review,
    v2Review,
    isV2Enabled,
    loading: v1Loading,
    generating: v1Generating,
  } = useRoundReviewV2(roundId);

  const supabase = useMemo(() => createClient(), []);

  // Fetch round data with auth check — only allow viewing own rounds
  useEffect(() => {
    async function fetchRound() {
      setLoadingRound(true);
      try {
        // Get current user to verify ownership
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setError('Not authenticated');
          return;
        }

        // Get the player ID for the current user
        const { data: playerRecord } = await supabase
          .from('golf_players')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle();

        const currentPlayerId = playerRecord?.id;

        if (!currentPlayerId) {
          // Non-player users cannot view round reviews
          setError('You must be a player to view round reviews.');
          return;
        }

        // Fetch round — if user is a player, restrict to their own rounds
        let query = supabase
          .from('golf_rounds')
          .select('*, holes:golf_holes(*)')
          .eq('id', roundId);

        if (currentPlayerId) {
          query = query.eq('player_id', currentPlayerId);
        }

        const { data, error: fetchError } = await query.maybeSingle();

        if (fetchError || !data) {
          setError('Round not found');
          return;
        }

        if (data) {
          const roundData = data as RoundData;
          if (roundData.holes) {
            roundData.holes = roundData.holes.sort((a, b) => a.hole_number - b.hole_number);
          }
          setRound(roundData);
        }
      } catch {
        setError('Failed to load round');
      } finally {
        setLoadingRound(false);
      }
    }

    fetchRound();
  }, [roundId, supabase]);

  // Fetch stored review and averages
  useEffect(() => {
    async function fetchReviewAndAverages() {
      if (!round) return;

      setLoadingStoredReview(true);
      try {
        // Fetch stored review
        const reviewResult = await getRoundReview(roundId);
        if (reviewResult.success && reviewResult.review) {
          setStoredReview(reviewResult.review);
        }

        // Fetch averages for comparison
        const avgResult = await getStatAverages(round.player_id);
        if (avgResult.success) {
          setPlayerAvg(avgResult.playerAvg ?? null);
          setTeamAvg(avgResult.teamAvg ?? null);
        }
      } catch {
        // Silently ignore fetch errors
      } finally {
        setLoadingStoredReview(false);
      }
    }

    fetchReviewAndAverages();
  }, [round, roundId]);

  // Generate review if needed
  const generateReview = useCallback(async () => {
    if (!round) return;

    setGeneratingReview(true);
    setError(null);

    try {
      const result = await generateAndStoreRoundReview(roundId, round.player_id);

      if (result.success && result.review) {
        setStoredReview(result.review);
        addToast({
          type: 'success',
          title: 'Review Generated',
          description: 'AI analysis complete for your round.',
        });
      } else {
        setError(result.error ?? 'Failed to generate review');
      }
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setGeneratingReview(false);
    }
  }, [round, roundId, addToast]);

  // Auto-generate if no review exists (only once)
  const [autoGenerateAttempted, setAutoGenerateAttempted] = useState(false);
  useEffect(() => {
    if (!loadingRound && !loadingStoredReview && round && !storedReview && !generatingReview && !autoGenerateAttempted) {
      setAutoGenerateAttempted(true);
      generateReview();
    }
  }, [loadingRound, loadingStoredReview, round, storedReview, generatingReview, generateReview, autoGenerateAttempted]);

  // Handle share with coach
  const handleShare = async () => {
    if (!storedReview) return;

    try {
      const result = await shareRoundReviewWithCoach(storedReview.id);

      if (result.success) {
        setStoredReview(prev => prev ? { ...prev, shared_with_coach: true, shared_at: new Date().toISOString() } : null);
        addToast({
          type: 'success',
          title: 'Shared with Coach',
          description: 'Your coach can now view this round review.',
        });
      } else {
        addToast({
          type: 'error',
          title: 'Share Failed',
          description: result.error ?? 'Could not share review.',
        });
      }
    } catch {
      addToast({
        type: 'error',
        title: 'Share Failed',
        description: 'An unexpected error occurred.',
      });
    }
  };

  // Loading state
  const isLoading = loadingRound || loadingStoredReview || generatingReview || v1Loading || v1Generating;

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <div className="h-5 w-28 bg-warm-100 rounded-lg skeleton-shimmer" />
          <div className="h-5 w-20 bg-warm-100 rounded-lg skeleton-shimmer" />
        </div>
        <div className="space-y-4">
          <div className="rounded-2xl border border-warm-100 overflow-hidden">
            <div className="bg-gradient-to-br from-primary-600/20 to-primary-700/10 px-6 pt-6 pb-5">
              <div className="flex flex-col items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-warm-200/60 skeleton-shimmer" />
                <div className="h-5 w-32 bg-warm-200/40 rounded-lg skeleton-shimmer" />
                <div className="h-10 w-20 bg-warm-200/40 rounded-lg skeleton-shimmer" />
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-3 gap-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="text-center p-3 rounded-xl bg-warm-50/80 border border-warm-100">
                    <div className="h-6 w-10 bg-warm-200/60 rounded mx-auto mb-1 skeleton-shimmer" />
                    <div className="h-3 w-12 bg-warm-100 rounded mx-auto skeleton-shimmer" />
                  </div>
                ))}
              </div>
              <div className="space-y-3">
                <div className="h-4 w-24 bg-warm-100 rounded skeleton-shimmer" />
                <div className="h-16 bg-warm-50 rounded-xl border border-warm-100 skeleton-shimmer" />
                <div className="h-16 bg-warm-50 rounded-xl border border-warm-100 skeleton-shimmer" />
              </div>
            </div>
          </div>
          <p className="text-sm text-warm-500 font-medium text-center">
            {generatingReview || v1Generating ? (
              <span className="flex items-center justify-center gap-2">
                <IconSparkles size={16} className="text-purple-500" />
                {isV2Enabled ? 'Running CoachHelm analysis...' : 'Analyzing your round...'}
              </span>
            ) : (
              'Loading review...'
            )}
          </p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="text-center py-20">
          <p className="text-red-500 mb-4">{error}</p>
          <button
            onClick={() => generateReview()}
            className="px-5 py-3 min-h-[48px] bg-primary-600 text-white rounded-xl hover:bg-primary-700 active:scale-95 transition-all flex items-center gap-2 mx-auto font-medium"
          >
            <IconRefresh size={16} />
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // No data state
  if (!round) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="text-center py-20">
          <p className="text-warm-500">Round not found</p>
          <Link
            href="/golf/dashboard/rounds"
            className="text-primary-600 hover:text-primary-700 text-sm mt-2 inline-block"
          >
            Back to Rounds
          </Link>
        </div>
      </div>
    );
  }

  // Calculate stats for comparison
  const girPct = round.total_gir !== null && round.total_gir_possible
    ? Math.round((round.total_gir / round.total_gir_possible) * 100)
    : null;
  const firPct = round.total_fairways_hit !== null && round.total_fairways
    ? Math.round((round.total_fairways_hit / round.total_fairways) * 100)
    : null;
  // Note: scramble percentage not available at round level - would need hole-level data
  const scramblePct = null;

  return (
    <m.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="pb-[calc(var(--golf-mobile-bottom-nav-offset)+1rem)] lg:pb-6"
    >
      {/* Header */}
      <MobileNavHeader
        title="Round Review"
        subtitle={round.course_name ?? undefined}
        backHref="/golf/dashboard/rounds"
        backLabel="Rounds"
      >
        {isV2Enabled && v2Review && (
          <span className="hidden sm:flex items-center gap-1.5 text-xs px-2 py-1 bg-gradient-to-r from-purple-100 to-blue-100 text-purple-700 rounded-full font-medium">
            <IconSparkles size={12} />
            CoachHelm AI
          </span>
        )}
        <button
          onClick={() => generateReview()}
          disabled={generatingReview}
          className="flex items-center gap-1.5 px-3 py-2.5 min-h-[44px] text-xs font-medium text-warm-600 hover:text-warm-900 hover:bg-warm-100 active:bg-warm-200 rounded-lg transition-colors"
        >
          <IconRefresh size={14} className={generatingReview ? 'animate-spin' : ''} />
          Refresh
        </button>
      </MobileNavHeader>

      <div className="max-w-2xl mx-auto px-4 py-6">
      {/* Content */}
      <m.div variants={itemVariants} className="space-y-4">
        {/* Primary Review Display - New Component */}
        {storedReview && storedReview.review_content && (
          <RoundReviewDisplay
            review={storedReview.review_content}
            courseName={round.course_name ?? undefined}
            roundDate={round.round_date}
            score={round.total_score ?? undefined}
            scoreToPar={round.score_to_par ?? undefined}
            onShare={handleShare}
            isShared={storedReview.shared_with_coach}
          />
        )}

        {/* Stats Comparison */}
        <RoundStatsComparison
          roundStats={{
            girPct,
            firPct,
            putts: round.total_putts,
            penalties: null, // Not tracked at round level
            scramblePct,
          }}
          playerAvg={playerAvg}
          teamAvg={teamAvg}
        />

        {/* V2 Enhanced Sections (from CoachHelm) */}
        {isV2Enabled && v2Review && (
          <>
            {v2Review.patternsApplied && v2Review.patternsApplied.length > 0 && (
              <V2PatternsSection patterns={v2Review.patternsApplied} />
            )}

            {v2Review.prediction && (
              <V2PredictionCard prediction={v2Review.prediction} />
            )}

            {v2Review.causalInsights && v2Review.causalInsights.length > 0 && (
              <V2CausalInsights insights={v2Review.causalInsights} />
            )}
          </>
        )}

        {/* Legacy V1 Review Components (fallback) */}
        {v1Review && !storedReview?.review_content && (
          <>
            <CompletionCard review={v1Review} />
            <GoalImpactCard impacts={v1Review.goalImpacts} />
            {round.holes && <ReviewScorecard holes={round.holes} />}
            <HighlightsSection highlights={v1Review.highlights} />
            <AreasToReviewSection areas={v1Review.areasToReview} />
            {v1Review.strokesGained && <StrokesGainedSection strokesGained={v1Review.strokesGained} />}
          </>
        )}

        {/* Summary */}
        {isV2Enabled && v2Review ? (
          <V2ReviewSummary review={v2Review} />
        ) : (
          v1Review && !storedReview?.review_content && <ReviewSummary review={v1Review} />
        )}
      </m.div>
      </div>

      {/* Bottom actions */}
      <m.div variants={itemVariants} className="fixed bottom-0 left-0 right-0 z-30 p-4 pb-[var(--golf-mobile-bottom-nav-offset)] bg-gradient-to-t from-white via-white to-transparent lg:relative lg:z-auto lg:bg-none lg:p-0 lg:pb-0 lg:mt-6">
        <div className="max-w-2xl mx-auto flex gap-3">
          <Link
            href={`/golf/dashboard/rounds/${roundId}`}
            className="flex-1 py-3 bg-warm-100 text-warm-700 rounded-xl text-center font-medium hover:bg-warm-200 transition-colors"
          >
            View Full Stats
          </Link>
          <Link
            href="/golf/dashboard/stats"
            className="flex-1 py-3 bg-primary-600 text-white rounded-xl text-center font-medium hover:bg-primary-700 transition-colors"
          >
            View Stats
          </Link>
        </div>
      </m.div>
    </m.div>
  );
}
