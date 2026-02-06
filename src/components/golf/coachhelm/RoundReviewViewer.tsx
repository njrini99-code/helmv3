'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { IconSparkles, IconRefresh, IconAlertCircle } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { useRoundReviewV2 } from '@/hooks/coachhelm/useRoundReviewV2';

// Import existing round review section components
import { HighlightsSection } from './round-review/HighlightsSection';
import { AreasToReviewSection } from './round-review/AreasToReviewSection';
import { V2ReviewSummary } from './round-review/V2ReviewSummary';
import { V2PatternsSection } from './round-review/V2PatternsSection';
import { V2CausalInsights } from './round-review/V2CausalInsights';
import { V2PredictionCard } from './round-review/V2PredictionCard';

interface RoundReviewViewerProps {
  roundId: string;
  isCoach?: boolean;
  className?: string;
}

/**
 * RoundReviewViewer - Displays CoachHelm AI review for a golf round
 *
 * Features:
 * - Generates and caches V2 intelligent reviews
 * - Shows highlights, areas to work on, patterns, causal insights
 * - Displays performance predictions
 * - Loading and error states with graceful fallbacks
 */
export function RoundReviewViewer({ roundId, isCoach, className }: RoundReviewViewerProps) {
  const {
    review,
    v2Review,
    isV2Enabled,
    loading,
    generating,
    error,
    generate,
    needsGeneration,
  } = useRoundReviewV2(roundId, isCoach);

  // Loading state
  if (loading) {
    return (
      <div className={cn('rounded-2xl border border-slate-200 bg-white/70 backdrop-blur-xl p-6', className)}>
        <div className="animate-pulse space-y-4">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 bg-slate-200 rounded-lg" />
            <div className="h-5 w-32 bg-slate-200 rounded" />
          </div>
          <div className="h-24 bg-slate-100 rounded-lg" />
          <div className="h-32 bg-slate-100 rounded-lg" />
        </div>
      </div>
    );
  }

  // Error state
  if (error && !needsGeneration) {
    return (
      <div className={cn('rounded-2xl border border-red-200 bg-red-50 p-6', className)}>
        <div className="flex items-start gap-3">
          <IconAlertCircle size={20} className="text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-medium text-red-900">Unable to load review</h3>
            <p className="text-sm text-red-700 mt-1">{error}</p>
            <Button
              variant="secondary"
              size="sm"
              onClick={generate}
              disabled={generating}
              className="mt-3"
            >
              <IconRefresh size={14} className={cn('mr-2', generating && 'animate-spin')} />
              Try Again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Needs generation state - prompt user to generate
  if (needsGeneration) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn(
          'rounded-2xl border border-dashed border-slate-300 bg-white/50 backdrop-blur-xl p-8',
          className
        )}
      >
        <div className="flex flex-col items-center justify-center text-center">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center mb-4 shadow-lg shadow-green-500/20">
            <IconSparkles size={24} className="text-white" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900 mb-2">
            AI Round Review
          </h3>
          <p className="text-sm text-slate-500 max-w-sm mb-6">
            Get intelligent insights about this round including performance patterns,
            areas to improve, and personalized recommendations.
          </p>
          <Button
            onClick={generate}
            disabled={generating}
            className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700"
          >
            {generating ? (
              <>
                <IconRefresh size={16} className="mr-2 animate-spin" />
                Analyzing Round...
              </>
            ) : (
              <>
                <IconSparkles size={16} className="mr-2" />
                Generate AI Review
              </>
            )}
          </Button>
          {!isV2Enabled && (
            <p className="text-xs text-slate-400 mt-3">
              CoachHelm AI is available for enhanced insights
            </p>
          )}
        </div>
      </motion.div>
    );
  }

  // Generating state overlay
  if (generating) {
    return (
      <div className={cn('rounded-2xl border border-slate-200 bg-white/70 backdrop-blur-xl p-6', className)}>
        <div className="flex flex-col items-center justify-center py-8">
          <div className="relative">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-green-500/20">
              <IconSparkles size={28} className="text-white animate-pulse" />
            </div>
            <div className="absolute -inset-2 bg-green-500/20 rounded-3xl animate-ping" />
          </div>
          <h3 className="text-lg font-medium text-slate-900 mt-6 mb-2">
            Analyzing Round...
          </h3>
          <p className="text-sm text-slate-500 text-center max-w-xs">
            CoachHelm is reviewing your performance, identifying patterns,
            and generating personalized insights.
          </p>
        </div>
      </div>
    );
  }

  // Has review data - show full review
  const hasV2Data = v2Review !== null;
  const hasV1Data = review !== null;

  if (!hasV2Data && !hasV1Data) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn('space-y-4', className)}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl shadow-lg shadow-green-500/20">
            <IconSparkles size={18} className="text-white" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">AI Round Review</h2>
            <p className="text-xs text-slate-500">
              {hasV2Data ? 'CoachHelm V2 Intelligence' : 'CoachHelm Analysis'}
            </p>
          </div>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={generate}
          disabled={generating}
          title="Regenerate review"
        >
          <IconRefresh size={14} className={cn(generating && 'animate-spin')} />
        </Button>
      </div>

      <AnimatePresence mode="wait">
        {/* V2 Review Content */}
        {hasV2Data && v2Review && (
          <motion.div
            key="v2-review"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-4"
          >
            {/* V2 Summary */}
            <V2ReviewSummary review={v2Review} />

            {/* Patterns Section */}
            {v2Review.patternsApplied && v2Review.patternsApplied.length > 0 && (
              <V2PatternsSection patterns={v2Review.patternsApplied} />
            )}

            {/* Prediction Card */}
            {v2Review.prediction && (
              <V2PredictionCard prediction={v2Review.prediction} />
            )}

            {/* Causal Insights */}
            {v2Review.causalInsights && v2Review.causalInsights.length > 0 && (
              <V2CausalInsights insights={v2Review.causalInsights} />
            )}
          </motion.div>
        )}

        {/* V1 Review Content (fallback when V2 not available) */}
        {!hasV2Data && hasV1Data && review && (
          <motion.div
            key="v1-review"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-4"
          >
            {/* Summary Card */}
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <h3 className="text-sm font-semibold text-slate-900 mb-3">Summary</h3>
              <p className="text-sm text-slate-600 leading-relaxed">{review.summary}</p>

              {review.primaryTakeaway && (
                <div className="mt-4 p-3 bg-green-50 rounded-lg border border-green-100">
                  <p className="text-sm font-medium text-green-900">
                    Key Takeaway: {review.primaryTakeaway}
                  </p>
                </div>
              )}

              {review.nextPracticePriority && (
                <div className="mt-3 p-3 bg-amber-50 rounded-lg border border-amber-100">
                  <p className="text-sm text-amber-900">
                    <span className="font-medium">Practice Focus:</span> {review.nextPracticePriority}
                  </p>
                </div>
              )}
            </div>

            {/* Highlights */}
            {review.highlights && review.highlights.length > 0 && (
              <HighlightsSection highlights={review.highlights} />
            )}

            {/* Areas to Review */}
            {review.areasToReview && review.areasToReview.length > 0 && (
              <AreasToReviewSection areas={review.areasToReview} />
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* CSS for animations */}
      <style jsx global>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </motion.div>
  );
}
