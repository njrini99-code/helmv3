'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import { useRoundReviewV2 } from '@/hooks/coachhelm/useRoundReviewV2';
import { useToast } from '@/components/ui/toast';
import {
  CompletionCard,
  GoalImpactCard,
  ReviewScorecard,
  HighlightsSection,
  AreasToReviewSection,
  StrokesGainedSection,
  ReviewSummary,
  // V2 Components
  V2PatternsSection,
  V2PredictionCard,
  V2CausalInsights,
  V2ReviewSummary,
} from '@/components/golf/coachhelm/round-review';
import Link from 'next/link';
import { IconSparkles } from '@/components/icons';

export default function RoundReviewPage() {
  const params = useParams();
  const { addToast } = useToast();
  const roundId = params.id as string;

  const [round, setRound] = useState<Record<string, unknown> | null>(null);
  const [loadingRound, setLoadingRound] = useState(true);

  const {
    review,
    v2Review,
    isV2Enabled,
    loading,
    generating,
    error,
    generate,
    shareWithCoach,
    needsGeneration
  } = useRoundReviewV2(roundId);

  const supabase = createClient();

  // Fetch round data (for scorecard)
  useEffect(() => {
    async function fetchRound() {
      const { data } = await supabase
        .from('golf_rounds')
        .select('*, holes:golf_holes(*)')
        .eq('id', roundId)
        .single();

      if (data) {
        // Sort holes by hole_number
        const roundData = data as Record<string, unknown>;
        const holes = roundData.holes as Array<{ 
          hole_number: number; 
          score: number | null; 
          par: number | null;
        }>;
        roundData.holes = holes?.sort((a, b) => a.hole_number - b.hole_number);
        setRound(roundData);
      }
      setLoadingRound(false);
    }

    fetchRound();
  }, [roundId, supabase]);

  // Auto-generate if needed
  useEffect(() => {
    if (needsGeneration && !generating) {
      generate();
    }
  }, [needsGeneration, generating, generate]);

  // Handle share
  async function handleShare() {
    const success = await shareWithCoach();
    if (success) {
      addToast({
        type: 'success',
        title: 'Shared with coach',
        description: 'Your coach can now view this round review.'
      });
    }
  }

  // Loading state
  if (loading || loadingRound || generating) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="flex flex-col items-center justify-center py-20">
          <div className="relative mb-4">
            <div className="w-12 h-12 border-2 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
            <div className="absolute inset-0 w-12 h-12 border-2 border-transparent border-t-primary-400 rounded-full animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1s' }} />
          </div>
          <p className="text-sm text-slate-500 font-medium">
            {generating ? (
              <span className="flex items-center gap-2">
                <IconSparkles size={16} className="text-purple-500" />
                {isV2Enabled ? 'Running V2 AI analysis...' : 'Analyzing your round...'}
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
          <p className="text-red-500 mb-4">Failed to load review: {error}</p>
          <button
            onClick={() => generate()}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (!review && !v2Review) {
    return null;
  }

  const holes = round?.holes as Array<{ 
    hole_number: number; 
    score: number | null; 
    par: number | null;
  }> | undefined;

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="max-w-2xl mx-auto px-4 py-6 pb-24"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <Link
          href="/golf/dashboard/rounds"
          className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Rounds
        </Link>

        <div className="flex items-center gap-3">
          {/* V2 Badge */}
          {isV2Enabled && v2Review && (
            <span className="flex items-center gap-1.5 text-xs px-2 py-1 bg-gradient-to-r from-purple-100 to-blue-100 text-purple-700 rounded-full font-medium">
              <IconSparkles size={12} />
              V2 AI
            </span>
          )}

          {review && !review.sharedWithCoach && (
            <button
              onClick={handleShare}
              className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
              Share with Coach
            </button>
          )}

          {review?.sharedWithCoach && (
            <span className="flex items-center gap-1.5 text-sm text-green-600">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Shared with Coach
            </span>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="space-y-4">
        {/* Completion Card - always show if review exists */}
        {review && <CompletionCard review={review} />}

        {/* V2 Enhanced Sections */}
        {isV2Enabled && v2Review && (
          <>
            {/* V2 Pattern Analysis */}
            {v2Review.patternsApplied && v2Review.patternsApplied.length > 0 && (
              <V2PatternsSection patterns={v2Review.patternsApplied} />
            )}

            {/* V2 Prediction */}
            {v2Review.prediction && (
              <V2PredictionCard prediction={v2Review.prediction} />
            )}

            {/* V2 Causal Insights */}
            {v2Review.causalInsights && v2Review.causalInsights.length > 0 && (
              <V2CausalInsights insights={v2Review.causalInsights} />
            )}
          </>
        )}

        {/* Standard V1 Sections */}
        {review && (
          <>
            <GoalImpactCard impacts={review.goalImpacts} />

            {holes && <ReviewScorecard holes={holes} />}

            <HighlightsSection highlights={review.highlights} />

            <AreasToReviewSection areas={review.areasToReview} />

            {review.strokesGained && <StrokesGainedSection strokesGained={review.strokesGained} />}
          </>
        )}

        {/* Summary - V2 or V1 */}
        {isV2Enabled && v2Review ? (
          <V2ReviewSummary review={v2Review} />
        ) : (
          review && <ReviewSummary review={review} />
        )}
      </div>

      {/* Bottom actions */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-white via-white to-transparent lg:relative lg:bg-none lg:p-0 lg:mt-6">
        <div className="max-w-2xl mx-auto flex gap-3">
          <Link
            href={`/golf/dashboard/rounds/${roundId}`}
            className="flex-1 py-3 bg-slate-100 text-slate-700 rounded-xl text-center font-medium hover:bg-slate-200 transition-colors"
          >
            View Full Stats
          </Link>
          <Link
            href="/golf/dashboard/stats"
            className="flex-1 py-3 bg-green-600 text-white rounded-xl text-center font-medium hover:bg-green-700 transition-colors"
          >
            View Stats
          </Link>
        </div>
      </div>
    </motion.div>
  );
}
