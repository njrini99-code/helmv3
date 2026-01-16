'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  IconSparkles,
  IconCheck,
  IconStar,
  IconTarget,
  IconChevronDown,
  IconCalendar,
  IconUser,
  IconRefresh,
  IconAlertCircle,
} from '@/components/icons';
import { ReviewInsightCard } from './ReviewInsightCard';
import type {
  EnhancedRoundReview,
  ReviewInsight,
} from '@/lib/coachhelm/review-types';
import {
  getReviewByRoundId,
  markReviewViewedByPlayer,
  acknowledgeReview,
} from '@/app/golf/actions/round-reviews';
import { INSIGHT_TYPE_CONFIG, SEVERITY_CONFIG } from '@/lib/coachhelm/review-types';

// ============================================================================
// TYPES
// ============================================================================

interface RoundReviewPlayerViewProps {
  roundId: string;
  className?: string;
}

// ============================================================================
// LOADING SKELETON
// ============================================================================

function LoadingSkeleton() {
  return (
    <div className="bg-white/70 backdrop-blur-xl border border-white/30 rounded-2xl p-6 animate-pulse">
      <div className="flex items-center gap-3 mb-4">
        <div className="h-10 w-10 bg-warm-200 rounded-xl" />
        <div className="space-y-2">
          <div className="h-4 w-32 bg-warm-200 rounded" />
          <div className="h-3 w-24 bg-warm-100 rounded" />
        </div>
      </div>
      <div className="h-24 bg-warm-100 rounded-lg mb-4" />
      <div className="h-32 bg-warm-100 rounded-lg" />
    </div>
  );
}

// ============================================================================
// EMPTY STATE
// ============================================================================

function EmptyState({ roundId, onGenerate, generating }: {
  roundId: string;
  onGenerate?: () => void;
  generating?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white/50 backdrop-blur-xl border border-dashed border-warm-300 rounded-2xl p-8"
    >
      <div className="flex flex-col items-center justify-center text-center">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary-500 to-emerald-600 flex items-center justify-center mb-4 shadow-lg shadow-primary-500/20">
          <IconSparkles size={24} className="text-white" />
        </div>
        <h3 className="text-lg font-semibold text-warm-900 mb-2">
          AI Round Review
        </h3>
        <p className="text-sm text-warm-500 max-w-sm mb-6">
          Get intelligent insights about this round including performance patterns,
          areas to improve, and personalized recommendations.
        </p>
        {onGenerate && (
          <Button
            onClick={onGenerate}
            disabled={generating}
            className="bg-gradient-to-r from-primary-600 to-emerald-600"
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
        )}
      </div>
    </motion.div>
  );
}

// ============================================================================
// ERROR STATE
// ============================================================================

