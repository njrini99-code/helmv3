'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import {
  IconSparkles,
  IconRefresh,
  IconAlertCircle,
  IconChartBar,
  IconTrendingUp,
  IconTarget,
  IconWarning,
} from '@/components/icons';
import { Button } from '@/components/ui/button';
import { useRoundReviewV2 } from '@/hooks/coachhelm/useRoundReviewV2';

// Import existing round review section components for V2
import { V2ReviewSummary } from './round-review/V2ReviewSummary';
import { V2PatternsSection } from './round-review/V2PatternsSection';
import { V2CausalInsights } from './round-review/V2CausalInsights';
import { V2PredictionCard } from './round-review/V2PredictionCard';

interface RoundReviewViewerProps {
  roundId: string;
  isCoach?: boolean;
  className?: string;
}

// Grade color mapping
const gradeColors: Record<string, { bg: string; text: string; border: string }> = {
  A: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  B: { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200' },
  C: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  D: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
  F: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
};

// Sentiment color dot
const sentimentColor: Record<string, string> = {
  positive: 'bg-green-500',
  neutral: 'bg-amber-400',
  challenging: 'bg-red-500',
};

/**
 * RoundReviewViewer - Displays AI/rule-based review for a golf round
 *
 * Supports:
 * - Rule-based reviews (always available)
 * - CoachHelm V2 intelligent reviews (when enabled)
 * - Loading and error states with graceful fallbacks
 */
export function RoundReviewViewer({ roundId, isCoach, className }: RoundReviewViewerProps) {
  const {
    review,
    ruleBasedContent,
    v2Review,
    loading,
    generating,
    error,
    generate,
    needsGeneration,
  } = useRoundReviewV2(roundId, isCoach);

  // Loading state
  if (loading) {
    return (
      <div className={cn('rounded-2xl border border-warm-200 bg-white/70 backdrop-blur-xl p-6', className)}>
        <div className="animate-pulse space-y-4">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 bg-warm-200 rounded-lg" />
            <div className="h-5 w-32 bg-warm-200 rounded" />
          </div>
          <div className="h-24 bg-warm-100 rounded-lg" />
          <div className="h-32 bg-warm-100 rounded-lg" />
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
          'rounded-2xl border border-dashed border-warm-300 bg-white/50 backdrop-blur-xl p-8',
          className
        )}
      >
        <div className="flex flex-col items-center justify-center text-center">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center mb-4 shadow-lg shadow-green-500/20">
            <IconSparkles size={24} className="text-white" />
          </div>
          <h3 className="text-lg font-semibold text-warm-900 mb-2">
            AI Round Review
          </h3>
          <p className="text-sm text-warm-500 max-w-sm mb-6">
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
          {error && (
            <p className="text-xs text-red-500 mt-3">{error}</p>
          )}
        </div>
      </motion.div>
    );
  }

  // Generating state overlay
  if (generating) {
    return (
      <div className={cn('rounded-2xl border border-warm-200 bg-white/70 backdrop-blur-xl p-6', className)}>
        <div className="flex flex-col items-center justify-center py-8">
          <div className="relative">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-green-500/20">
              <IconSparkles size={28} className="text-white animate-pulse" />
            </div>
            <div className="absolute -inset-2 bg-green-500/20 rounded-3xl animate-ping" />
          </div>
          <h3 className="text-lg font-medium text-warm-900 mt-6 mb-2">
            Analyzing Round...
          </h3>
          <p className="text-sm text-warm-500 text-center max-w-xs">
            Reviewing your performance, identifying patterns,
            and generating personalized insights.
          </p>
        </div>
      </div>
    );
  }

  // Has review data - show full review
  const hasV2Data = v2Review !== null;
  const hasRuleBasedData = ruleBasedContent !== null;
  const hasV1Data = review !== null;

  if (!hasV2Data && !hasRuleBasedData && !hasV1Data) {
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
            <h2 className="text-lg font-semibold text-warm-900">AI Round Review</h2>
            <p className="text-xs text-warm-500">
              {hasV2Data ? 'CoachHelm Intelligence' : 'Performance Analysis'}
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
        {/* V2 Review Content (when CoachHelm AI is available) */}
        {hasV2Data && v2Review && (
          <motion.div
            key="v2-review"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-4"
          >
            <V2ReviewSummary review={v2Review} />
            {v2Review.patternsApplied && v2Review.patternsApplied.length > 0 && (
              <V2PatternsSection patterns={v2Review.patternsApplied} />
            )}
            {v2Review.prediction && (
              <V2PredictionCard prediction={v2Review.prediction} />
            )}
            {v2Review.causalInsights && v2Review.causalInsights.length > 0 && (
              <V2CausalInsights insights={v2Review.causalInsights} />
            )}
          </motion.div>
        )}

        {/* Rule-based Review Content (primary display for non-V2) */}
        {!hasV2Data && hasRuleBasedData && ruleBasedContent && (
          <motion.div
            key="rule-based-review"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-4"
          >
            {/* Grade + Summary Card */}
            <div className="rounded-xl border border-warm-200 bg-white p-5">
              <div className="flex items-start gap-4">
                {/* Grade badge */}
                <div className={cn(
                  'flex-shrink-0 w-14 h-14 rounded-xl flex items-center justify-center border-2',
                  gradeColors[ruleBasedContent.overallGrade]?.bg ?? 'bg-warm-50',
                  gradeColors[ruleBasedContent.overallGrade]?.text ?? 'text-warm-600',
                  gradeColors[ruleBasedContent.overallGrade]?.border ?? 'border-warm-200',
                )}>
                  <span className="text-2xl font-bold">{ruleBasedContent.overallGrade}</span>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={cn(
                      'w-2.5 h-2.5 rounded-full',
                      sentimentColor[ruleBasedContent.sentiment] ?? 'bg-warm-300',
                    )} />
                    <span className="text-xs font-medium text-warm-500 capitalize">
                      {ruleBasedContent.sentiment} round
                    </span>
                  </div>
                  <p className="text-sm text-warm-700 leading-relaxed">
                    {ruleBasedContent.summary}
                  </p>
                </div>
              </div>
            </div>

            {/* Key Stats */}
            {ruleBasedContent.keyStats && ruleBasedContent.keyStats.length > 0 && (
              <div
                className="rounded-xl border border-warm-200 bg-white p-5"
                style={{ animation: 'fadeInUp 0.5s ease-out 0.2s both' }}
              >
                <h3 className="text-sm font-semibold text-warm-900 mb-4 flex items-center gap-2">
                  <IconChartBar size={18} className="text-warm-500" />
                  Key Stats
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {ruleBasedContent.keyStats.map((stat, i) => (
                    <div
                      key={i}
                      className={cn(
                        'p-3 rounded-lg border',
                        stat.comparison === 'above' && 'bg-green-50 border-green-100',
                        stat.comparison === 'below' && 'bg-red-50 border-red-100',
                        stat.comparison === 'average' && 'bg-warm-50 border-warm-100',
                      )}
                    >
                      <p className="text-xs font-medium text-warm-500">{stat.label}</p>
                      <p className="text-lg font-semibold text-warm-900 mt-0.5">{stat.value}</p>
                      <p className={cn(
                        'text-xs font-medium mt-0.5',
                        stat.comparison === 'above' && 'text-green-600',
                        stat.comparison === 'below' && 'text-red-600',
                        stat.comparison === 'average' && 'text-warm-400',
                      )}>
                        {stat.comparison === 'above' ? '↑ Above avg' :
                         stat.comparison === 'below' ? '↓ Below avg' :
                         '— Average'}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Highlights */}
            {ruleBasedContent.highlights && ruleBasedContent.highlights.length > 0 && (
              <div
                className="rounded-xl border border-warm-200 bg-white p-5"
                style={{ animation: 'fadeInUp 0.5s ease-out 0.3s both' }}
              >
                <h3 className="text-sm font-semibold text-warm-900 mb-4 flex items-center gap-2">
                  <IconTrendingUp size={18} className="text-green-600" />
                  Highlights
                </h3>
                <div className="space-y-3">
                  {ruleBasedContent.highlights.map((highlight, index) => (
                    <div
                      key={index}
                      className="flex items-start gap-3 p-3 rounded-xl bg-gradient-to-r from-green-50 to-white border border-green-100"
                      style={{
                        animation: `fadeInUp 0.4s ease-out ${300 + index * 80}ms both`,
                      }}
                    >
                      <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center">
                        <IconTrendingUp size={16} className="text-green-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="font-medium text-warm-900">{highlight.title}</span>
                        <p className="text-sm text-warm-600 mt-0.5">{highlight.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Areas for Improvement */}
            {ruleBasedContent.areasForImprovement && ruleBasedContent.areasForImprovement.length > 0 && (
              <div
                className="rounded-xl border border-warm-200 bg-white p-5"
                style={{ animation: 'fadeInUp 0.5s ease-out 0.4s both' }}
              >
                <h3 className="text-sm font-semibold text-warm-900 mb-4 flex items-center gap-2">
                  <IconTarget size={18} className="text-amber-600" />
                  Areas to Work On
                </h3>
                <div className="space-y-3">
                  {ruleBasedContent.areasForImprovement.map((area, index) => (
                    <div
                      key={index}
                      className="p-4 rounded-xl bg-amber-50 border-l-4 border-l-amber-500"
                      style={{
                        animation: `fadeInUp 0.4s ease-out ${400 + index * 80}ms both`,
                      }}
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
                          <IconWarning size={16} className="text-amber-600" />
                        </div>
                        <div className="flex-1">
                          <span className="font-medium text-warm-900">{area.area}</span>
                          <p className="text-sm text-warm-600 mt-1">{area.recommendation}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recommendations */}
            {ruleBasedContent.recommendations && ruleBasedContent.recommendations.length > 0 && (
              <div
                className="rounded-xl border border-warm-200 bg-white p-5"
                style={{ animation: 'fadeInUp 0.5s ease-out 0.5s both' }}
              >
                <h3 className="text-sm font-semibold text-warm-900 mb-4 flex items-center gap-2">
                  <IconSparkles size={18} className="text-green-600" />
                  Recommendations
                </h3>
                <div className="space-y-2">
                  {ruleBasedContent.recommendations.map((rec, index) => (
                    <div
                      key={index}
                      className="flex items-start gap-3 p-3 rounded-lg bg-warm-50"
                      style={{
                        animation: `fadeInUp 0.4s ease-out ${500 + index * 80}ms both`,
                      }}
                    >
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-xs font-semibold">
                        {index + 1}
                      </span>
                      <p className="text-sm text-warm-700">{rec}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* Fallback V1 Review Content (from existing database reviews loaded on fetch) */}
        {!hasV2Data && !hasRuleBasedData && hasV1Data && review && (
          <motion.div
            key="v1-review"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-4"
          >
            {/* Summary Card */}
            <div className="rounded-xl border border-warm-200 bg-white p-5">
              <h3 className="text-sm font-semibold text-warm-900 mb-3">Summary</h3>
              <p className="text-sm text-warm-600 leading-relaxed">{review.summary}</p>

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