function ErrorState({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-2xl p-6">
      <div className="flex items-start gap-3">
        <IconAlertCircle size={20} className="text-red-500 flex-shrink-0 mt-0.5" />
        <div>
          <h3 className="text-sm font-medium text-red-900">Unable to load review</h3>
          <p className="text-sm text-red-700 mt-1">{error}</p>
          {onRetry && (
            <Button
              variant="secondary"
              size="sm"
              onClick={onRetry}
              className="mt-3"
            >
              <IconRefresh size={14} className="mr-2" />
              Try Again
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// COACH NOTES DISPLAY
// ============================================================================

interface CoachNotesDisplayProps {
  notes: string;
  rating: number | null;
  publishedAt: string | null;
}

function CoachNotesDisplay({ notes, rating, publishedAt }: CoachNotesDisplayProps) {
  return (
    <div className="bg-primary-50 border border-primary-100 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <IconUser size={16} className="text-primary-600" />
        <span className="text-sm font-medium text-primary-900">Coach&apos;s Notes</span>
        {rating !== null && (
          <div className="flex items-center gap-1 ml-auto">
            {Array.from({ length: 5 }).map((_, i) => (
              <IconStar
                key={i}
                size={14}
                className={cn(
                  i < rating ? 'text-amber-500 fill-current' : 'text-warm-300'
                )}
              />
            ))}
          </div>
        )}
      </div>
      <p className="text-sm text-primary-800">{notes}</p>
      {publishedAt && (
        <p className="text-xs text-primary-600 mt-3 flex items-center gap-1">
          <IconCalendar size={12} />
          Reviewed on {new Date(publishedAt).toLocaleDateString()}
        </p>
      )}
    </div>
  );
}

// ============================================================================
// REVIEW SUMMARY
// ============================================================================

interface ReviewSummaryProps {
  review: EnhancedRoundReview;
}

function ReviewSummary({ review }: ReviewSummaryProps) {
  return (
    <div className="bg-white rounded-xl border border-warm-200 p-5">
      <h3 className="text-sm font-semibold text-warm-900 mb-3">Summary</h3>
      <p className="text-sm text-warm-600 leading-relaxed">{review.summary}</p>

      {review.primaryTakeaway && (
        <div className="mt-4 p-3 bg-primary-50 rounded-lg border border-primary-100">
          <p className="text-sm font-medium text-primary-900">
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
  );
}

// ============================================================================
// INSIGHTS SECTION
// ============================================================================

interface InsightsSectionProps {
  insights: ReviewInsight[];
}

function InsightsSection({ insights }: InsightsSectionProps) {
  const [showAll, setShowAll] = useState(false);

  // Filter out hidden insights and sort by highlighted first
  const visibleInsights = insights
    .filter((i) => !i.isHidden)
    .sort((a, b) => {
      if (a.isHighlighted && !b.isHighlighted) return -1;
      if (!a.isHighlighted && b.isHighlighted) return 1;
      return a.displayOrder - b.displayOrder;
    });

  const highlightedInsights = visibleInsights.filter((i) => i.isHighlighted);
  const otherInsights = visibleInsights.filter((i) => !i.isHighlighted);

  const displayedInsights = showAll
    ? visibleInsights
    : highlightedInsights.length > 0
      ? highlightedInsights
      : visibleInsights.slice(0, 3);

  const hasMore = visibleInsights.length > displayedInsights.length;

  return (
    <div className="space-y-4">
      {/* Highlighted insights section */}
      {highlightedInsights.length > 0 && !showAll && (
        <div>
          <h4 className="text-sm font-medium text-warm-700 mb-3 flex items-center gap-2">
            <IconStar size={14} className="text-amber-500" />
            Coach Highlights
          </h4>
          <div className="space-y-3">
            {highlightedInsights.map((insight) => (
              <ReviewInsightCard
                key={insight.id}
                insight={insight}
                isCoach={false}
              />
            ))}
          </div>
        </div>
      )}

      {/* All insights when expanded */}
      {showAll && (
        <div className="space-y-3">
          {visibleInsights.map((insight) => (
            <ReviewInsightCard
              key={insight.id}
              insight={insight}
              isCoach={false}
            />
          ))}
        </div>
      )}

      {/* Show more button */}
      {hasMore && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="w-full py-2 text-sm font-medium text-primary-600 hover:text-primary-700 flex items-center justify-center gap-1"
        >
          {showAll ? 'Show Less' : `Show ${otherInsights.length} More Insights`}
          <IconChevronDown
            size={16}
            className={cn('transition-transform', showAll && 'rotate-180')}
          />
        </button>
      )}
    </div>
  );
}

// ============================================================================
// ACTION ITEMS
// ============================================================================

interface ActionItemsProps {
  items: EnhancedRoundReview['actionItems'];
}

function ActionItems({ items }: ActionItemsProps) {
  if (!items || items.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-warm-200 p-5">
      <h3 className="text-sm font-semibold text-warm-900 mb-3 flex items-center gap-2">
        <IconTarget size={16} className="text-primary-600" />
        Action Items
      </h3>
      <ul className="space-y-2">
        {items.map((item) => (
          <li
            key={item.id}
            className={cn(
              'flex items-start gap-2 text-sm',
              item.completed && 'line-through text-warm-400'
            )}
          >
            <div className={cn(
              'w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5',
              item.completed ? 'bg-green-100 text-green-600' : 'bg-warm-100 text-warm-400'
            )}>
              {item.completed ? <IconCheck size={12} /> : <span className="w-2 h-2 rounded-full bg-current" />}
            </div>
            <div>
              <p className="font-medium text-warm-800">{item.title}</p>
              {item.description && (
                <p className="text-warm-500 text-xs mt-0.5">{item.description}</p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ============================================================================
// ACKNOWLEDGMENT CTA
// ============================================================================

interface AcknowledgmentCTAProps {
  review: EnhancedRoundReview;
  onAcknowledge: () => Promise<void>;
  loading?: boolean;
}

function AcknowledgmentCTA({ review, onAcknowledge, loading }: AcknowledgmentCTAProps) {
  if (review.playerAcknowledgedAt) {
    return (
      <div className="flex items-center justify-center gap-2 py-3 bg-green-50 border border-green-100 rounded-lg">
        <IconCheck size={16} className="text-green-600" />
        <span className="text-sm font-medium text-green-700">
          Acknowledged on {new Date(review.playerAcknowledgedAt).toLocaleDateString()}
        </span>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-r from-primary-50 to-emerald-50 border border-primary-100 rounded-xl p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-primary-900">
            Ready to work on these insights?
          </p>
          <p className="text-xs text-primary-600 mt-0.5">
            Let your coach know you&apos;ve reviewed this feedback
          </p>
        </div>
        <Button onClick={onAcknowledge} disabled={loading} size="sm">
          {loading ? (
            <IconRefresh size={14} className="mr-1.5 animate-spin" />
          ) : (
            <IconCheck size={14} className="mr-1.5" />
          )}
          Acknowledge
        </Button>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function RoundReviewPlayerView({ roundId, className }: RoundReviewPlayerViewProps) {
  const [review, setReview] = useState<EnhancedRoundReview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acknowledging, setAcknowledging] = useState(false);

  // Fetch review on mount
  useEffect(() => {
    async function fetchReview() {
      setLoading(true);
      setError(null);

      const result = await getReviewByRoundId(roundId);

      if (!result.success) {
        setError(result.error || 'Failed to load review');
      } else {
        setReview(result.data || null);

        // Mark as viewed if it's a published review
        if (result.data && result.data.status === 'published' && !result.data.playerViewedAt) {
          await markReviewViewedByPlayer(result.data.id);
        }
      }

      setLoading(false);
    }

    fetchReview();
  }, [roundId]);

  const handleAcknowledge = useCallback(async () => {
    if (!review) return;

    setAcknowledging(true);
    try {
      const result = await acknowledgeReview(review.id);
      if (result.success) {
        setReview((prev) =>
          prev ? { ...prev, playerAcknowledgedAt: new Date().toISOString() } : null
        );
      }
    } finally {
      setAcknowledging(false);
    }
  }, [review]);

  // Loading state
  if (loading) {
    return <LoadingSkeleton />;
  }

  // Error state
  if (error) {
    return <ErrorState error={error} />;
  }

  // No review or draft review (not yet published)
  if (!review || review.status === 'draft') {
    return (
      <EmptyState
        roundId={roundId}
      />
    );
  }

  // Published review
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn('space-y-4', className)}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-primary-500 to-emerald-600 rounded-xl shadow-lg shadow-primary-500/20">
            <IconSparkles size={18} className="text-white" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-warm-900">Coach&apos;s Review</h2>
            <p className="text-xs text-warm-500">
              Published {review.publishedAt && new Date(review.publishedAt).toLocaleDateString()}
            </p>
          </div>
        </div>
      </div>

      {/* Coach notes (if any) */}
      {review.coachNotes && (
        <CoachNotesDisplay
          notes={review.coachNotes}
          rating={review.coachRating}
          publishedAt={review.publishedAt}
        />
      )}

      {/* Summary */}
      <ReviewSummary review={review} />

      {/* Insights */}
      {review.insights && review.insights.length > 0 && (
        <InsightsSection insights={review.insights} />
      )}

      {/* Action items */}
      <ActionItems items={review.actionItems} />

      {/* Acknowledgment CTA */}
      <AcknowledgmentCTA
        review={review}
        onAcknowledge={handleAcknowledge}
        loading={acknowledging}
      />
    </motion.div>
  );
}

export default RoundReviewPlayerView;
